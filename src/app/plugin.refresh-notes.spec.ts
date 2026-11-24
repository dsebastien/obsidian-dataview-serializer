import { afterEach, beforeAll, describe, expect, it, mock } from 'bun:test'
import * as obsidian from 'obsidian'
import { normalizePath, TFile } from 'obsidian'
import { add } from 'date-fns'
import { DataviewSerializerPlugin } from './plugin'
import { DATAVIEWJS_OFF_SKIP_REASON, unresolvedSkipReason } from './refresh-notes'
import { createDefaultSettings, type PluginSettings } from './types/plugin-settings.intf'

/**
 * `api.refreshNotes` running the real plugin code (`refresh-notes.spec.ts`
 * covers the orchestration with a fake host).
 */

// Records every notice, so a test can check that the API shows none
const notices: string[] = []
void mock.module('obsidian', () => ({
    ...obsidian,
    Notice: class Notice {
        constructor(message: string) {
            notices.push(message)
        }
    }
}))

beforeAll(() => {
    // Obsidian extends String with contains(); processFile schedules a
    // cleanup through window.setTimeout
    const proto = String.prototype as { contains?: (this: string, search: string) => boolean }
    proto.contains ??= function (this: string, search: string): boolean {
        return this.includes(search)
    }
    // `self` is Bun's global object (the same object as `globalThis`)
    const scope = self as { window?: unknown }
    scope.window ??= self
})

const createFile = (path: string, mtime = 1000): TFile => {
    const name = path.split('/').pop() ?? path
    const extension = name.includes('.') ? name.split('.').pop()! : ''
    // A real instance of the (mocked) class, so `instanceof TFile` holds
    return Object.assign(new TFile(), {
        path,
        name,
        extension,
        stat: { mtime, ctime: 0, size: 0 }
    })
}

/**
 * Harness: a small in-memory vault (disk content, optional stale cache,
 * frontmatter, mtime per note), written through a fake `Vault.process`, and a
 * Dataview stub. Block queries return `- [[Fresh]]` (or `queryOutput`) unless
 * listed in `failingQueries` (they throw); inline expressions evaluate to
 * `inlineValue` (default `Fresh value`), except `this.broken`, which fails.
 */
interface NoteFixture {
    content: string
    frontmatter?: Record<string, unknown>
    /** What `cachedRead` serves when the cache is behind the disk */
    cached?: string
    mtime?: number
}

interface RefresherOptions {
    settings?: Partial<PluginSettings>
    failingQueries?: string[]
    queryOutput?: (query: string) => string
    inlineValue?: unknown
    /** Delay of each block query, in ms */
    queryDelayMs?: number
    disabledOnDevice?: boolean
    /** The Dataview API's `index` (default: initialized); absent when the key is undefined */
    dataviewIndex?: unknown
    /** Called when Dataview runs a block query (to simulate another writer) */
    onQuery?: (query: string, contents: Map<string, string>) => void
    nextPossibleUpdates?: Map<string, Date>
    /** The vault lookup normalizes its argument, as some Obsidian versions may */
    lookupNormalizes?: boolean
}

