import { describe, expect, it } from 'bun:test'
import { normalizePath, TFile } from 'obsidian'
import type { RefreshedNote, RefreshOutcome, RefreshState } from './api'
import {
    DATAVIEWJS_OFF_SKIP_REASON,
    INDEX_WAIT_TIMEOUT_MS,
    findMarkdownFile,
    isDataviewIndexCurrent,
    isDataviewIndexReady,
    runNoteRefresh,
    unresolvedSkipReason,
    type FileRun,
    type RefreshNotesHost
} from './refresh-notes'

const createFile = (path: string, mtime?: number): TFile => {
    const name = path.split('/').pop() ?? path
    const extension = name.includes('.') ? name.split('.').pop()! : ''
    // A real instance of the (mocked) class, so `instanceof TFile` holds
    return Object.assign(new TFile(), {
        path,
        name,
        extension,
        ...(mtime !== undefined ? { stat: { mtime, ctime: 0, size: 0 } } : {})
    })
}

const run = (status: FileRun['status'], extra: Partial<FileRun> = {}): FileRun => ({
    status,
    errors: [],
    skipped: [],
    ...extra
})

type HostOverrides = Partial<
    Pick<
        RefreshNotesHost,
        | 'isDisabledOnDevice'
        | 'isDataviewLoaded'
        | 'isDataviewIndexReady'
        | 'isDataviewIndexCurrent'
    >
>

/**
 * Fake host for the orchestration: the notes that exist and the run each
 * one returns. Records which notes were processed and how long it waited.
 */
const createHost = (runs: Record<string, FileRun | Error>, overrides: HostOverrides = {}) => {
    const processed: string[] = []
    const waits: number[] = []
    const host: RefreshNotesHost = {
        isDisabledOnDevice: () => false,
        isDataviewLoaded: () => true,
        isDataviewIndexReady: () => true,
        isDataviewIndexCurrent: () => true,
        sleep: (ms) => {
            waits.push(ms)
            return Promise.resolve()
        },
        resolveFile: (path) => (path in runs ? createFile(path) : null),
        refreshFile: (file) => {
            processed.push(file.path)
            const result = runs[file.path]!
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
        },
        ...overrides
    }
    return { host, processed, waits }
}

const notRun = (path: string): RefreshedNote => ({
    path,
    resolvedPath: null,
    outcome: 'not-run',
    errors: [],
    skipped: []
})

describe('isDataviewIndexReady', () => {
    it('is ready once the index is initialized', () => {
        expect(isDataviewIndexReady({ index: { initialized: true } })).toBe(true)
    })

    it('is not ready while the index is loading', () => {
        expect(isDataviewIndexReady({ index: { initialized: false } })).toBe(false)
    })

    it('counts an older Dataview without the flag as ready', () => {
        expect(isDataviewIndexReady({})).toBe(true)
        expect(isDataviewIndexReady({ index: {} })).toBe(true)
        expect(isDataviewIndexReady({ index: null })).toBe(true)
        expect(isDataviewIndexReady({ index: 'odd' })).toBe(true)
    })
})

describe('isDataviewIndexCurrent', () => {
    // Dataview stores page mtimes as Luxon DateTimes
    const page = (mtime: number) => ({ mtime: { toMillis: () => mtime } })
    const index = (pages: Record<string, unknown>) => ({
        index: { initialized: true, pages: new Map(Object.entries(pages)) }
    })

    it('is current when every note is indexed at its saved version', () => {
        const files = [createFile('A.md', 1000), createFile('B.md', 2000)]

        expect(
            isDataviewIndexCurrent(index({ 'A.md': page(1000), 'B.md': page(2000) }), files)
        ).toBe(true)
    })

    it('is behind when a note was saved after Dataview indexed it', () => {
        const files = [createFile('A.md', 1000), createFile('B.md', 2500)]

        expect(
            isDataviewIndexCurrent(index({ 'A.md': page(1000), 'B.md': page(2000) }), files)
        ).toBe(false)
    })

    it('is behind when a note is not indexed yet', () => {
        expect(isDataviewIndexCurrent(index({}), [createFile('New.md', 1000)])).toBe(false)
    })

    it('accepts a page mtime stored as a number', () => {
        expect(
            isDataviewIndexCurrent(index({ 'A.md': { mtime: 1000 } }), [createFile('A.md', 1000)])
        ).toBe(true)
    })

    it('counts what it cannot read as current (older Dataview)', () => {
        const files = [createFile('A.md', 1000)]

        expect(isDataviewIndexCurrent({}, files)).toBe(true)
        expect(isDataviewIndexCurrent({ index: { initialized: true } }, files)).toBe(true)
        expect(isDataviewIndexCurrent({ index: { pages: {} } }, files)).toBe(true)
        expect(isDataviewIndexCurrent(index({ 'A.md': {} }), files)).toBe(true)
        expect(isDataviewIndexCurrent(index({ 'A.md': { mtime: 'x' } }), files)).toBe(true)
        // A file without stat
        expect(isDataviewIndexCurrent(index({}), [createFile('A.md')])).toBe(true)
    })
})

