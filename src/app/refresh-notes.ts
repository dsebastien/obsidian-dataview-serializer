import type { TFile } from 'obsidian'
import type { RefreshedNote, RefreshReport, RefreshSkippedQuery } from './api'
import { MARKDOWN_FILE_EXTENSION } from './constants'
import { processInBatches } from './utils/batch-processor'

/** Notes processed at the same time, as in a full scan */
const REFRESH_CONCURRENCY = 5

/** How long a refresh waits for Dataview to index recent edits */
export const INDEX_WAIT_TIMEOUT_MS = 5000

/** How often it checks the Dataview index while waiting */
export const INDEX_POLL_INTERVAL_MS = 250

/** Extra wait per note written by the previous pass (Dataview re-indexes each one) */
export const INDEX_WAIT_PER_WRITE_MS = 50

/** The longest a single index wait can last, however many notes were written */
export const INDEX_WAIT_MAX_MS = 30_000

/**
 * Time into a wait after which a note still stale is asked to re-index.
 * Dataview normally catches up on its own before that.
 */
export const INDEX_RELOAD_DELAY_MS = 2000

/** Re-index requests per wait, at most (a large sync must not flood Dataview) */
export const MAX_RELOADS_PER_WAIT = 50

/**
 * How long to wait for the index, after a pass that wrote `written` notes
 * (0 before the first pass): `INDEX_WAIT_TIMEOUT_MS`, plus
 * `INDEX_WAIT_PER_WRITE_MS` per note written, at most `INDEX_WAIT_MAX_MS`.
 */
export const indexWaitTimeout = (written: number): number =>
    Math.min(INDEX_WAIT_TIMEOUT_MS + INDEX_WAIT_PER_WRITE_MS * written, INDEX_WAIT_MAX_MS)

/** Stale notes named in a 'dataview-index-busy' report */
export const STALE_PATHS_REPORTED = 5

/**
 * Passes over the notes of one call. A pass that writes is followed by
 * another, once Dataview indexed the writes, so that a note listing another
 * note of the same call sees its new version.
 */
export const MAX_REFRESH_PASSES = 3

/**
 * Error added to the notes that did not settle: when the last pass wrote a
 * note and no later pass could run (pass limit reached, or Dataview still
 * behind), every note with queries that ran in that pass, since any of them
 * can list a note written then. A self-changing note (one showing the current
 * time, say) writes in every pass, so it marks every note of its call.
 */
export const UNSETTLED_MESSAGE =
    'Not settled: the last pass of this call still wrote a note, so this note may list an older version of it. A note that changes on every run (such as one showing the current time) never settles: refresh it alone, or the other notes without it.'

/** Reason given for a later copy of a query: only the first copy of a query text is serialized */
export const DUPLICATE_QUERY_SKIP_REASON =
    'The same query appears earlier in the note; only its first copy is serialized, so this copy kept its previous output'

/** Reason given for a DataviewJS query left alone while DataviewJS support is off */
export const DATAVIEWJS_OFF_SKIP_REASON = 'DataviewJS support is off; the previous output was kept'

/** Reason given for a query whose FROM clause references missing notes or folders */
export const unresolvedSkipReason = (unresolved: readonly string[]): string =>
    `Unresolved FROM references: ${unresolved.join(', ')}. The previous output was kept.`

/**
 * How the processing of one note ended. Produced by the plugin's file
 * processing (`processFile` and the refresh API share it).
 *
 * - 'not-processable': no path, or not a Markdown file
 * - 'excluded-file-type': the Canvas file or an Excalidraw drawing, never processed
 * - 'empty': the note holds no text
 * - 'throttled': cooldown or ignored folder (only when not forced)
 * - 'updated': the note holds the new output (written, or already there)
 * - 'query-errors': at least one query failed, or its output could not be placed
 * - 'exception': processing threw
 */
export type FileRunStatus =
    | 'disabled-on-device'
    | 'not-processable'
    | 'excluded-file-type'
    | 'empty'
    | 'ignored-by-flag'
    | 'throttled'
    | 'dataview-not-loaded'
    | 'no-queries'
    | 'unchanged'
    | 'updated'
    | 'conflict'
    | 'query-errors'
    | 'exception'

/** What processing one note reports to the refresh API */
export interface FileRun {
    status: FileRunStatus
    /** The run wrote the note's file */
    written: boolean
    errors: Array<{ message: string; query: string }>
    /** Queries left untouched on purpose, with the reason */
    skipped: RefreshSkippedQuery[]
    /** The message of the exception, when the status is 'exception' */
    exception?: string
}

