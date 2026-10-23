import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { TFile } from 'obsidian'
import type { App } from 'obsidian'
import { QueryValidator, type QueryValidatorHost } from './query-validator'

beforeAll(() => {
    // Obsidian global, absent under Bun
    ;(self as unknown as { sleep: (ms: number) => Promise<void> }).sleep = () => Promise.resolve()
})

const createFile = (path: string): TFile => {
    const name = path.split('/').pop() ?? path
    return Object.assign(new TFile(), {
        path,
        name,
        basename: name.replace(/\.md$/, ''),
        extension: 'md'
    })
}

/** A tiny in-memory vault: note contents plus folders */
const createHost = (notes: Record<string, string>, overrides: Partial<QueryValidatorHost> = {}) => {
    const contents = new Map(Object.entries(notes))
    const files = new Map([...contents.keys()].map((path) => [path, createFile(path)]))
    const folders = new Set(['People', 'Goals'])

    const app = {
        vault: {
            getMarkdownFiles: () => [...files.values()],
            getFileByPath: (path: string) => files.get(path) ?? null,
            getAbstractFileByPath: (path: string) =>
                files.get(path) ?? (folders.has(path) ? { path } : null),
            cachedRead: (file: TFile) => Promise.resolve(contents.get(file.path) ?? ''),
            process: (file: TFile, fn: (data: string) => string) => {
                const next = fn(contents.get(file.path) ?? '')
                contents.set(file.path, next)
                return Promise.resolve(next)
            }
        },
        metadataCache: {
            getFirstLinkpathDest: (linkpath: string) =>
                [...files.values()].find(
                    (file) => file.basename.toLowerCase() === linkpath.toLowerCase()
                ) ?? null
        }
    } as unknown as App

    const beforeWrite = mock(() => {})
    const afterFix = mock(() => Promise.resolve())
    const host: QueryValidatorHost = {
        app,
        getDataviewApi: () => undefined,
        getFoldersToScan: () => [],
        isNoteExcluded: () => false,
        isWritingBlocked: () => false,
        beforeWrite,
        afterFix,
        ...overrides
    }
    return { host, contents, beforeWrite, afterFix }
}

const notes = {
    'People/Alice.md': '<!-- QueryToSerialize: LIST FROM [[Alice]] AND [[Gone]] -->',
    'Goals/Goal.md':
        '<!-- QueryToSerialize: LIST FROM "Goals" -->\n<!-- IQ: =this.x --><!-- /IQ -->',
    'Plain.md': 'no queries'
}

describe('QueryValidator.validate', () => {
    it('reports problems per note with totals', async () => {
        const { host } = createHost(notes)
        const progress: number[] = []
        const report = await new QueryValidator(host).validate({
            onProgress: (processed) => progress.push(processed)
        })

        expect(report.notesScanned).toBe(3)
        expect(report.queriesScanned).toBe(3)
        expect(report.ranQueries).toBe(false)
        expect(report.problemCount).toBe(2)
        expect(report.notes.map((note) => note.path)).toEqual(['People/Alice.md'])
        expect(report.notes[0]?.issues[0]?.problems.map((p) => p.type)).toEqual([
            'unresolved-link',
            'self-reference'
        ])
        expect(progress.at(-1)).toBe(3)
    })

    it('respects exclusions and explicit paths', async () => {
        const { host } = createHost(notes, {
            isNoteExcluded: (file) => file.path === 'People/Alice.md'
        })
        const validator = new QueryValidator(host)
        expect((await validator.validate()).notes).toEqual([])
        expect((await validator.validate({ paths: ['Goals/Goal.md'] })).notesScanned).toBe(1)
    })

    it('refuses to run queries without Dataview', async () => {
        const { host } = createHost(notes)
        let error: unknown
        try {
            await new QueryValidator(host).validate({ runQueries: true })
        } catch (caught) {
            error = caught
        }
        expect(error).toBeInstanceOf(Error)
    })
})

describe('QueryValidator.fixSelfReferences', () => {
    it('rewrites the note, marks the write and refreshes', async () => {
        const { host, contents, beforeWrite, afterFix } = createHost(notes)
        const fixed = await new QueryValidator(host).fixSelfReferences('People/Alice.md')

        expect(fixed).toBe(1)
        expect(contents.get('People/Alice.md')).toBe(
            '<!-- QueryToSerialize: LIST FROM [[]] AND [[Gone]] -->'
        )
        expect(beforeWrite).toHaveBeenCalledTimes(1)
        expect(afterFix).toHaveBeenCalledTimes(1)
    })

    it('writes nothing when writing is blocked or the note is excluded', async () => {
        for (const overrides of [
            { isWritingBlocked: () => true },
            { isNoteExcluded: () => true }
        ]) {
            const { host, contents, beforeWrite } = createHost(notes, overrides)
            expect(await new QueryValidator(host).fixSelfReferences('People/Alice.md')).toBe(0)
            expect(contents.get('People/Alice.md')).toBe(notes['People/Alice.md'])
            expect(beforeWrite).not.toHaveBeenCalled()
        }
    })
})