describe('findMarkdownFile', () => {
    const vaultOf = (paths: string[], options: { lookupNormalizes?: boolean } = {}) => {
        const files = new Map(paths.map((path) => [path, createFile(path)]))
        return {
            getFileByPath: (path: string) =>
                files.get(options.lookupNormalizes ? normalizePath(path) : path) ?? null,
            getMarkdownFiles: () => [...files.values()].filter((f) => f.extension === 'md')
        }
    }

    it('prefers the exact path, even when its normalized form is another note', () => {
        const vault = vaultOf(['a b.md', 'a b.md'])

        expect(findMarkdownFile('a b.md', vault, normalizePath)?.path).toBe('a b.md')
        expect(findMarkdownFile('a b.md', vault, normalizePath)?.path).toBe('a b.md')
    })

    it('finds the exact path by scanning when the lookup normalizes', () => {
        const vault = vaultOf(['a b.md', 'a b.md'], { lookupNormalizes: true })

        expect(findMarkdownFile('a b.md', vault, normalizePath)?.path).toBe('a b.md')
    })

    it('falls back to the normalized path', () => {
        const vault = vaultOf(['a b.md', 'café.md', 'Notes/x.md'])

        expect(findMarkdownFile('a b.md', vault, normalizePath)?.path).toBe('a b.md')
        expect(findMarkdownFile('café.md', vault, normalizePath)?.path).toBe('café.md')
        expect(findMarkdownFile('/Notes//x.md', vault, normalizePath)?.path).toBe('Notes/x.md')
    })

    it('finds nothing for a missing note or a file that is not Markdown', () => {
        const vault = vaultOf(['image.png'])

        expect(findMarkdownFile('Missing.md', vault, normalizePath)).toBeNull()
        expect(findMarkdownFile('image.png', vault, normalizePath)).toBeNull()
    })
})