/** What `runNoteRefresh` needs from the plugin */
export interface RefreshNotesHost {
    isDisabledOnDevice(): boolean
    isDataviewLoaded(): boolean
    /** False while Dataview is still building its index (see `isDataviewIndexReady`) */
    isDataviewIndexReady(): boolean
    /** Notes Dataview has not indexed at their saved version (see `findStaleIndexedPaths`) */
    findStaleIndexedPaths(): string[]
    /** Ask Dataview to index that note again (see `requestIndexReload`) */
    reindex(path: string): void
    sleep(ms: number): Promise<void>
    /** The Markdown note at exactly that vault path, or null (see `createMarkdownFileResolver`) */
    resolveFile(path: string): TFile | null
    /**
     * Process one note: forced, automatic query modes, nothing written when a
     * query fails, no notice
     */
    refreshFile(file: TFile): Promise<FileRun>
}

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

/** The `index` of the Dataview API (its `FullIndex`), when it is an object */
const dataviewIndexOf = (dataviewApi: object): object | null => {
    const index: unknown = 'index' in dataviewApi ? dataviewApi.index : undefined
    return isObject(index) ? index : null
}

/**
 * Whether Dataview has finished indexing the vault. Just after startup its
 * index is partial, and queries run then return lists with missing rows.
 * Read defensively: a Dataview without `index.initialized` counts as ready.
 *
 * @param dataviewApi the Dataview API (`api.index` is its `FullIndex`)
 */
export const isDataviewIndexReady = (dataviewApi: object): boolean => {
    const index = dataviewIndexOf(dataviewApi)
    if (!index || !('initialized' in index)) {
        return true
    }
    return index.initialized !== false
}

/** Milliseconds of a Luxon DateTime (Dataview's page mtime) or a number; null otherwise */
const toMillis = (value: unknown): number | null => {
    if (typeof value === 'number') {
        return value
    }
    if (isObject(value) && 'toMillis' in value && typeof value.toMillis === 'function') {
        const millis: unknown = (value as { toMillis(): unknown }).toMillis()
        return typeof millis === 'number' ? millis : null
    }
    return null
}

/**
 * The notes Dataview has not indexed at their saved version:
 * `index.pages.get(path).mtime` differs from the file's `stat.mtime` (older
 * after an edit; newer when the file's time went back), or the note is not in
 * the index yet (just created). Dataview re-indexes a saved note in the
 * background, so a query run before that still sees the old version.
 *
 * Read defensively: whatever cannot be read (no `index.pages`, a page or a
 * file without a time) counts as current.
 *
 * @param dataviewApi the Dataview API
 * @param files the Markdown files of the vault
 */
export const findStaleIndexedPaths = (dataviewApi: object, files: readonly TFile[]): string[] => {
    const index = dataviewIndexOf(dataviewApi)
    if (!index || !('pages' in index)) {
        return []
    }
    const pages: unknown = index.pages
    if (!isObject(pages) || !('get' in pages) || typeof pages.get !== 'function') {
        return []
    }
    const lookup = pages as { get(path: string): unknown }

    const stale: string[] = []
    for (const file of files) {
        const stat: unknown = file.stat
        const fileMtime = isObject(stat) && 'mtime' in stat ? toMillis(stat.mtime) : null
        if (fileMtime === null) {
            continue
        }
        const page = lookup.get(file.path)
        if (page === undefined) {
            stale.push(file.path)
            continue
        }
        const pageMtime = isObject(page) && 'mtime' in page ? toMillis(page.mtime) : null
        if (pageMtime !== null && pageMtime !== fileMtime) {
            stale.push(file.path)
        }
    }
    return stale
}

/**
 * Ask Dataview to index a note again, through its public `index.reload(file)`.
 * Defensive: does nothing with a Dataview without it, and never throws.
 */
export const requestIndexReload = (dataviewApi: object, file: TFile): void => {
    const index = dataviewIndexOf(dataviewApi)
    if (!index || !('reload' in index) || typeof index.reload !== 'function') {
        return
    }
    try {
        const reloading: unknown = (index as { reload(file: TFile): unknown }).reload(file)
        if (reloading instanceof Promise) {
            reloading.catch(() => undefined)
        }
    } catch {
        // An older or broken index: the wait reports the note as stale
    }
}

/** The vault lookups `createMarkdownFileResolver` needs */
export interface MarkdownFileLookup {
    getFileByPath(path: string): TFile | null
    getMarkdownFiles(): TFile[]
}

const isMarkdownFile = (file: TFile | null | undefined): file is TFile =>
    !!file && file.extension === MARKDOWN_FILE_EXTENSION

