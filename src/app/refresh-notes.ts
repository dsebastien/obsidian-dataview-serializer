import type { TFile } from 'obsidian'
import type { RefreshedNote, RefreshReport } from './api'
import { processInBatches } from './utils/batch-processor'
import type { SkippedQuery } from './utils/unresolved-reference-notices'

/** Notes processed at the same time, as in a full scan */
const REFRESH_CONCURRENCY = 5

/**
 * How the processing of one note ended. Produced by the plugin's file
 * processing (`processFile` and the refresh API share it).
 *
 * - 'not-processable': never processed (no path, not Markdown, the Canvas
 *   file, an Excalidraw drawing, an empty note)
 * - 'throttled': cooldown or ignored folder (only when not forced)
 * - 'query-errors': at least one query failed
 * - 'exception': processing threw
 */
export type FileRunStatus =
    | 'disabled-on-device'
    | 'not-processable'
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
    skipped: SkippedQuery[]
    /** The message of the exception, when the status is 'exception' */
    exception?: string
}

/** What `runNoteRefresh` needs from the plugin */
export interface RefreshNotesHost {
    isDisabledOnDevice(): boolean
    isDataviewLoaded(): boolean
    /** The Markdown note at that vault path, or null */
    getMarkdownFile(path: string): TFile | null
    /**
     * Process one note: forced, automatic query modes, nothing written when a
     * query fails, no notice
     */
    refreshFile(file: TFile): Promise<FileRun>
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const skippedReason = (skip: SkippedQuery): string =>
    `Unresolved FROM references: ${skip.unresolved.join(', ')}. The previous output was kept.`

/**
 * The API entry for one note, from how its processing ended. A 'failed'
 * outcome always carries at least one error.
 */
export const toRefreshedNote = (path: string, run: FileRun): RefreshedNote => {
    const errors = run.errors.map(({ query, message }) => ({ query, message }))
    const skipped = run.skipped.map((skip) => ({ query: skip.query, reason: skippedReason(skip) }))
    const failed = (message?: string): RefreshedNote => {
        if (message !== undefined || errors.length === 0) {
            errors.push({ query: '', message: message ?? 'The note could not be refreshed' })
        }
        return { path, outcome: 'failed', errors, skipped }
    }

    switch (run.status) {
        case 'updated':
        case 'unchanged':
        case 'no-queries':
        case 'conflict':
            return { path, outcome: run.status, errors, skipped }
        case 'not-processable':
            return { path, outcome: 'no-queries', errors, skipped }
        case 'ignored-by-flag':
            return { path, outcome: 'ignored', errors, skipped }
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
 * Refresh the serialized queries of the given notes and report what happened
 * to each one (`DataviewSerializerApi.refreshNotes`).
 *
 * Nothing runs when the plugin is disabled on this device or Dataview is not
 * loaded. Each note is processed once, even when given several times; the
 * report has one entry per input path, in input order.
 */
export async function runNoteRefresh(
    paths: string[],
    host: RefreshNotesHost
): Promise<RefreshReport> {
    const notRun = (state: RefreshReport['state']): RefreshReport => ({
        state,
        notes: paths.map((path) => ({ path, outcome: 'not-run', errors: [], skipped: [] }))
    })

    if (host.isDisabledOnDevice()) {
        return notRun('disabled-on-device')
    }
    if (!host.isDataviewLoaded()) {
        return notRun('dataview-not-loaded')
    }

    const filesByInput = paths.map((path) =>
        typeof path === 'string' ? host.getMarkdownFile(path) : null
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
        notes: paths.map((path, index) => {
            const file = filesByInput[index]
            const run = file ? runsByPath.get(file.path) : undefined
            return run
                ? toRefreshedNote(path, run)
                : { path, outcome: 'not-found', errors: [], skipped: [] }
        })
    }
}
