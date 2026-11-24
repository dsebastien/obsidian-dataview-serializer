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
 * - 'query-errors': at least one query failed
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
    /** False while Dataview has not indexed every saved note (see `isDataviewIndexCurrent`) */
    isDataviewIndexCurrent(): boolean
    sleep(ms: number): Promise<void>
    /** The Markdown note at that vault path, or null (see `findMarkdownFile`) */
    resolveFile(path: string): TFile | null
    /**
     * Process one note: forced, automatic query modes, nothing written when a
     * query fails, no notice
     */
    refreshFile(file: TFile): Promise<FileRun>
}

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

/**
 * Whether Dataview has finished indexing the vault. Just after startup its
 * index is partial, and queries run then return lists with missing rows.
 * Read defensively: a Dataview without `index.initialized` counts as ready.
 *
 * @param dataviewApi the Dataview API (`api.index` is its `FullIndex`)
 */
export const isDataviewIndexReady = (dataviewApi: object): boolean => {
    const index: unknown = 'index' in dataviewApi ? dataviewApi.index : undefined
    if (!isObject(index) || !('initialized' in index)) {
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
 * Whether Dataview has indexed the saved version of every given note:
 * `index.pages.get(path).mtime` is not older than the file's `stat.mtime`. A
 * note missing from the index counts as behind (just created). After an edit,
 * Dataview re-indexes the note in the background, so a query run before that
 * would still see the old version.
 *
 * Read defensively: whatever cannot be read (no `index.pages`, a page or a
 * file without a time) counts as current.
 *
 * @param dataviewApi the Dataview API
 * @param files the Markdown files of the vault
 */
export const isDataviewIndexCurrent = (dataviewApi: object, files: readonly TFile[]): boolean => {
    const index: unknown = 'index' in dataviewApi ? dataviewApi.index : undefined
    if (!isObject(index) || !('pages' in index)) {
        return true
    }
    const pages: unknown = index.pages
    if (!isObject(pages) || !('get' in pages) || typeof pages.get !== 'function') {
        return true
    }
    const lookup = pages as { get(path: string): unknown }

    for (const file of files) {
        const stat: unknown = file.stat
        const fileMtime = isObject(stat) && 'mtime' in stat ? toMillis(stat.mtime) : null
        if (fileMtime === null) {
            continue
        }
        const page = lookup.get(file.path)
        if (page === undefined) {
            return false
        }
        const pageMtime = isObject(page) && 'mtime' in page ? toMillis(page.mtime) : null
        if (pageMtime !== null && pageMtime < fileMtime) {
            return false
        }
    }
    return true
}

/** The vault lookups `findMarkdownFile` needs */
export interface MarkdownFileLookup {
    getFileByPath(path: string): TFile | null
    getMarkdownFiles(): TFile[]
}

const isMarkdownFile = (file: TFile | null): file is TFile =>
    file !== null && file.extension === MARKDOWN_FILE_EXTENSION

/**
 * The Markdown note at a vault path, or null. The exact path wins: a name on
 * disk may hold a non-breaking space or decomposed Unicode, which
 * `normalizePath` turns into another note's name. The normalized form is only
 * a fallback, for a path typed or copied differently.
 *
 * @param normalize `normalizePath` (injected for tests)
 */
export const findMarkdownFile = (
    path: string,
    vault: MarkdownFileLookup,
    normalize: (path: string) => string
): TFile | null => {
    const exact = vault.getFileByPath(path)
    if (isMarkdownFile(exact) && exact.path === path) {
        return exact
    }
    const scanned = vault.getMarkdownFiles().find((file) => file.path === path)
    if (scanned) {
        return scanned
    }
    const normalized = vault.getFileByPath(normalize(path))
    return isMarkdownFile(normalized) ? normalized : null
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * The API entry for one note, from how its processing ended. A 'failed'
 * outcome always carries at least one error.
 */
export const toRefreshedNote = (path: string, file: TFile, run: FileRun): RefreshedNote => {
    const errors = run.errors.map(({ query, message }) => ({ query, message }))
    const skipped = run.skipped.map(({ query, reason }) => ({ query, reason }))
    const note = (outcome: RefreshedNote['outcome']): RefreshedNote => ({
        path,
        resolvedPath: file.path,
        outcome,
        errors,
        skipped
    })
    const failed = (message?: string): RefreshedNote => {
        if (message !== undefined || errors.length === 0) {
            errors.push({ query: '', message: message ?? 'The note could not be refreshed' })
        }
        return note('failed')
    }

    switch (run.status) {
        case 'updated':
        case 'unchanged':
        case 'no-queries':
        case 'conflict':
            return note(run.status)
        case 'empty':
            return note('no-queries')
        case 'excluded-file-type':
        case 'ignored-by-flag':
            return note('ignored')
        case 'not-processable':
            return { path, resolvedPath: null, outcome: 'not-found', errors, skipped }
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

/** Poll `check` until it holds, for at most `timeoutMs`. True when it held. */
const waitUntil = async (
    check: () => boolean,
    sleep: (ms: number) => Promise<void>,
    timeoutMs: number,
    intervalMs: number
): Promise<boolean> => {
    let waited = 0
    while (!check()) {
        if (waited >= timeoutMs) {
            return false
        }
        await sleep(intervalMs)
        waited += intervalMs
    }
    return true
}

/**
 * Refresh the serialized queries of the given notes and report what happened
 * to each one (`DataviewSerializerApi.refreshNotes`).
 *
 * Nothing runs when the plugin is disabled on this device, Dataview is not
 * loaded, its index is still loading, or it has not indexed recent edits
 * within `INDEX_WAIT_TIMEOUT_MS`. Each note is processed once, even when
 * given several times or under several path forms; the report has one entry
 * per input path, in input order.
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

    const notRun = (state: RefreshReport['state']): RefreshReport => ({
        state,
        notes: paths.map((path) => ({
            path,
            resolvedPath: null,
            outcome: 'not-run',
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
    const indexIsCurrent = await waitUntil(
        () => host.isDataviewIndexCurrent(),
        (ms) => host.sleep(ms),
        INDEX_WAIT_TIMEOUT_MS,
        INDEX_POLL_INTERVAL_MS
    )
    if (!indexIsCurrent) {
        return notRun('dataview-index-busy')
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

    const files = [...uniqueFiles.values()]
    const runs = await processInBatches(
        files,
        (file) =>
            host.refreshFile(file).catch(
                (error: unknown): FileRun => ({
                    status: 'exception',
                    errors: [],
                    skipped: [],
                    exception: errorMessage(error)
                })
            ),
        REFRESH_CONCURRENCY
    )
    const runsByPath = new Map(files.map((file, index) => [file.path, runs[index]]))

    return {
        state: 'ready',
        notes: paths.map((path, index): RefreshedNote => {
            const file = filesByInput[index]
            const run = file ? runsByPath.get(file.path) : undefined
            return file && run
                ? toRefreshedNote(path, file, run)
                : { path, resolvedPath: null, outcome: 'not-found', errors: [], skipped: [] }
        })
    }
}