const createRefresher = (
    notes: Record<string, string | NoteFixture>,
    options: RefresherOptions = {}
) => {
    const fixtures = new Map(
        Object.entries(notes).map(([path, note]) => [
            path,
            typeof note === 'string' ? { content: note } : note
        ])
    )
    const contents = new Map([...fixtures].map(([path, note]) => [path, note.content]))
    const files = new Map([...fixtures].map(([path, note]) => [path, createFile(path, note.mtime)]))

    const process = mock((file: TFile, fn: (data: string) => string) => {
        const next = fn(contents.get(file.path) ?? '')
        contents.set(file.path, next)
        return Promise.resolve(next)
    })
    let inFlight = 0
    const stats = { maxQueriesInFlight: 0 }
    const tryQueryMarkdown = mock(async (query: string) => {
        inFlight++
        stats.maxQueriesInFlight = Math.max(stats.maxQueriesInFlight, inFlight)
        try {
            if (options.queryDelayMs) {
                await Bun.sleep(options.queryDelayMs)
            }
            options.onQuery?.(query, contents)
            if (options.failingQueries?.includes(query)) {
                throw new Error(`Dataview cannot parse ${query}`)
            }
            return options.queryOutput ? options.queryOutput(query) : '- [[Fresh]]\n'
        } finally {
            inFlight--
        }
    })
    const read = mock((file: TFile) => Promise.resolve(contents.get(file.path) ?? ''))
    const cachedRead = mock((file: TFile) =>
        Promise.resolve(fixtures.get(file.path)?.cached ?? contents.get(file.path) ?? '')
    )
    const sleep = mock(() => Promise.resolve())

    const plugin = Object.create(DataviewSerializerPlugin.prototype) as DataviewSerializerPlugin
    Object.assign(plugin, {
        app: {
            vault: {
                read,
                cachedRead,
                process,
                getFileByPath: (path: string) =>
                    files.get(options.lookupNormalizes ? normalizePath(path) : path) ?? null,
                getFiles: () => [...files.values()],
                getMarkdownFiles: () => [...files.values()].filter((f) => f.extension === 'md'),
                getAbstractFileByPath: (path: string) => files.get(path) ?? null
            },
            metadataCache: {
                getFileCache: (file: TFile) => ({
                    frontmatter: fixtures.get(file.path)?.frontmatter
                }),
                getFirstLinkpathDest: (linkpath: string) => files.get(`${linkpath}.md`) ?? null
            },
            plugins: {
                plugins: {
                    dataview: {
                        api: {
                            ...('dataviewIndex' in options
                                ? options.dataviewIndex === undefined
                                    ? {}
                                    : { index: options.dataviewIndex }
                                : { index: { initialized: true } }),
                            tryQueryMarkdown,
                            page: () => ({}),
                            evaluate: (expression: string) =>
                                expression === 'this.broken'
                                    ? { successful: false, error: 'No such field' }
                                    : {
                                          successful: true,
                                          value:
                                              'inlineValue' in options
                                                  ? options.inlineValue
                                                  : 'Fresh value'
                                      }
                        }
                    }
                }
            }
        },
        settings: { ...createDefaultSettings(), ...options.settings },
        nextPossibleUpdates: options.nextPossibleUpdates ?? new Map<string, Date>(),
        filesToIgnoreFileEvents: new Set<string>(),
        isDisabledOnDevice: () => options.disabledOnDevice ?? false,
        // The index wait polls without real delays
        sleep
    })

    return { plugin, contents, files, process, tryQueryMarkdown, read, cachedRead, sleep, stats }
}

const block = (query: string, output?: string, flag = 'QueryToSerialize'): string =>
    output === undefined
        ? `<!-- ${flag}: ${query} -->\n`
        : `<!-- ${flag}: ${query} -->\n<!-- SerializedQuery: ${query} -->\n${output}\n<!-- SerializedQuery END -->\n`

const fresh = (query: string): string =>
    `<!-- QueryToSerialize: ${query} -->\n<!-- SerializedQuery: ${query} -->\n- [[Fresh]]\n\n<!-- SerializedQuery END -->\n`

const dvjs = (code: string, output?: string): string =>
    output === undefined
        ? `<!-- DataviewJSToSerialize: ${code} -->\n`
        : `<!-- DataviewJSToSerialize: ${code} -->\n<!-- SerializedDataviewJS -->\n${output}\n<!-- SerializedDataviewJS END -->\n`

const outcomes = (report: { notes: Array<{ path: string; outcome: string }> }) =>
    report.notes.map((note) => [note.path, note.outcome])

