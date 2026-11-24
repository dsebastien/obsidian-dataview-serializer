import type { QueryValidationReport } from './query-validator'

/**
 * Whether a `refreshNotes` call processed the notes. Anything but 'ready'
 * means nothing ran and every note has the outcome 'not-run':
 * - 'disabled-on-device': the plugin is disabled on this device
 * - 'dataview-not-loaded': Dataview is not loaded
 * - 'dataview-index-not-ready': Dataview is still indexing the vault (just
 *   after startup), so queries would return incomplete results
 */
export type RefreshState =
    | 'ready'
    | 'disabled-on-device'
    | 'dataview-not-loaded'
    | 'dataview-index-not-ready'

/**
 * What `refreshNotes` did with one note:
 * - 'updated': the note had queries to run, all ran, the new text was written
 * - 'unchanged': the note had queries to run, all ran, the text was already up to date
 * - 'no-queries': the note holds no query that a refresh runs (none at all, or
 *   only manual / once / once-and-eject queries that are not run again)
 * - 'ignored': the per-note ignore flag of the frontmatter excludes it
 * - 'not-found': no Markdown file at that path
 * - 'conflict': the note changed during the refresh, so the write was refused
 * - 'failed': an exception or a query error; nothing was written for this note
 * - 'not-run': the report state is not 'ready'
 */
export type RefreshOutcome =
    | 'updated'
    | 'unchanged'
    | 'no-queries'
    | 'ignored'
    | 'not-found'
    | 'conflict'
    | 'failed'
    | 'not-run'

/** The result of `refreshNotes` for one note */
export interface RefreshedNote {
    /** The path as given to `refreshNotes` */
    path: string
    outcome: RefreshOutcome
    /**
     * Never empty when the outcome is 'failed'. An exception that is not tied
     * to a query has `query: ''`.
     */
    errors: Array<{ query: string; message: string }>
    /**
     * Queries left untouched on purpose (e.g. a FROM source that does not
     * exist keeps the previous output). Can be set with any outcome.
     */
    skipped: Array<{ query: string; reason: string }>
}

/** Outcome of a `refreshNotes` call. Plain data, safe to serialize as JSON. */
export interface RefreshReport {
    state: RefreshState
    /** Exactly one entry per input path, in input order (duplicates kept) */
    notes: RefreshedNote[]
}

/**
 * Public API of the plugin, for scripts, other plugins and AI agents:
 *
 * ```js
 * const api = app.plugins.plugins['dataview-serializer'].api
 * const report = await api.validateQueries()
 * const refresh = await api.refreshNotes(['Projects/Dashboard.md'])
 * ```
 *
 * - `validateQueries`: report broken queries (read-only)
 * - `fixSelfReferences`: replace self-references by name with `[[]]`
 * - `refreshNotes`: re-serialize the queries of the given notes now, and
 *   report exactly what happened to each one
 *
 * Results are plain data (JSON-serializable). Documented in `docs/api.md`.
 */
export interface DataviewSerializerApi {
    /**
     * Validate the queries of every note in scope ("Folders to scan", minus
     * ignored folders and notes with the per-note ignore flag), or of the
     * given notes. Read-only.
     *
     * @param options.runQueries also run each query through Dataview to report
     *        its errors (slow on large vaults; default false)
     * @param options.paths only validate these notes (vault paths)
     */
    validateQueries(options?: {
        runQueries?: boolean
        paths?: string[]
    }): Promise<QueryValidationReport>

    /**
     * Replace the self-references written by name (`[[My note]]`) in a note's
     * queries with `[[]]`, then re-serialize them (unless automatic updates
     * are disabled). Links with a heading or block part are left alone.
     *
     * @param path vault path of the note
     * @param query only fix this query (text as reported by validateQueries)
     * @returns the number of queries changed (0 when the plugin is disabled on
     *          this device or the note is excluded)
     */
    fixSelfReferences(path: string, query?: string): Promise<number>

    /**
     * Re-serialize the queries of the given notes now, for a caller that must
     * know which notes really were refreshed (e.g. before publishing them).
     *
     * Runs like an automatic update without its throttles: the cooldown,
     * "Folders to scan" and the ignored folders do not apply, the per-note
     * ignore flag does; manual queries and once queries that already have
     * output are not run again. Runs even when automatic updates are disabled.
     * A note with a failing query is not written at all. Shows no notice.
     *
     * @param paths vault paths of the notes
     * @returns one entry per path, in input order; when the plugin is
     *          disabled on this device, Dataview is not loaded or its index is
     *          still loading, nothing runs
     */
    refreshNotes(paths: string[]): Promise<RefreshReport>
}
