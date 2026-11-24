import { beforeAll, describe, expect, it, mock } from 'bun:test'
import * as obsidian from 'obsidian'
import { TFile } from 'obsidian'
import { add } from 'date-fns'
import { DataviewSerializerPlugin } from './plugin'
import { runNoteRefresh, type FileRun, type RefreshNotesHost } from './refresh-notes'
import { createDefaultSettings, type PluginSettings } from './types/plugin-settings.intf'

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

const createFile = (path: string): TFile => {
    const name = path.split('/').pop() ?? path
    const extension = name.includes('.') ? name.split('.').pop()! : ''
    // A real instance of the (mocked) class, so `instanceof TFile` holds
    return Object.assign(new TFile(), { path, name, extension })
}

const run = (status: FileRun['status'], extra: Partial<FileRun> = {}): FileRun => ({
    status,
    errors: [],
    skipped: [],
    ...extra
})

/**
 * Fake host for the orchestration: the notes that exist and the run each
 * one returns. Records which notes were processed.
 */
const createHost = (
    runs: Record<string, FileRun | Error>,
    overrides: Partial<Pick<RefreshNotesHost, 'isDisabledOnDevice' | 'isDataviewLoaded'>> = {}
) => {
    const processed: string[] = []
    const host: RefreshNotesHost = {
        isDisabledOnDevice: () => false,
        isDataviewLoaded: () => true,
        getMarkdownFile: (path) => (path in runs ? createFile(path) : null),
        refreshFile: (file) => {
            processed.push(file.path)
            const result = runs[file.path]!
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
        },
        ...overrides
    }
    return { host, processed }
}