describe('DataviewSerializerPlugin.refreshNotes', () => {
    describe('outcomes', () => {
        it('updated: writes the new output', async () => {
            const query = 'LIST FROM #a'
            const { plugin, contents } = createRefresher({ 'A.md': block(query, '- [[Old]]') })

            const report = await plugin.refreshNotes(['A.md'])

            expect(report).toEqual({
                state: 'ready',
                notes: [
                    {
                        path: 'A.md',
                        resolvedPath: 'A.md',
                        outcome: 'updated',
                        errors: [],
                        skipped: []
                    }
                ]
            })
            expect(contents.get('A.md')).toBe(fresh(query))
        })

        it('unchanged: runs the queries but writes nothing when the output is current', async () => {
            const { plugin, process, tryQueryMarkdown } = createRefresher({
                'A.md': block('LIST FROM #a', '- [[Fresh]]')
            })

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'unchanged']])
            expect(tryQueryMarkdown).toHaveBeenCalledTimes(1)
            expect(process).not.toHaveBeenCalled()
        })

        it('no-queries: a note without queries, or empty', async () => {
            const { plugin } = createRefresher({
                'Plain.md': '# Just text\n',
                'Empty.md': '',
                'Example.md': '```\n<!-- QueryToSerialize: LIST -->\n```\n'
            })

            const report = await plugin.refreshNotes(['Plain.md', 'Empty.md', 'Example.md'])

            expect(outcomes(report)).toEqual([
                ['Plain.md', 'no-queries'],
                ['Empty.md', 'no-queries'],
                ['Example.md', 'no-queries']
            ])
        })

        it('ignored: honors the per-note ignore flag', async () => {
            const { plugin, tryQueryMarkdown, contents } = createRefresher({
                'A.md': {
                    content: block('LIST FROM #a', '- [[Old]]'),
                    frontmatter: { dataview_serializer_ignore: true }
                }
            })

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'ignored']])
            expect(report.notes[0]?.resolvedPath).toBe('A.md')
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(block('LIST FROM #a', '- [[Old]]'))
        })

        describe('ignored: files the serializer never processes', () => {
            afterEach(() => {
                delete (self as { ExcalidrawAutomate?: unknown }).ExcalidrawAutomate
            })

            it('a note named Canvas.md', async () => {
                const content = block('LIST FROM #a', '- [[Old]]')
                const { plugin, contents } = createRefresher({ 'Boards/Canvas.md': content })

                const report = await plugin.refreshNotes(['Boards/Canvas.md'])

                expect(outcomes(report)).toEqual([['Boards/Canvas.md', 'ignored']])
                expect(contents.get('Boards/Canvas.md')).toBe(content)
            })

            it('an Excalidraw drawing', async () => {
                ;(self as { ExcalidrawAutomate?: unknown }).ExcalidrawAutomate = {
                    isExcalidrawFile: (file: TFile) => file.path === 'Drawing.md'
                }
                const content = block('LIST FROM #a', '- [[Old]]')
                const { plugin, contents } = createRefresher({ 'Drawing.md': content })

                const report = await plugin.refreshNotes(['Drawing.md'])

                expect(outcomes(report)).toEqual([['Drawing.md', 'ignored']])
                expect(contents.get('Drawing.md')).toBe(content)
            })
        })

        it('not-found: no Markdown file at that path', async () => {
            const { plugin } = createRefresher({ 'image.png': 'binary' })

            const report = await plugin.refreshNotes(['Missing.md', 'image.png', ''])

            expect(
                report.notes.map((note) => [note.path, note.resolvedPath, note.outcome])
            ).toEqual([
                ['Missing.md', null, 'not-found'],
                ['image.png', null, 'not-found'],
                ['', null, 'not-found']
            ])
        })

        it('conflict: keeps the newer version written during the refresh', async () => {
            const { plugin, contents } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                { onQuery: (_query, vault) => vault.set('A.md', 'Rewritten by Templater\n') }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'conflict']])
            expect(contents.get('A.md')).toBe('Rewritten by Templater\n')
        })

        it('no conflict when the newer version already holds the new output', async () => {
            const query = 'LIST FROM #a'
            const { plugin, contents } = createRefresher(
                { 'A.md': block(query, '- [[Old]]') },
                { onQuery: (_query, vault) => vault.set('A.md', fresh(query)) }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).toBe(fresh(query))
        })

        it('failed: a query error writes nothing, not even the queries that worked', async () => {
            const content = `${block('LIST FROM #ok', '- [[Old]]')}\n${block('LIST BROKEN', '- [[Old]]')}`
            const { plugin, contents, process } = createRefresher(
                { 'A.md': content },
                { failingQueries: ['LIST BROKEN'] }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes).toEqual([
                {
                    path: 'A.md',
                    resolvedPath: 'A.md',
                    outcome: 'failed',
                    errors: [
                        { query: 'LIST BROKEN', message: 'Dataview cannot parse LIST BROKEN' }
                    ],
                    skipped: []
                }
            ])
            expect(process).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(content)
        })

        it('failed: an inline query error writes nothing either', async () => {
            const content =
                'Status: <!-- IQ: =this.status -->old<!-- /IQ -->\nBad: <!-- IQ: =this.broken -->x<!-- /IQ -->\n'
            const { plugin, contents } = createRefresher({ 'A.md': content })

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes[0]?.outcome).toBe('failed')
            expect(report.notes[0]?.errors).toEqual([
                { query: '=this.broken', message: 'No such field' }
            ])
            expect(contents.get('A.md')).toBe(content)
        })

        it('failed: a DataviewJS error writes nothing', async () => {
            const content = `${block('LIST FROM #ok', '- [[Old]]')}\n${dvjs("throw new Error('Boom')", '- old')}`
            const { plugin, contents, process } = createRefresher({ 'A.md': content })

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes[0]?.outcome).toBe('failed')
            expect(report.notes[0]?.errors).toHaveLength(1)
            expect(report.notes[0]?.errors[0]?.message).toContain('Boom')
            expect(process).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(content)
        })

        it('failed: an exception while writing is reported with an empty query', async () => {
            const { plugin, process } = createRefresher({ 'A.md': block('LIST FROM #a') })
            process.mockImplementation(() => Promise.reject(new Error('Write failed')))

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes[0]).toEqual({
                path: 'A.md',
                resolvedPath: 'A.md',
                outcome: 'failed',
                errors: [{ query: '', message: 'Write failed' }],
                skipped: []
            })
        })

        it('failed: an exception while reading is reported with an empty query', async () => {
            const { plugin, read } = createRefresher({ 'A.md': block('LIST FROM #a') })
            read.mockImplementation(() => Promise.reject(new Error('Read failed')))

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes[0]?.outcome).toBe('failed')
            expect(report.notes[0]?.errors).toEqual([{ query: '', message: 'Read failed' }])
        })

        it('counts inline queries like block queries', async () => {
            const { plugin, contents } = createRefresher({
                'A.md': 'Status: <!-- IQ: =this.status -->old<!-- /IQ -->\n',
                'B.md': 'Status: <!-- IQ: =this.status -->Fresh value<!-- /IQ -->\n'
            })

            const report = await plugin.refreshNotes(['A.md', 'B.md'])

            expect(outcomes(report)).toEqual([
                ['A.md', 'updated'],
                ['B.md', 'unchanged']
            ])
            expect(contents.get('A.md')).toBe(
                'Status: <!-- IQ: =this.status -->Fresh value<!-- /IQ -->\n'
            )
        })
    })

    describe('empty results replace the previous output', () => {
        it('block query', async () => {
            const query = 'LIST FROM #a'
            const { plugin, contents } = createRefresher(
                { 'A.md': block(query, '- [[Old]]') },
                { queryOutput: () => '' }
            )

            const first = await plugin.refreshNotes(['A.md'])
            const second = await plugin.refreshNotes(['A.md'])

            expect(outcomes(first)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).toBe(
                `<!-- QueryToSerialize: ${query} -->\n<!-- SerializedQuery: ${query} -->\n\n<!-- SerializedQuery END -->\n`
            )
            expect(outcomes(second)).toEqual([['A.md', 'unchanged']])
        })

        it('once-and-eject query: ejected', async () => {
            const { plugin, contents } = createRefresher(
                {
                    'A.md': `Before\n${block('LIST FROM #a', undefined, 'QueryToSerializeOnceAndEject')}After\n`
                },
                { queryOutput: () => '' }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).not.toContain('QueryToSerialize')
            expect(contents.get('A.md')).toContain('Before\n')
            expect(contents.get('A.md')).toContain('After\n')
        })

        it('inline query: a placeholder replaces the old value', async () => {
            const { plugin, contents } = createRefresher(
                { 'A.md': 'Status: <!-- IQ: =this.status -->old<!-- /IQ -->\n' },
                { inlineValue: '' }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).toBe('Status: <!-- IQ: =this.status -->-<!-- /IQ -->\n')
        })

        it('DataviewJS query', async () => {
            const { plugin, contents } = createRefresher({
                'A.md': dvjs('const nothing = 1', '- old')
            })

            const first = await plugin.refreshNotes(['A.md'])
            const second = await plugin.refreshNotes(['A.md'])

            expect(outcomes(first)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).not.toContain('- old')
            expect(contents.get('A.md')).toContain('<!-- SerializedDataviewJS END -->')
            expect(outcomes(second)).toEqual([['A.md', 'unchanged']])
        })

        it('processFile keeps the previous output (unchanged behavior)', async () => {
            const content = `${block('LIST FROM #a', '- [[Old]]')}\n${dvjs('const nothing = 1', '- old')}`
            const { plugin, contents } = createRefresher(
                { 'A.md': content },
                { queryOutput: () => '' }
            )

            await plugin.processFile(createFile('A.md'), true)

            expect(contents.get('A.md')).toBe(content)
        })
    })

    describe('state', () => {
        it('runs nothing when the plugin is disabled on this device', async () => {
            const { plugin, tryQueryMarkdown, read } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                { disabledOnDevice: true }
            )

            const report = await plugin.refreshNotes(['A.md', 'Missing.md'])

            expect(report.state).toBe('disabled-on-device')
            expect(outcomes(report)).toEqual([
                ['A.md', 'not-run'],
                ['Missing.md', 'not-run']
            ])
            expect(read).not.toHaveBeenCalled()
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
        })

        it('runs nothing when Dataview is not loaded', async () => {
            const { plugin, read } = createRefresher({ 'A.md': block('LIST FROM #a') })
            Object.assign(plugin.app, { plugins: { plugins: {} } })

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.state).toBe('dataview-not-loaded')
            expect(outcomes(report)).toEqual([['A.md', 'not-run']])
            expect(read).not.toHaveBeenCalled()
        })

        it('runs nothing while the Dataview index is still loading', async () => {
            const { plugin, read, tryQueryMarkdown, contents } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                { dataviewIndex: { initialized: false } }
            )

            const report = await plugin.refreshNotes(['A.md', 'A.md'])

            expect(report.state).toBe('dataview-index-not-ready')
            expect(outcomes(report)).toEqual([
                ['A.md', 'not-run'],
                ['A.md', 'not-run']
            ])
            expect(read).not.toHaveBeenCalled()
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(block('LIST FROM #a', '- [[Old]]'))
        })

        it('runs with an older Dataview that does not expose the index', async () => {
            const { plugin } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                { dataviewIndex: undefined }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.state).toBe('ready')
            expect(outcomes(report)).toEqual([['A.md', 'updated']])
        })

        it('waits until Dataview has indexed a recent edit anywhere in the vault', async () => {
            const pages = new Map([
                ['A.md', { mtime: { toMillis: () => 1000 } }],
                ['Other.md', { mtime: { toMillis: () => 1000 } }]
            ])
            const { plugin, sleep, contents } = createRefresher(
                {
                    'A.md': { content: block('LIST FROM #a', '- [[Old]]'), mtime: 1000 },
                    'Other.md': { content: 'Edited moments ago\n', mtime: 2000 }
                },
                { dataviewIndex: { initialized: true, pages } }
            )
            let polls = 0
            sleep.mockImplementation(() => {
                if (++polls === 2) {
                    pages.set('Other.md', { mtime: { toMillis: () => 2000 } })
                }
                return Promise.resolve()
            })

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.state).toBe('ready')
            expect(polls).toBe(2)
            expect(contents.get('A.md')).toBe(fresh('LIST FROM #a'))
        })

        it('runs nothing while Dataview stays behind', async () => {
            const { plugin, tryQueryMarkdown, contents } = createRefresher(
                {
                    'A.md': { content: block('LIST FROM #a', '- [[Old]]'), mtime: 2000 }
                },
                {
                    dataviewIndex: {
                        initialized: true,
                        pages: new Map([['A.md', { mtime: { toMillis: () => 1000 } }]])
                    }
                }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.state).toBe('dataview-index-busy')
            expect(outcomes(report)).toEqual([['A.md', 'not-run']])
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(block('LIST FROM #a', '- [[Old]]'))
        })

        it('rejects paths that are not an array', async () => {
            const { plugin } = createRefresher({ 'A.md': block('LIST FROM #a') })

            const error = await plugin.refreshNotes(JSON.parse('"A.md"') as string[]).then(
                () => null,
                (rejection: unknown) => rejection
            )

            expect(error).toBeInstanceOf(TypeError)
            expect(String(error)).toContain('refreshNotes')
        })
    })

    describe('paths', () => {
        it('returns the input order, duplicates kept, each note written once', async () => {
            const { plugin, process } = createRefresher({
                'A.md': block('LIST FROM #a', '- [[Old]]'),
                'B.md': block('LIST FROM #b', '- [[Fresh]]'),
                'C.md': 'No queries\n'
            })

            const report = await plugin.refreshNotes(['C.md', 'A.md', 'B.md', 'A.md', 'Nope.md'])

            expect(outcomes(report)).toEqual([
                ['C.md', 'no-queries'],
                ['A.md', 'updated'],
                ['B.md', 'unchanged'],
                ['A.md', 'updated'],
                ['Nope.md', 'not-found']
            ])
            expect(process).toHaveBeenCalledTimes(1)
        })

        it('processes one note given under two path forms once', async () => {
            const { plugin, process } = createRefresher({
                'a b.md': block('LIST FROM #a', '- [[Old]]')
            })

            const report = await plugin.refreshNotes(['a b.md', 'a b.md', 'a b.md'])

            expect(
                report.notes.map((note) => [note.path, note.resolvedPath, note.outcome])
            ).toEqual([
                ['a b.md', 'a b.md', 'updated'],
                ['a b.md', 'a b.md', 'updated'],
                ['a b.md', 'a b.md', 'updated']
            ])
            expect(process).toHaveBeenCalledTimes(1)
        })

        it('refreshes the note whose name holds a non-breaking space, not its look-alike', async () => {
            for (const lookupNormalizes of [false, true]) {
                const { plugin, contents } = createRefresher(
                    {
                        'a b.md': block('LIST FROM #a', '- [[Old]]'),
                        'a b.md': block('LIST FROM #a', '- [[Old]]')
                    },
                    { lookupNormalizes }
                )

                const report = await plugin.refreshNotes(['a b.md'])

                expect(report.notes[0]?.resolvedPath).toBe('a b.md')
                expect(contents.get('a b.md')).toBe(fresh('LIST FROM #a'))
                expect(contents.get('a b.md')).toBe(block('LIST FROM #a', '- [[Old]]'))
            }
        })

        it('finds a note given in decomposed Unicode', async () => {
            const { plugin } = createRefresher({ 'Café.md': block('LIST FROM #a', '- [[Old]]') })

            const report = await plugin.refreshNotes(['Café.md'])

            expect(report.notes[0]?.resolvedPath).toBe('Café.md')
            expect(report.notes[0]?.outcome).toBe('updated')
        })
    })

    describe('acts as a forced update', () => {
        it('ignores the cooldown of a note serialized moments ago', async () => {
            const { plugin, contents } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                {
                    nextPossibleUpdates: new Map([['A.md', add(new Date(), { minutes: 5 })]])
                }
            )

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).toBe(fresh('LIST FROM #a'))
        })

        it('processes notes in ignored folders and outside the folders to scan', async () => {
            const { plugin } = createRefresher(
                {
                    'Archive/A.md': block('LIST FROM #a', '- [[Old]]'),
                    'Elsewhere/B.md': block('LIST FROM #b', '- [[Old]]')
                },
                { settings: { ignoredFolders: ['Archive'], foldersToScan: ['Notes'] } }
            )

            const report = await plugin.refreshNotes(['Archive/A.md', 'Elsewhere/B.md'])

            expect(outcomes(report)).toEqual([
                ['Archive/A.md', 'updated'],
                ['Elsewhere/B.md', 'updated']
            ])
        })

        it('still honors the ignore flag inside an ignored folder', async () => {
            const { plugin } = createRefresher(
                {
                    'Archive/A.md': {
                        content: block('LIST FROM #a', '- [[Old]]'),
                        frontmatter: { dataview_serializer_ignore: 'yes' }
                    }
                },
                { settings: { ignoredFolders: ['Archive'] } }
            )

            expect(outcomes(await plugin.refreshNotes(['Archive/A.md']))).toEqual([
                ['Archive/A.md', 'ignored']
            ])
        })

        it('runs even when automatic updates are disabled', async () => {
            const { plugin } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                { settings: { disableAutomaticUpdates: true } }
            )

            expect(outcomes(await plugin.refreshNotes(['A.md']))).toEqual([['A.md', 'updated']])
        })

        it('starts the cooldown only when it wrote the note', async () => {
            const { plugin } = createRefresher({
                'A.md': block('LIST FROM #a', '- [[Old]]'),
                'B.md': block('LIST FROM #b', '- [[Fresh]]')
            })

            await plugin.refreshNotes(['A.md', 'B.md'])

            expect(plugin.nextPossibleUpdates.has('A.md')).toBe(true)
            expect(plugin.nextPossibleUpdates.has('B.md')).toBe(false)
        })
    })

    describe('reads the note from disk', () => {
        it('uses the saved text, not a stale cached copy', async () => {
            const query = 'LIST FROM #a'
            const { plugin, contents, cachedRead } = createRefresher({
                'A.md': { content: block(query, '- [[Old]]'), cached: block(query, '- [[Fresh]]') }
            })

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).toBe(fresh(query))
            expect(cachedRead).not.toHaveBeenCalled()
        })

        it('reads a note once', async () => {
            const { plugin, read } = createRefresher({ 'A.md': block('LIST FROM #a', '- [[Old]]') })

            await plugin.refreshNotes(['A.md'])

            expect(read).toHaveBeenCalledTimes(1)
        })
    })

    describe('one run per note at a time', () => {
        it('waits for an automatic run of the same note to finish', async () => {
            const query = 'LIST FROM #a'
            const { plugin, contents, stats } = createRefresher(
                { 'A.md': block(query, '- [[Old]]') },
                { queryDelayMs: 10 }
            )

            const [, report] = await Promise.all([
                plugin.processFile(createFile('A.md'), true),
                plugin.refreshNotes(['A.md'])
            ])

            expect(stats.maxQueriesInFlight).toBe(1)
            expect(outcomes(report)).toEqual([['A.md', 'unchanged']])
            expect(contents.get('A.md')).toBe(fresh(query))
        })

        it('does not hold back runs of other notes', async () => {
            const { plugin, stats } = createRefresher(
                {
                    'A.md': block('LIST FROM #a', '- [[Old]]'),
                    'B.md': block('LIST FROM #b', '- [[Old]]')
                },
                { queryDelayMs: 10 }
            )

            await Promise.all([
                plugin.processFile(createFile('A.md'), true),
                plugin.refreshNotes(['B.md'])
            ])

            expect(stats.maxQueriesInFlight).toBe(2)
        })

        it('releases the note after a failed run', async () => {
            const { plugin, process } = createRefresher({
                'A.md': block('LIST FROM #a', '- [[Old]]')
            })
            process.mockImplementationOnce(() => Promise.reject(new Error('Write failed')))

            const first = await plugin.refreshNotes(['A.md'])
            const second = await plugin.refreshNotes(['A.md'])

            expect(outcomes(first)).toEqual([['A.md', 'failed']])
            expect(outcomes(second)).toEqual([['A.md', 'updated']])
        })
    })

    describe('acts as an automatic update for query modes', () => {
        it('does not run manual queries or once queries that have output', async () => {
            const content = [
                block('LIST FROM #a', '- [[Old]]', 'QueryToSerializeManual'),
                block('LIST FROM #b', '- [[Old]]', 'QueryToSerializeOnce'),
                'Inline: <!-- IQManual: =this.status -->old<!-- /IQ -->',
                ''
            ].join('\n')
            const { plugin, contents, tryQueryMarkdown } = createRefresher({ 'A.md': content })

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'no-queries']])
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(content)
        })

        it('runs a once query that has no output yet', async () => {
            const { plugin, contents } = createRefresher({
                'A.md': block('LIST FROM #a', undefined, 'QueryToSerializeOnce')
            })

            const report = await plugin.refreshNotes(['A.md'])

            expect(outcomes(report)).toEqual([['A.md', 'updated']])
            expect(contents.get('A.md')).toContain('- [[Fresh]]')
        })

        it('does not run manual DataviewJS queries', async () => {
            const { plugin } = createRefresher({
                'A.md': '<!-- DataviewJSToSerializeManual: dv.list([1]) -->\n'
            })

            expect(outcomes(await plugin.refreshNotes(['A.md']))).toEqual([['A.md', 'no-queries']])
        })
    })

    describe('skipped queries', () => {
        it('reports a missing FROM source and still counts the note as refreshed', async () => {
            const broken = 'LIST FROM [[Gone]]'
            const fine = 'LIST FROM #a'
            const { plugin, contents } = createRefresher({
                'A.md': `${block(broken, '- [[Previous]]')}\n${block(fine, '- [[Old]]')}`,
                'B.md': block(broken, '- [[Previous]]')
            })

            const report = await plugin.refreshNotes(['A.md', 'B.md'])
            const skipped = [{ query: broken, reason: unresolvedSkipReason(['[[Gone]]']) }]

            expect(report.notes).toEqual([
                { path: 'A.md', resolvedPath: 'A.md', outcome: 'updated', errors: [], skipped },
                { path: 'B.md', resolvedPath: 'B.md', outcome: 'unchanged', errors: [], skipped }
            ])
            expect(contents.get('A.md')).toContain(block(broken, '- [[Previous]]'))
        })

        it('reports the DataviewJS queries left alone while DataviewJS support is off', async () => {
            const content = [
                dvjs('dv.list([1])', '- old'),
                '<!-- DataviewJSToSerializeManual: dv.list([2]) -->',
                block('LIST FROM #a', '- [[Old]]')
            ].join('\n')
            const { plugin, contents } = createRefresher(
                { 'A.md': content, 'B.md': dvjs('dv.list([1])', '- old') },
                { settings: { enableDataviewJS: false } }
            )

            const report = await plugin.refreshNotes(['A.md', 'B.md'])
            const skipped = [{ query: 'dv.list([1])', reason: DATAVIEWJS_OFF_SKIP_REASON }]

            expect(report.notes).toEqual([
                { path: 'A.md', resolvedPath: 'A.md', outcome: 'updated', errors: [], skipped },
                { path: 'B.md', resolvedPath: 'B.md', outcome: 'unchanged', errors: [], skipped }
            ])
            expect(contents.get('A.md')).toContain(dvjs('dv.list([1])', '- old'))
            expect(contents.get('B.md')).toBe(dvjs('dv.list([1])', '- old'))
        })
    })

    it('shows no notice, even when a query fails', async () => {
        const { plugin } = createRefresher(
            { 'A.md': block('LIST BROKEN', '- [[Old]]') },
            { failingQueries: ['LIST BROKEN'], settings: { showErrorNotifications: true } }
        )
        notices.length = 0

        await plugin.refreshNotes(['A.md'])

        expect(notices).toEqual([])
    })

    it('is exposed on the public API', async () => {
        const { plugin, contents } = createRefresher({
            'A.md': block('LIST FROM #a', '- [[Old]]')
        })
        // A real instance, so the class fields (the api among them) exist
        const instance = new DataviewSerializerPlugin(plugin.app, {
            id: 'dataview-serializer',
            name: 'Dataview Serializer',
            version: '0.0.0',
            minAppVersion: '0.0.0',
            author: '',
            description: ''
        })
        Object.assign(instance, {
            app: plugin.app,
            settings: plugin.settings,
            isDisabledOnDevice: () => false
        })

        const report = await instance.api.refreshNotes(['A.md'])

        expect(outcomes(report)).toEqual([['A.md', 'updated']])
        expect(contents.get('A.md')).toBe(fresh('LIST FROM #a'))
    })
})

