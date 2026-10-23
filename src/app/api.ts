import type { QueryValidationReport } from './query-validator'

/**
 * Public API of the plugin, for scripts and AI agents:
 *
 * ```js
 * const api = app.plugins.plugins['dataview-serializer'].api
 * const report = await api.validateQueries()
 * ```
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
}
