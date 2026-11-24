import type { QueryValidationReport } from './query-validator'

/**
 * Whether a `refreshNotes` call processed the notes. Anything but 'ready'
 * means nothing ran and every note has the outcome 'not-run'. Checked in this
 * order:
 * - 'disabled-on-device': the plugin is disabled on this device
 * - 'dataview-not-loaded': Dataview is not loaded
 * - 'dataview-index-not-ready': Dataview is still indexing the vault (just
 *   after startup), so queries would return incomplete results
 * - 'dataview-index-busy': Dataview has not indexed the latest saved version
 *   of every note yet, after waiting about 5 seconds (recent edits, a sync);
 *   `RefreshReport.stalePaths` names the first notes still behind
 */
export type RefreshState =
    | 'ready'
    | 'disabled-on-device'
    | 'dataview-not-loaded'
    | 'dataview-index-not-ready'
    | 'dataview-index-busy'

/**
 * What `refreshNotes` did with one note (when a call runs several passes, see
 * `refreshNotes`, the outcome of the last pass, 'updated' if any pass wrote):
 * - 'updated': the note had queries to run, none failed, and the new output
 *   was written (or the note already held exactly that text)
 * - 'unchanged': the note had queries to run, none failed, and the note already
 *   held their output (a query that was never serialized and returns nothing
 *   is left alone and counts as current)
 * - 'no-queries': the note holds no query that a refresh runs (none at all, or
 *   only manual queries and once queries that already have output), or is
 *   empty
 * - 'ignored': the per-note ignore flag of the frontmatter excludes it, or the
 *   serializer never processes that kind of file (a note named `Canvas.md`;
 *   an Excalidraw drawing, recognized only while the Excalidraw plugin runs)
 * - 'not-found': no Markdown file at exactly that path
 * - 'conflict': the note changed during the refresh, so the write was refused
 * - 'failed': an exception, a query error, or an output that could not be
 *   placed in the note; nothing was written by the last pass
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

/** A query that a refresh left untouched on purpose, and why */
export interface RefreshSkippedQuery {
    query: string
    reason: string
}

/** The result of `refreshNotes` for one note */
export interface RefreshedNote {
    /** The path as given to `refreshNotes` */
    path: string
    /**
     * The vault path of the note the entry is about (the path given, matched
     * exactly); null when no note was found or nothing ran
     */
    resolvedPath: string | null
    outcome: RefreshOutcome
    /**
     * Never empty when the outcome is 'failed'. An error that is not tied to a
     * query has `query: ''`. Also set on an 'updated' or 'unchanged' note when
     * the passes of the call did not settle: the note may still list an older
     * version of another note of the call.
     */
    errors: Array<{ query: string; message: string }>
    /**
     * Queries left untouched on purpose, which keep their previous output (a
     * FROM source that does not exist, a DataviewJS query while DataviewJS
     * support is off). Can be set with any outcome.
     */
    skipped: RefreshSkippedQuery[]
}

/** Outcome of a `refreshNotes` call. Plain data, safe to serialize as JSON. */
export interface RefreshReport {
    state: RefreshState
    /**
     * With 'dataview-index-busy' only: the first notes Dataview has not
     * indexed at their saved version
     */
    stalePaths?: string[]
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
     * Reads the notes from disk. An empty result clears an existing result
     * block (an inline query shows `-`). A note with a failing query, or whose
     * output cannot be put in its place, is not written at all. Shows no notice.
     *
     * Waits up to about 5 seconds for Dataview to index recent edits: let
     * Obsidian save and index your own edits before calling it. When a pass
     * wrote a note, runs another pass (at most 3) once Dataview indexed the
     * writes, so notes of one call that list each other are current.
     *
     * @param paths vault paths of the notes, matched exactly
     * @returns one entry per path, in input order; when the plugin is
     *          disabled on this device, Dataview is not loaded, or its index is
     *          loading or behind, nothing runs (see `RefreshState`)
     * @throws TypeError when `paths` is not an array
     */
    refreshNotes(paths: string[]): Promise<RefreshReport>
}