describe('DataviewSerializerPlugin.processFile keeps its behavior', () => {
    it('still writes the queries that worked when another one fails, and notifies', async () => {
        const content = `${block('LIST FROM #ok', '- [[Old]]')}\n${block('LIST BROKEN', '- [[Old]]')}`
        const { plugin, contents } = createRefresher(
            { 'A.md': content },
            { failingQueries: ['LIST BROKEN'] }
        )
        notices.length = 0

        const result = await plugin.processFile(createFile('A.md'), true)

        expect(result.errors).toEqual([
            { query: 'LIST BROKEN', message: 'Dataview cannot parse LIST BROKEN' }
        ])
        expect(contents.get('A.md')).toContain(fresh('LIST FROM #ok'))
        expect(contents.get('A.md')).toContain(block('LIST BROKEN', '- [[Old]]'))
        expect(notices.length).toBeGreaterThan(0)
    })

    it('still swallows an exception without an error entry', async () => {
        const { plugin, process } = createRefresher({ 'A.md': block('LIST FROM #a') })
        process.mockImplementation(() => Promise.reject(new Error('Write failed')))

        const result = await plugin.processFile(createFile('A.md'), true)

        expect(result).toEqual({ filePath: 'A.md', errors: [], skipped: [] })
    })

    it('still reads through the cache', async () => {
        const { plugin, read, cachedRead } = createRefresher({
            'A.md': block('LIST FROM #a', '- [[Old]]')
        })

        await plugin.processFile(createFile('A.md'), true)

        expect(cachedRead).toHaveBeenCalledTimes(1)
        expect(read).not.toHaveBeenCalled()
    })

    it('still ignores DataviewJS queries while DataviewJS support is off', async () => {
        const content = dvjs('dv.list([1])', '- old')
        const { plugin } = createRefresher(
            { 'A.md': content },
            { settings: { enableDataviewJS: false } }
        )

        expect(await plugin.processFile(createFile('A.md'), true)).toEqual({
            filePath: 'A.md',
            errors: [],
            skipped: []
        })
    })

    it('still starts the cooldown when nothing changed', async () => {
        const { plugin } = createRefresher({ 'A.md': block('LIST FROM #a', '- [[Fresh]]') })

        await plugin.processFile(createFile('A.md'), true)

        expect(plugin.nextPossibleUpdates.has('A.md')).toBe(true)
    })

    it('still honors the cooldown and ignored folders when not forced', async () => {
        const { plugin, tryQueryMarkdown } = createRefresher(
            {
                'Archive/A.md': block('LIST FROM #a', '- [[Old]]'),
                'B.md': block('LIST FROM #b', '- [[Old]]')
            },
            {
                settings: { ignoredFolders: ['Archive'] },
                nextPossibleUpdates: new Map([['B.md', add(new Date(), { minutes: 5 })]])
            }
        )

        await plugin.processFile(createFile('Archive/A.md'))
        await plugin.processFile(createFile('B.md'))

        expect(tryQueryMarkdown).not.toHaveBeenCalled()
    })

    it('still returns an empty result when disabled on this device', async () => {
        const { plugin } = createRefresher(
            { 'A.md': block('LIST FROM #a') },
            { disabledOnDevice: true }
        )

        expect(await plugin.processFile(createFile('A.md'), true)).toEqual({
            filePath: '',
            errors: [],
            skipped: []
        })
    })

    it('still runs manual queries on a manual trigger', async () => {
        const { plugin, contents } = createRefresher({
            'A.md': block('LIST FROM #a', '- [[Old]]', 'QueryToSerializeManual')
        })

        const result = await plugin.processFile(createFile('A.md'), true, undefined, true)

        expect(result.updated).toBe(true)
        expect(contents.get('A.md')).toContain('- [[Fresh]]')
    })
})