describe('runNoteRefresh', () => {
    describe('state', () => {
        it('runs nothing when the plugin is disabled on this device', async () => {
            const { host, processed } = createHost(
                { 'A.md': run('updated') },
                { isDisabledOnDevice: () => true }
            )

            const report = await runNoteRefresh(['A.md', 'Missing.md', 'A.md'], host)

            expect(report.state).toBe('disabled-on-device')
            expect(report.notes).toEqual(
                ['A.md', 'Missing.md', 'A.md'].map((path) => ({
                    path,
                    outcome: 'not-run',
                    errors: [],
                    skipped: []
                }))
            )
            expect(processed).toEqual([])
        })

        it('runs nothing when Dataview is not loaded', async () => {
            const { host, processed } = createHost(
                { 'A.md': run('updated') },
                { isDataviewLoaded: () => false }
            )

            const report = await runNoteRefresh(['A.md'], host)

            expect(report.state).toBe('dataview-not-loaded')
            expect(report.notes.map((note) => note.outcome)).toEqual(['not-run'])
            expect(processed).toEqual([])
        })

        it('reports the device disable before a missing Dataview', async () => {
            const { host } = createHost(
                {},
                { isDisabledOnDevice: () => true, isDataviewLoaded: () => false }
            )

            expect((await runNoteRefresh([], host)).state).toBe('disabled-on-device')
        })

        it('is ready with an empty list', async () => {
            const { host } = createHost({})

            expect(await runNoteRefresh([], host)).toEqual({ state: 'ready', notes: [] })
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

            expect(report.notes.map((note) => [note.path, note.outcome])).toEqual([
                ['C.md', 'no-queries'],
                ['A.md', 'updated'],
                ['Missing.md', 'not-found'],
                ['B.md', 'unchanged'],
                ['A.md', 'updated']
            ])
        })

        it('processes a note given twice only once', async () => {
            const { host, processed } = createHost({ 'A.md': run('updated') })

            await runNoteRefresh(['A.md', 'A.md'], host)

            expect(processed).toEqual(['A.md'])
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
    })

    describe('outcomes', () => {
        const outcomeOf = async (fileRun: FileRun | Error) => {
            const { host } = createHost({ 'A.md': fileRun })
            const [note] = (await runNoteRefresh(['A.md'], host)).notes
            return note!
        }

        it('maps each run status to its outcome', async () => {
            expect((await outcomeOf(run('updated'))).outcome).toBe('updated')
            expect((await outcomeOf(run('unchanged'))).outcome).toBe('unchanged')
            expect((await outcomeOf(run('no-queries'))).outcome).toBe('no-queries')
            expect((await outcomeOf(run('not-processable'))).outcome).toBe('no-queries')
            expect((await outcomeOf(run('ignored-by-flag'))).outcome).toBe('ignored')
            expect((await outcomeOf(run('conflict'))).outcome).toBe('conflict')
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

        it('reports Dataview unloading or the device disable mid-run as failed', async () => {
            for (const status of ['dataview-not-loaded', 'disabled-on-device'] as const) {
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

        it('reports skipped queries with their reason, whatever the outcome', async () => {
            const note = await outcomeOf(
                run('updated', {
                    skipped: [
                        {
                            filePath: 'A.md',
                            query: 'LIST FROM [[Gone]] AND "Old"',
                            unresolved: ['[[Gone]]', '"Old"']
                        }
                    ]
                })
            )

            expect(note.outcome).toBe('updated')
            expect(note.skipped).toEqual([
                {
                    query: 'LIST FROM [[Gone]] AND "Old"',
                    reason: 'Unresolved FROM references: [[Gone]], "Old". The previous output was kept.'
                }
            ])
        })
    })
})

/**
 * Harness running the real plugin code: a small in-memory vault (content and
 * frontmatter per note), written through a fake `Vault.process`, and a
 * Dataview stub. Block queries return `- [[Fresh]]` unless listed in
 * `failingQueries` (they throw); inline expressions evaluate to `Fresh value`,
 * except `this.broken`, which fails.
 */
interface NoteFixture {
    content: string
    frontmatter?: Record<string, unknown>
}

interface RefresherOptions {
    settings?: Partial<PluginSettings>
    failingQueries?: string[]
    disabledOnDevice?: boolean
    /** Called when Dataview runs a block query (to simulate another writer) */
    onQuery?: (query: string, contents: Map<string, string>) => void
    nextPossibleUpdates?: Map<string, Date>
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
    const files = new Map([...fixtures.keys()].map((path) => [path, createFile(path)]))

    const process = mock((file: TFile, fn: (data: string) => string) => {
        const next = fn(contents.get(file.path) ?? '')
        contents.set(file.path, next)
        return Promise.resolve(next)
    })
    const tryQueryMarkdown = mock((query: string) => {
        options.onQuery?.(query, contents)
        if (options.failingQueries?.includes(query)) {
            return Promise.reject(new Error(`Dataview cannot parse ${query}`))
        }
        return Promise.resolve('- [[Fresh]]\n')
    })
    const cachedRead = mock((file: TFile) => Promise.resolve(contents.get(file.path) ?? ''))

    const plugin = Object.create(DataviewSerializerPlugin.prototype) as DataviewSerializerPlugin
    Object.assign(plugin, {
        app: {
            vault: {
                cachedRead,
                process,
                getFileByPath: (path: string) => files.get(path) ?? null,
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
                            tryQueryMarkdown,
                            page: () => ({}),
                            evaluate: (expression: string) =>
                                expression === 'this.broken'
                                    ? { successful: false, error: 'No such field' }
                                    : { successful: true, value: 'Fresh value' }
                        }
                    }
                }
            }
        },
        settings: { ...createDefaultSettings(), ...options.settings },
        nextPossibleUpdates: options.nextPossibleUpdates ?? new Map<string, Date>(),
        filesToIgnoreFileEvents: new Set<string>(),
        isDisabledOnDevice: () => options.disabledOnDevice ?? false
    })

    return { plugin, contents, process, tryQueryMarkdown, cachedRead }
}

const block = (query: string, output?: string, flag = 'QueryToSerialize'): string =>
    output === undefined
        ? `<!-- ${flag}: ${query} -->\n`
        : `<!-- ${flag}: ${query} -->\n<!-- SerializedQuery: ${query} -->\n${output}\n<!-- SerializedQuery END -->\n`

const fresh = (query: string): string =>
    `<!-- QueryToSerialize: ${query} -->\n<!-- SerializedQuery: ${query} -->\n- [[Fresh]]\n\n<!-- SerializedQuery END -->\n`

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
                notes: [{ path: 'A.md', outcome: 'updated', errors: [], skipped: [] }]
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
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
            expect(contents.get('A.md')).toBe(block('LIST FROM #a', '- [[Old]]'))
        })

        it('not-found: no Markdown file at that path', async () => {
            const { plugin } = createRefresher({ 'image.png': 'binary' })

            const report = await plugin.refreshNotes(['Missing.md', 'image.png', ''])

            expect(outcomes(report)).toEqual([
                ['Missing.md', 'not-found'],
                ['image.png', 'not-found'],
                ['', 'not-found']
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

        it('failed: an exception while writing is reported with an empty query', async () => {
            const { plugin, process } = createRefresher({ 'A.md': block('LIST FROM #a') })
            process.mockImplementation(() => Promise.reject(new Error('Write failed')))

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes).toEqual([
                {
                    path: 'A.md',
                    outcome: 'failed',
                    errors: [{ query: '', message: 'Write failed' }],
                    skipped: []
                }
            ])
        })

        it('failed: an exception while reading is reported with an empty query', async () => {
            const { plugin, cachedRead } = createRefresher({ 'A.md': block('LIST FROM #a') })
            cachedRead.mockImplementation(() => Promise.reject(new Error('Read failed')))

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.notes).toEqual([
                {
                    path: 'A.md',
                    outcome: 'failed',
                    errors: [{ query: '', message: 'Read failed' }],
                    skipped: []
                }
            ])
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

    describe('state', () => {
        it('runs nothing when the plugin is disabled on this device', async () => {
            const { plugin, tryQueryMarkdown, cachedRead } = createRefresher(
                { 'A.md': block('LIST FROM #a', '- [[Old]]') },
                { disabledOnDevice: true }
            )

            const report = await plugin.refreshNotes(['A.md', 'Missing.md'])

            expect(report.state).toBe('disabled-on-device')
            expect(outcomes(report)).toEqual([
                ['A.md', 'not-run'],
                ['Missing.md', 'not-run']
            ])
            expect(cachedRead).not.toHaveBeenCalled()
            expect(tryQueryMarkdown).not.toHaveBeenCalled()
        })

        it('runs nothing when Dataview is not loaded', async () => {
            const { plugin, cachedRead } = createRefresher({ 'A.md': block('LIST FROM #a') })
            Object.assign(plugin.app, { plugins: { plugins: {} } })

            const report = await plugin.refreshNotes(['A.md'])

            expect(report.state).toBe('dataview-not-loaded')
            expect(outcomes(report)).toEqual([['A.md', 'not-run']])
            expect(cachedRead).not.toHaveBeenCalled()
        })
    })

    describe('order', () => {
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

        it('skips DataviewJS queries when DataviewJS is off, and manual ones when on', async () => {
            const js = '<!-- DataviewJSToSerialize: dv.list([1]) -->\n'
            const manualJs = '<!-- DataviewJSToSerializeManual: dv.list([1]) -->\n'
            const off = createRefresher({ 'A.md': js }, { settings: { enableDataviewJS: false } })
            const on = createRefresher({ 'A.md': manualJs })

            expect(outcomes(await off.plugin.refreshNotes(['A.md']))).toEqual([
                ['A.md', 'no-queries']
            ])
            expect(outcomes(await on.plugin.refreshNotes(['A.md']))).toEqual([
                ['A.md', 'no-queries']
            ])
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

            expect(report.notes).toEqual([
                {
                    path: 'A.md',
                    outcome: 'updated',
                    errors: [],
                    skipped: [
                        {
                            query: broken,
                            reason: 'Unresolved FROM references: [[Gone]]. The previous output was kept.'
                        }
                    ]
                },
                {
                    path: 'B.md',
                    outcome: 'unchanged',
                    errors: [],
                    skipped: [
                        {
                            query: broken,
                            reason: 'Unresolved FROM references: [[Gone]]. The previous output was kept.'
                        }
                    ]
                }
            ])
            expect(contents.get('A.md')).toContain(block(broken, '- [[Previous]]'))
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

    it('reports a path that is not a string as not-found', async () => {
        const { plugin } = createRefresher({ 'A.md': block('LIST FROM #a') })
        // What a script could pass, despite the types
        const paths = JSON.parse('[42, null]') as string[]

        const report = await plugin.refreshNotes(paths)

        expect(report.notes.map((note) => note.outcome)).toEqual(['not-found', 'not-found'])
        expect(report.notes.map((note) => note.path)).toEqual(paths)
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
