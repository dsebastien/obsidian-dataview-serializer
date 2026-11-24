import { describe, expect, it } from 'bun:test'
import { TFile } from 'obsidian'
import type { RefreshedNote, RefreshOutcome, RefreshState } from './api'
import {
    DATAVIEWJS_OFF_SKIP_REASON,
    INDEX_POLL_INTERVAL_MS,
    INDEX_WAIT_TIMEOUT_MS,
    MAX_REFRESH_PASSES,
    STALE_PATHS_REPORTED,
    UNSETTLED_MESSAGE,
    createMarkdownFileResolver,
    findStaleIndexedPaths,
    isDataviewIndexReady,
    requestIndexReload,
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
        'isDisabledOnDevice' | 'isDataviewLoaded' | 'isDataviewIndexReady' | 'findStaleIndexedPaths'
    >
>

/**
 * Fake host for the orchestration: the notes that exist and the run each one
 * returns. An array gives one run per pass (the last one repeats); a single
 * 'updated' run is followed by 'unchanged' runs, as a note that settles does.
 * Records which notes were processed, how long it waited, what it re-indexed.
 */
const createHost = (
    runs: Record<string, FileRun | Error | FileRun[]>,
    overrides: HostOverrides = {}
) => {
    const processed: string[] = []
    const waits: number[] = []
    const reindexed: string[] = []
    const runsOf = (entry: FileRun | Error | FileRun[]): Array<FileRun | Error> =>
        Array.isArray(entry)
            ? entry
            : !(entry instanceof Error) && entry.status === 'updated'
              ? [entry, { ...entry, status: 'unchanged' }]
              : [entry]
    const host: RefreshNotesHost = {
        isDisabledOnDevice: () => false,
        isDataviewLoaded: () => true,
        isDataviewIndexReady: () => true,
        findStaleIndexedPaths: () => [],
        reindex: (path) => {
            reindexed.push(path)
        },
        sleep: (ms) => {
            waits.push(ms)
            return Promise.resolve()
        },
        resolveFile: (path) => (path in runs ? createFile(path) : null),
        refreshFile: (file) => {
            const pass = processed.filter((path) => path === file.path).length
            processed.push(file.path)
            const sequence = runsOf(runs[file.path]!)
            const result = sequence[Math.min(pass, sequence.length - 1)]!
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
        },
        ...overrides
    }
    return { host, processed, waits, reindexed }
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

describe('findStaleIndexedPaths', () => {
    // Dataview stores page mtimes as Luxon DateTimes
    const page = (mtime: number) => ({ mtime: { toMillis: () => mtime } })
    const index = (pages: Record<string, unknown>) => ({
        index: { initialized: true, pages: new Map(Object.entries(pages)) }
    })

    it('finds nothing when every note is indexed at its saved version', () => {
        const files = [createFile('A.md', 1000), createFile('B.md', 2000)]

        expect(
            findStaleIndexedPaths(index({ 'A.md': page(1000), 'B.md': page(2000) }), files)
        ).toEqual([])
    })

    it('finds a note saved after Dataview indexed it', () => {
        const files = [createFile('A.md', 1000), createFile('B.md', 2500)]

        expect(
            findStaleIndexedPaths(index({ 'A.md': page(1000), 'B.md': page(2000) }), files)
        ).toEqual(['B.md'])
    })

    it('finds a note whose indexed version is newer than the file (its time went back)', () => {
        expect(
            findStaleIndexedPaths(index({ 'A.md': page(5000) }), [createFile('A.md', 1000)])
        ).toEqual(['A.md'])
    })

    it('finds a note that is not indexed yet', () => {
        expect(findStaleIndexedPaths(index({}), [createFile('New.md', 1000)])).toEqual(['New.md'])
    })

    it('accepts a page mtime stored as a number', () => {
        expect(
            findStaleIndexedPaths(index({ 'A.md': { mtime: 1000 } }), [createFile('A.md', 1000)])
        ).toEqual([])
    })

    it('counts what it cannot read as current (older Dataview)', () => {
        const files = [createFile('A.md', 1000)]

        expect(findStaleIndexedPaths({}, files)).toEqual([])
        expect(findStaleIndexedPaths({ index: { initialized: true } }, files)).toEqual([])
        expect(findStaleIndexedPaths({ index: { pages: {} } }, files)).toEqual([])
        expect(findStaleIndexedPaths(index({ 'A.md': {} }), files)).toEqual([])
        expect(findStaleIndexedPaths(index({ 'A.md': { mtime: 'x' } }), files)).toEqual([])
        // A file without stat
        expect(findStaleIndexedPaths(index({}), [createFile('A.md')])).toEqual([])
    })
})

describe('requestIndexReload', () => {
    it('asks the Dataview index to reload the file', () => {
        const reloaded: string[] = []
        const index = {
            name: 'index',
            reload(this: { name: string }, target: TFile): Promise<void> {
                reloaded.push(`${this.name}:${target.path}`)
                return Promise.resolve()
            }
        }

        requestIndexReload({ index }, createFile('A.md', 1000))

        expect(reloaded).toEqual(['index:A.md'])
    })

    it('does nothing with an older Dataview, and never throws', () => {
        const file = createFile('A.md', 1000)
        const throwing = {
            reload: (): Promise<void> => {
                throw new Error('nope')
            }
        }
        const rejecting = { reload: (): Promise<void> => Promise.reject(new Error('no')) }

        expect(() => requestIndexReload({}, file)).not.toThrow()
        expect(() => requestIndexReload({ index: {} }, file)).not.toThrow()
        expect(() => requestIndexReload({ index: throwing }, file)).not.toThrow()
        expect(() => requestIndexReload({ index: rejecting }, file)).not.toThrow()
    })
})

describe('createMarkdownFileResolver', () => {
    const vaultOf = (paths: string[], options: { lookupNormalizes?: boolean } = {}) => {
        const files = new Map(paths.map((path) => [path, createFile(path)]))
        let scans = 0
        return {
            vault: {
                getFileByPath: (path: string) =>
                    files.get(options.lookupNormalizes ? path.replace(/\u00A0/g, ' ') : path) ??
                    null,
                getMarkdownFiles: () => {
                    scans++
                    return [...files.values()].filter((f) => f.extension === 'md')
                }
            },
            scans: () => scans
        }
    }

    it('finds the note at the exact path, even when a look-alike exists', () => {
        const { vault } = vaultOf(['a\u00A0b.md', 'a b.md'])
        const resolve = createMarkdownFileResolver(vault)

        expect(resolve('a\u00A0b.md')?.path).toBe('a\u00A0b.md')
        expect(resolve('a b.md')?.path).toBe('a b.md')
    })

    it('finds the exact path through the vault list when the lookup normalizes', () => {
        const { vault } = vaultOf(['a\u00A0b.md', 'a b.md'], { lookupNormalizes: true })

        expect(createMarkdownFileResolver(vault)('a\u00A0b.md')?.path).toBe('a\u00A0b.md')
    })

    it('does not fall back to another form of the path', () => {
        const { vault } = vaultOf(['a b.md', 'café.md', 'Notes/x.md'])
        const resolve = createMarkdownFileResolver(vault)

        expect(resolve('a\u00A0b.md')).toBeNull()
        expect(resolve('a\u202Fb.md')).toBeNull()
        expect(resolve('cafe\u0301.md')).toBeNull()
        expect(resolve('/Notes//x.md')).toBeNull()
    })

    it('finds nothing for a missing note or a file that is not Markdown', () => {
        const { vault } = vaultOf(['image.png'])
        const resolve = createMarkdownFileResolver(vault)

        expect(resolve('Missing.md')).toBeNull()
        expect(resolve('image.png')).toBeNull()
    })

    it('lists the vault at most once per resolver', () => {
        const { vault, scans } = vaultOf(['A.md'])
        const resolve = createMarkdownFileResolver(vault)

        for (const path of ['X.md', 'Y.md', 'Z.md', 'A.md']) {
            resolve(path)
        }

        expect(scans()).toBe(1)
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
            const { host, processed, waits, reindexed } = createHost(
                { 'A.md': run('unchanged') },
                { findStaleIndexedPaths: () => (++polls > 3 ? [] : ['Other.md']) }
            )

            const report = await runNoteRefresh(['A.md'], host)

            expect(report.state).toBe('ready')
            expect(report.stalePaths).toBeUndefined()
            expect(waits).toEqual([
                INDEX_POLL_INTERVAL_MS,
                INDEX_POLL_INTERVAL_MS,
                INDEX_POLL_INTERVAL_MS
            ])
            expect(processed).toEqual(['A.md'])
            // Asked once, after Dataview had a first chance to catch up alone
            expect(reindexed).toEqual(['Other.md'])
        })

        it('does not ask Dataview to re-index when it catches up alone', async () => {
            let polls = 0
            const { host, reindexed } = createHost(
                { 'A.md': run('unchanged') },
                { findStaleIndexedPaths: () => (++polls > 1 ? [] : ['Other.md']) }
            )

            await runNoteRefresh(['A.md'], host)

            expect(reindexed).toEqual([])
        })

        it('gives up when Dataview stays behind, and says which notes', async () => {
            const stale = Array.from({ length: STALE_PATHS_REPORTED + 3 }, (_, i) => `S${i}.md`)
            const { host, processed, waits, reindexed } = createHost(
                { 'A.md': run('updated') },
                { findStaleIndexedPaths: () => stale }
            )

            const report = await runNoteRefresh(['A.md'], host)

            expect(report).toEqual({
                state: 'dataview-index-busy',
                stalePaths: stale.slice(0, STALE_PATHS_REPORTED),
                notes: [notRun('A.md')]
            })
            expect(waits.reduce((total, ms) => total + ms, 0)).toBe(INDEX_WAIT_TIMEOUT_MS)
            expect(processed).toEqual([])
            // Each stale note re-indexed once, however long it waited
            expect(reindexed).toEqual(stale)
        })

        it('checks the states in order', async () => {
            const never = () => false
            const stale = () => ['S.md']
            const checks: Array<[HostOverrides, RefreshState]> = [
                [
                    {
                        isDisabledOnDevice: () => true,
                        isDataviewLoaded: never,
                        isDataviewIndexReady: never,
                        findStaleIndexedPaths: stale
                    },
                    'disabled-on-device'
                ],
                [
                    {
                        isDataviewLoaded: never,
                        isDataviewIndexReady: never,
                        findStaleIndexedPaths: stale
                    },
                    'dataview-not-loaded'
                ],
                [
                    { isDataviewIndexReady: never, findStaleIndexedPaths: stale },
                    'dataview-index-not-ready'
                ],
                [{ findStaleIndexedPaths: stale }, 'dataview-index-busy']
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

        it('processes a note given twice, or under two paths, once per pass', async () => {
            const { host, processed } = createHost({ 'A.md': run('unchanged') })
            host.resolveFile = (path) => (path.startsWith('A') ? createFile('A.md') : null)

            const report = await runNoteRefresh(['A.md', 'A.md', 'A\u00A0.md'], host)

            expect(processed).toEqual(['A.md'])
            expect(report.notes.map((note) => note.resolvedPath)).toEqual(['A.md', 'A.md', 'A.md'])
            expect(report.notes[2]?.path).toBe('A\u00A0.md')
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

describe('runNoteRefresh passes', () => {
    it('runs another pass after a write, until a pass writes nothing', async () => {
        const { host, processed, waits } = createHost({
            'A.md': [run('updated'), run('updated'), run('unchanged')],
            'B.md': run('unchanged'),
            'C.md': run('no-queries')
        })

        const report = await runNoteRefresh(['A.md', 'B.md', 'C.md'], host)

        // A note without queries is not run again
        expect(processed).toEqual(['A.md', 'B.md', 'C.md', 'A.md', 'B.md', 'A.md', 'B.md'])
        expect(waits).toEqual([])
        expect(report.notes.map((note) => [note.outcome, note.errors])).toEqual([
            ['updated', []],
            ['unchanged', []],
            ['no-queries', []]
        ])
    })

    it('waits for the index between passes', async () => {
        let staleChecks = 0
        const { host, processed } = createHost({ 'A.md': run('updated') })
        host.findStaleIndexedPaths = () => {
            staleChecks++
            // Before the first pass: current. After the write: behind once.
            return staleChecks === 2 ? ['A.md'] : []
        }

        const report = await runNoteRefresh(['A.md'], host)

        expect(processed).toEqual(['A.md', 'A.md'])
        expect(staleChecks).toBe(3)
        expect(report.notes[0]?.outcome).toBe('updated')
        expect(report.notes[0]?.errors).toEqual([])
    })

    it('reports a failure of the last pass, even when an earlier pass wrote', async () => {
        const { host } = createHost({
            'A.md': [
                run('updated'),
                run('query-errors', { errors: [{ query: 'Q', message: 'Bad' }] })
            ]
        })

        const [note] = (await runNoteRefresh(['A.md'], host)).notes

        expect(note?.outcome).toBe('failed')
        expect(note?.errors).toEqual([{ query: 'Q', message: 'Bad' }])
    })

    it(`stops after ${MAX_REFRESH_PASSES} passes and flags the notes as not settled`, async () => {
        const { host, processed } = createHost({
            'A.md': [run('updated')],
            'B.md': run('unchanged'),
            'C.md': run('no-queries'),
            'D.md': run('ignored-by-flag')
        })

        const report = await runNoteRefresh(['A.md', 'B.md', 'C.md', 'D.md'], host)

        expect(processed.filter((path) => path === 'A.md')).toHaveLength(MAX_REFRESH_PASSES)
        expect(report.notes.map((note) => [note.outcome, note.errors])).toEqual([
            ['updated', [{ query: '', message: UNSETTLED_MESSAGE }]],
            ['unchanged', [{ query: '', message: UNSETTLED_MESSAGE }]],
            ['no-queries', []],
            ['ignored', []]
        ])
    })

    it('flags the notes as not settled when the index stays behind between passes', async () => {
        let ran = false
        const { host, processed } = createHost({
            'A.md': run('updated'),
            'B.md': run('unchanged')
        })
        const refreshFile = host.refreshFile.bind(host)
        host.refreshFile = (file) => {
            ran = true
            return refreshFile(file)
        }
        host.findStaleIndexedPaths = () => (ran ? ['A.md'] : [])

        const report = await runNoteRefresh(['A.md', 'B.md'], host)

        expect(report.state).toBe('ready')
        expect(processed).toEqual(['A.md', 'B.md'])
        expect(report.notes.map((note) => [note.outcome, note.errors])).toEqual([
            ['updated', [{ query: '', message: UNSETTLED_MESSAGE }]],
            ['unchanged', [{ query: '', message: UNSETTLED_MESSAGE }]]
        ])
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