describe('runNoteRefresh', () => {
    describe('state', () => {
        it('runs nothing when the plugin is disabled on this device', async () => {
            const { host, processed } = createHost(
                { 'A.md': run('updated') },
                { isDisabledOnDevice: () => true }
            )

            const report = await runNoteRefresh(['A.md', 'Missing.md', 'A.md'], host)

            expect(report).toEqual({
                state: 'disabled-on-device',
                notes: ['A.md', 'Missing.md', 'A.md'].map(notRun)
            })
            expect(processed).toEqual([])
        })

        it('runs nothing when Dataview is not loaded', async () => {
            const { host, processed } = createHost(
                { 'A.md': run('updated') },
                { isDataviewLoaded: () => false }
            )

            const report = await runNoteRefresh(['A.md'], host)

            expect(report).toEqual({ state: 'dataview-not-loaded', notes: [notRun('A.md')] })
            expect(processed).toEqual([])
        })

        it('runs nothing while the Dataview index is still loading', async () => {
            const { host, processed } = createHost(
                { 'A.md': run('updated') },
                { isDataviewIndexReady: () => false }
            )

            const report = await runNoteRefresh(['A.md', 'Missing.md'], host)

            expect(report.state).toBe('dataview-index-not-ready')
            expect(report.notes).toEqual([notRun('A.md'), notRun('Missing.md')])
            expect(processed).toEqual([])
        })

        it('waits for Dataview to index recent edits, then runs', async () => {
            let polls = 0
            const { host, processed, waits } = createHost(
                { 'A.md': run('updated') },
                { isDataviewIndexCurrent: () => ++polls > 3 }
            )

            const report = await runNoteRefresh(['A.md'], host)

            expect(report.state).toBe('ready')
            expect(waits).toHaveLength(3)
            expect(processed).toEqual(['A.md'])
        })

        it('gives up when Dataview stays behind for too long', async () => {
            const { host, processed, waits } = createHost(
                { 'A.md': run('updated') },
                { isDataviewIndexCurrent: () => false }
            )

            const report = await runNoteRefresh(['A.md'], host)

            expect(report).toEqual({ state: 'dataview-index-busy', notes: [notRun('A.md')] })
            expect(waits.reduce((total, ms) => total + ms, 0)).toBe(INDEX_WAIT_TIMEOUT_MS)
            expect(processed).toEqual([])
        })

        it('checks the states in order', async () => {
            const never = () => false
            const checks: Array<[HostOverrides, RefreshState]> = [
                [
                    {
                        isDisabledOnDevice: () => true,
                        isDataviewLoaded: never,
                        isDataviewIndexReady: never,
                        isDataviewIndexCurrent: never
                    },
                    'disabled-on-device'
                ],
                [
                    {
                        isDataviewLoaded: never,
                        isDataviewIndexReady: never,
                        isDataviewIndexCurrent: never
                    },
                    'dataview-not-loaded'
                ],
                [
                    { isDataviewIndexReady: never, isDataviewIndexCurrent: never },
                    'dataview-index-not-ready'
                ],
                [{ isDataviewIndexCurrent: never }, 'dataview-index-busy']
            ]

            for (const [overrides, state] of checks) {
                const { host, waits } = createHost({}, overrides)
                expect((await runNoteRefresh([], host)).state).toBe(state)
                if (state !== 'dataview-index-busy') {
                    expect(waits).toEqual([])
                }
            }
        })

        it('is ready with an empty list', async () => {
            const { host } = createHost({})

            expect(await runNoteRefresh([], host)).toEqual({ state: 'ready', notes: [] })
        })

        it('rejects paths that are not an array, naming the API', async () => {
            const { host } = createHost({})
            const paths = JSON.parse('"A.md"') as string[]

            const error = await runNoteRefresh(paths, host).then(
                () => null,
                (rejection: unknown) => rejection
            )

            expect(error).toBeInstanceOf(TypeError)
            expect(String(error)).toContain('refreshNotes')
        })
    })

    describe('order', () => {
        it('returns one entry per path, in input order, duplicates kept', async () => {
            const paths = ['C.md', 'A.md', 'Missing.md', 'B.md', 'A.md']
            const { host } = createHost({
                'A.md': run('updated'),
                'B.md': run('unchanged'),
                'C.md': run('no-queries')
            })

            const report = await runNoteRefresh(paths, host)

            expect(
                report.notes.map((note) => [note.path, note.resolvedPath, note.outcome])
            ).toEqual([
                ['C.md', 'C.md', 'no-queries'],
                ['A.md', 'A.md', 'updated'],
                ['Missing.md', null, 'not-found'],
                ['B.md', 'B.md', 'unchanged'],
                ['A.md', 'A.md', 'updated']
            ])
        })

        it('processes a note given twice, or under two paths, only once', async () => {
            const { host, processed } = createHost({ 'A.md': run('updated') })
            host.resolveFile = (path) => (path.startsWith('A') ? createFile('A.md') : null)

            const report = await runNoteRefresh(['A.md', 'A.md', 'A .md'], host)

            expect(processed).toEqual(['A.md'])
            expect(report.notes.map((note) => note.resolvedPath)).toEqual(['A.md', 'A.md', 'A.md'])
            expect(report.notes[2]?.path).toBe('A .md')
        })

        it('gives each entry of a duplicated path its own arrays', async () => {
            const { host } = createHost({
                'A.md': run('query-errors', { errors: [{ query: 'Q', message: 'Bad' }] })
            })

            const [first, second] = (await runNoteRefresh(['A.md', 'A.md'], host)).notes

            expect(first?.errors).toEqual(second?.errors)
            expect(first?.errors).not.toBe(second?.errors)
        })

        it('keeps the input order when notes finish out of order', async () => {
            const paths = Array.from({ length: 12 }, (_, index) => `N${index}.md`)
            const { host } = createHost(Object.fromEntries(paths.map((p) => [p, run('updated')])))
            let inFlight = 0
            let maxInFlight = 0
            host.refreshFile = async (file) => {
                inFlight++
                maxInFlight = Math.max(maxInFlight, inFlight)
                // Later notes of a batch finish first
                await Bun.sleep(20 - paths.indexOf(file.path))
                inFlight--
                return run(file.path === 'N3.md' ? 'unchanged' : 'updated')
            }

            const report = await runNoteRefresh(paths, host)

            expect(report.notes.map((note) => note.path)).toEqual(paths)
            expect(report.notes[3]?.outcome).toBe('unchanged')
            expect(maxInFlight).toBeLessThanOrEqual(5)
        })

        it('reports a path that is not a string as not-found', async () => {
            const { host } = createHost({ 'A.md': run('updated') })
            const paths = JSON.parse('[42, null, "A.md"]') as string[]

            const report = await runNoteRefresh(paths, host)

            // The path comes back as given
            expect(report.notes.map((note) => note.path)).toEqual(paths)
            expect(report.notes.map((note) => note.outcome)).toEqual([
                'not-found',
                'not-found',
                'updated'
            ])
        })
    })

    describe('outcomes', () => {
        const outcomeOf = async (fileRun: FileRun | Error) => {
            const { host } = createHost({ 'A.md': fileRun })
            const [note] = (await runNoteRefresh(['A.md'], host)).notes
            return note!
        }

        it('maps each run status to its outcome', async () => {
            const expected: Array<[FileRun['status'], RefreshOutcome]> = [
                ['updated', 'updated'],
                ['unchanged', 'unchanged'],
                ['no-queries', 'no-queries'],
                ['empty', 'no-queries'],
                ['excluded-file-type', 'ignored'],
                ['ignored-by-flag', 'ignored'],
                ['conflict', 'conflict'],
                ['not-processable', 'not-found']
            ]
            for (const [status, outcome] of expected) {
                expect((await outcomeOf(run(status))).outcome).toBe(outcome)
            }
        })

        it('has no resolved path for not-found', async () => {
            expect((await outcomeOf(run('not-processable'))).resolvedPath).toBeNull()
            expect((await outcomeOf(run('excluded-file-type'))).resolvedPath).toBe('A.md')
        })

        it('reports query errors as failed', async () => {
            const note = await outcomeOf(
                run('query-errors', { errors: [{ query: 'LIST FROM #a', message: 'Bad' }] })
            )

            expect(note.outcome).toBe('failed')
            expect(note.errors).toEqual([{ query: 'LIST FROM #a', message: 'Bad' }])
        })

        it('reports an exception during processing as failed, with no query', async () => {
            const note = await outcomeOf(run('exception', { exception: 'Disk on fire' }))

            expect(note).toEqual({
                path: 'A.md',
                resolvedPath: 'A.md',
                outcome: 'failed',
                errors: [{ query: '', message: 'Disk on fire' }],
                skipped: []
            })
        })

        it('reports a rejected run as failed, with no query', async () => {
            const note = await outcomeOf(new Error('Unexpected'))

            expect(note.outcome).toBe('failed')
            expect(note.errors).toEqual([{ query: '', message: 'Unexpected' }])
        })

        it('reports Dataview unloading, the device disable or a throttle mid-run as failed', async () => {
            for (const status of [
                'dataview-not-loaded',
                'disabled-on-device',
                'throttled'
            ] as const) {
                const note = await outcomeOf(run(status))

                expect(note.outcome).toBe('failed')
                expect(note.errors).toHaveLength(1)
                expect(note.errors[0]?.query).toBe('')
            }
        })

        it('never leaves a failed note without an error', async () => {
            const note = await outcomeOf(run('query-errors'))

            expect(note.outcome).toBe('failed')
            expect(note.errors.length).toBeGreaterThan(0)
        })

        it('passes the skipped queries and their reasons through, whatever the outcome', async () => {
            const skipped = [
                {
                    query: 'LIST FROM [[Gone]]',
                    reason: unresolvedSkipReason(['[[Gone]]', '"Old"'])
                },
                { query: 'dv.list([1])', reason: DATAVIEWJS_OFF_SKIP_REASON }
            ]

            const note = await outcomeOf(run('unchanged', { skipped }))

            expect(note.outcome).toBe('unchanged')
            expect(note.skipped).toEqual(skipped)
        })
    })
})

describe('skip reasons', () => {
    it('names the unresolved FROM references', () => {
        expect(unresolvedSkipReason(['[[Gone]]', '"Old"'])).toBe(
            'Unresolved FROM references: [[Gone]], "Old". The previous output was kept.'
        )
    })

    it('explains a DataviewJS query left alone', () => {
        expect(DATAVIEWJS_OFF_SKIP_REASON).toBe(
            'DataviewJS support is off; the previous output was kept'
        )
    })
})