/**
 * A lookup of the Markdown note at exactly a vault path. No normalization: a
 * name on disk may hold a non-breaking space or decomposed Unicode, and
 * `normalizePath` would turn it into another note's name, so a path that only
 * normalizes to a note finds nothing. When the vault lookup does not return
 * the exact path, the vault's Markdown files are listed once, on first need.
 */
export const createMarkdownFileResolver = (
    vault: MarkdownFileLookup
): ((path: string) => TFile | null) => {
    let byPath: Map<string, TFile> | undefined
    return (path) => {
        const direct = vault.getFileByPath(path)
        if (isMarkdownFile(direct) && direct.path === path) {
            return direct
        }
        byPath ??= new Map(vault.getMarkdownFiles().map((file) => [file.path, file]))
        const listed = byPath.get(path)
        return isMarkdownFile(listed) ? listed : null
    }
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/** Run statuses after which a note is not run again in a later pass */
const FINAL_STATUSES: ReadonlySet<FileRunStatus> = new Set<FileRunStatus>([
    'not-processable',
    'excluded-file-type',
    'empty',
    'ignored-by-flag',
    'no-queries'
])

/**
 * The API entry for one note, from how its last pass ended. A 'failed'
 * outcome always carries at least one error.
 *
 * @param writes how many times the call wrote the note
 * @param unsettled the note did not settle (see `UNSETTLED_MESSAGE`)
 */
export const toRefreshedNote = (
    path: string,
    file: TFile,
    run: FileRun,
    writes = 0,
    unsettled = false
): RefreshedNote => {
    const wrote = writes > 0
    const errors = run.errors.map(({ query, message }) => ({ query, message }))
    const skipped = run.skipped.map(({ query, reason }) => ({ query, reason }))
    const note = (outcome: RefreshedNote['outcome']): RefreshedNote => {
        if (unsettled && (outcome === 'updated' || outcome === 'unchanged')) {
            errors.push({ query: '', message: UNSETTLED_MESSAGE })
        }
        return { path, resolvedPath: file.path, outcome, writes, errors, skipped }
    }
    const failed = (message?: string): RefreshedNote => {
        if (message !== undefined || errors.length === 0) {
            errors.push({ query: '', message: message ?? 'The note could not be refreshed' })
        }
        return note('failed')
    }

    switch (run.status) {
        case 'updated':
        case 'conflict':
            return note(run.status)
        // A note written by an earlier pass is 'updated' (a once query that
        // ran then is not run again: its note has no query left to run)
        case 'unchanged':
            return note(wrote ? 'updated' : 'unchanged')
        case 'no-queries':
            return note(wrote ? 'updated' : 'no-queries')
        // Empty after a pass wrote it (an ejected query that left nothing)
        case 'empty':
            return note(wrote ? 'updated' : 'no-queries')
        case 'excluded-file-type':
        case 'ignored-by-flag':
            return note('ignored')
        case 'not-processable':
            return { path, resolvedPath: null, outcome: 'not-found', writes, errors, skipped }
        case 'query-errors':
            return failed()
        case 'exception':
            return failed(run.exception ?? 'Unknown error')
        case 'dataview-not-loaded':
            return failed('Dataview was unloaded during the refresh')
        case 'disabled-on-device':
            return failed('The plugin was disabled on this device during the refresh')
        case 'throttled':
            return failed('The note was not processed (cooldown or ignored folder)')
    }
}

/**
 * Wait until Dataview has indexed every saved note, for at most `timeoutMs`.
 * A note still stale `INDEX_RELOAD_DELAY_MS` into the wait is asked once to
 * re-index (Dataview usually catches up on its own; one that it never
 * re-indexes would otherwise block every call), at most `MAX_RELOADS_PER_WAIT`.
 *
 * @returns the notes still stale (empty when the index is current)
 */
const waitForIndex = async (host: RefreshNotesHost, timeoutMs: number): Promise<string[]> => {
    const reindexed = new Set<string>()
    let waited = 0
    let stale = host.findStaleIndexedPaths()
    while (stale.length > 0 && waited < timeoutMs) {
        if (waited >= INDEX_RELOAD_DELAY_MS) {
            for (const path of stale) {
                if (reindexed.size >= MAX_RELOADS_PER_WAIT) {
                    break
                }
                if (!reindexed.has(path)) {
                    reindexed.add(path)
                    host.reindex(path)
                }
            }
        }
        await host.sleep(INDEX_POLL_INTERVAL_MS)
        waited += INDEX_POLL_INTERVAL_MS
        stale = host.findStaleIndexedPaths()
    }
    return stale
}

/**
 * Refresh the serialized queries of the given notes and report what happened
 * to each one (`DataviewSerializerApi.refreshNotes`).
 *
 * Nothing runs when the plugin is disabled on this device, Dataview is not
 * loaded, its index is still loading, or it has not indexed recent edits
 * within `INDEX_WAIT_TIMEOUT_MS`. Each note is processed once per pass, even
 * when given several times. A pass that wrote a note is followed by another
 * (up to `MAX_REFRESH_PASSES`) once Dataview indexed the writes; when the
 * last pass still wrote, every note that ran in it gets the `UNSETTLED_MESSAGE`
 * error and is listed in `unsettledPaths`.
 * The report has one entry per input path, in input order.
 *
 * @throws TypeError when `paths` is not an array
 */
export async function runNoteRefresh(
    paths: string[],
    host: RefreshNotesHost
): Promise<RefreshReport> {
    // A script can pass anything, despite the types
    const input: unknown = paths
    if (!Array.isArray(input)) {
        throw new TypeError('refreshNotes(paths): paths must be an array of vault paths')
    }

    const notRun = (state: RefreshReport['state'], stalePaths?: string[]): RefreshReport => ({
        state,
        ...(stalePaths ? { stalePaths } : {}),
        notes: paths.map((path) => ({
            path,
            resolvedPath: null,
            outcome: 'not-run',
            writes: 0,
            errors: [],
            skipped: []
        }))
    })

    if (host.isDisabledOnDevice()) {
        return notRun('disabled-on-device')
    }
    if (!host.isDataviewLoaded()) {
        return notRun('dataview-not-loaded')
    }
    if (!host.isDataviewIndexReady()) {
        return notRun('dataview-index-not-ready')
    }
    const stale = await waitForIndex(host, indexWaitTimeout(0))
    if (stale.length > 0) {
        return notRun('dataview-index-busy', stale.slice(0, STALE_PATHS_REPORTED))
    }

    const filesByInput = paths.map((path) =>
        typeof path === 'string' ? host.resolveFile(path) : null
    )
    const uniqueFiles = new Map<string, TFile>()
    for (const file of filesByInput) {
        if (file && !uniqueFiles.has(file.path)) {
            uniqueFiles.set(file.path, file)
        }
    }

    const runsByPath = new Map<string, FileRun>()
    const writes = new Map<string, number>()
    const unsettled = new Set<string>()
    let toRun = [...uniqueFiles.values()]
    for (let pass = 1; toRun.length > 0; pass++) {
        const runs = await processInBatches(
            toRun,
            (file) =>
                host.refreshFile(file).catch((error: unknown): FileRun => ({
                    status: 'exception',
                    written: false,
                    errors: [],
                    skipped: [],
                    exception: errorMessage(error)
                })),
            REFRESH_CONCURRENCY
        )
        const writtenNow: string[] = []
        toRun.forEach((file, index) => {
            const run = runs[index]!
            runsByPath.set(file.path, run)
            if (run.written) {
                writes.set(file.path, (writes.get(file.path) ?? 0) + 1)
                writtenNow.push(file.path)
            }
        })

        if (writtenNow.length === 0) {
            break
        }
        // The last pass wrote, and no later pass will run (pass limit reached,
        // or Dataview still behind): no note that ran in it may have seen those
        // writes, whether it changed or not (it can list a note written then)
        if (
            pass >= MAX_REFRESH_PASSES ||
            (await waitForIndex(host, indexWaitTimeout(writtenNow.length))).length > 0
        ) {
            toRun.forEach((file) => {
                if (!FINAL_STATUSES.has(runsByPath.get(file.path)?.status ?? 'no-queries')) {
                    unsettled.add(file.path)
                }
            })
            break
        }
        toRun = [...uniqueFiles.values()].filter(
            (file) => !FINAL_STATUSES.has(runsByPath.get(file.path)?.status ?? 'no-queries')
        )
    }

    const unsettledPaths = [...uniqueFiles.keys()].filter((path) => unsettled.has(path))
    return {
        state: 'ready',
        ...(unsettledPaths.length > 0 ? { unsettledPaths } : {}),
        notes: paths.map((path, index): RefreshedNote => {
            const file = filesByInput[index]
            const run = file ? runsByPath.get(file.path) : undefined
            return file && run
                ? toRefreshedNote(
                      path,
                      file,
                      run,
                      writes.get(file.path) ?? 0,
                      unsettled.has(file.path)
                  )
                : {
                      path,
                      resolvedPath: null,
                      outcome: 'not-found',
                      writes: 0,
                      errors: [],
                      skipped: []
                  }
        })
    }
}
