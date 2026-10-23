import { normalizePath, TFile } from 'obsidian'
import type { App } from 'obsidian'
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import { MARKDOWN_FILE_EXTENSION, QUERY_REFERENCE_INDEX_CHUNK_SIZE } from './constants'
import { log } from '../utils/log'
import { isInScanScope } from './utils/is-in-scan-scope.fn'
import { serializeInlineQuery } from './utils/serialize-inline-query.fn'
import {
    fixSelfReferences,
    validateNoteQueries,
    type QueryValidationContext,
    type QueryValidationIssue
} from './utils/validate-queries.fn'

/** Options of a validation run */
export interface ValidateQueriesOptions {
    /**
     * Also run every query through Dataview to report its errors. Slow on
     * large vaults (it runs every query), hence off by default. Queries with
     * unresolved references are not run.
     */
    runQueries?: boolean
    /** Only validate these notes (vault paths); default: every note in scope */
    paths?: string[]
    /** Progress callback: notes processed so far, out of total */
    onProgress?: (processed: number, total: number) => void
}

/** The problems of one note */
export interface NoteValidationResult {
    path: string
    issues: QueryValidationIssue[]
}

/** Outcome of a validation run. Plain data, safe to serialize as JSON. */
export interface QueryValidationReport {
    notesScanned: number
    queriesScanned: number
    /** True when Dataview errors were checked (`runQueries`) */
    ranQueries: boolean
    /** Total problems, across all notes */
    problemCount: number
    /** Notes with at least one problem, in vault order */
    notes: NoteValidationResult[]
}

/** What the validator needs from the plugin */
export interface QueryValidatorHost {
    app: App
    getDataviewApi(): DataviewApi | undefined
    /** "Folders to scan" (empty: whole vault) */
    getFoldersToScan(): readonly string[]
    /** True when the note is never processed (frontmatter opt-out, ignored folder…) */
    isNoteExcluded(file: TFile): boolean
    /** True when the plugin must not write anything (disabled on this device) */
    isWritingBlocked(): boolean
    /** Called just before a fix is written (silences the plugin's own modify handler) */
    beforeWrite(file: TFile): void
    /** Called with the notes a fix rewrote (to refresh their serialized output) */
    afterFix(files: TFile[]): Promise<void>
}

/**
 * Vault-wide query validation (#89) and the self-reference fix. Static
 * checks (unresolved FROM sources, self-references by name) read note
 * content only; Dataview errors are opt-in because they require running
 * every query.
 */
export class QueryValidator {
    constructor(private readonly host: QueryValidatorHost) {}

    private contextFor(notePath: string): QueryValidationContext {
        const { metadataCache, vault } = this.host.app
        return {
            notePath,
            resolveLink: (linkpath) =>
                metadataCache.getFirstLinkpathDest(linkpath, notePath)?.path ?? null,
            pathExists: (path) => {
                const normalized = normalizePath(path)
                return (
                    vault.getAbstractFileByPath(normalized) !== null ||
                    vault.getAbstractFileByPath(`${normalized}.md`) !== null
                )
            }
        }
    }

    private notesInScope(paths?: string[]): TFile[] {
        const { vault } = this.host.app
        const files = paths
            ? paths
                  .map((path) => vault.getFileByPath(path))
                  .filter((file): file is TFile => file !== null)
            : vault
                  .getMarkdownFiles()
                  .filter((file) => isInScanScope(file.path, this.host.getFoldersToScan()))
        return files.filter(
            (file) => file.extension === MARKDOWN_FILE_EXTENSION && !this.host.isNoteExcluded(file)
        )
    }

    async validate(options: ValidateQueriesOptions = {}): Promise<QueryValidationReport> {
        const runQueries = options.runQueries === true
        const dataviewApi = runQueries ? this.host.getDataviewApi() : undefined
        if (runQueries && !dataviewApi) {
            throw new Error('Dataview is not available: cannot run queries')
        }

        const files = this.notesInScope(options.paths)
        const report: QueryValidationReport = {
            notesScanned: files.length,
            queriesScanned: 0,
            ranQueries: runQueries,
            problemCount: 0,
            notes: []
        }
        options.onProgress?.(0, files.length)

        // Dataview runs one query at a time; static checks read in chunks
        const chunkSize = runQueries ? 1 : QUERY_REFERENCE_INDEX_CHUNK_SIZE
        for (let i = 0; i < files.length; i += chunkSize) {
            const chunk = files.slice(i, i + chunkSize)
            const results = await Promise.all(
                chunk.map((file) => this.validateNote(file, dataviewApi))
            )
            for (const result of results) {
                report.queriesScanned += result.queryCount
                if (result.issues.length > 0) {
                    report.notes.push({ path: result.path, issues: result.issues })
                    report.problemCount += result.issues.reduce(
                        (sum, issue) => sum + issue.problems.length,
                        0
                    )
                }
            }
            options.onProgress?.(Math.min(i + chunkSize, files.length), files.length)
            await sleep(0)
        }

        log(
            `Validated ${report.queriesScanned} query(ies) in ${report.notesScanned} note(s): ${report.problemCount} problem(s) in ${report.notes.length} note(s)`,
            'info'
        )
        return report
    }

    /** Validate the queries of one note */
    private async validateNote(
        file: TFile,
        dataviewApi: DataviewApi | undefined
    ): Promise<{ path: string; queryCount: number; issues: QueryValidationIssue[] }> {
        let content: string
        try {
            content = await this.host.app.vault.cachedRead(file)
        } catch (error) {
            log(`Could not read [${file.path}] for validation`, 'warn', error)
            return { path: file.path, queryCount: 0, issues: [] }
        }

        const { queryCount, results } = validateNoteQueries(content, this.contextFor(file.path))
        const issues: QueryValidationIssue[] = []

        for (const { query, queryType, problems } of results) {
            const hasUnresolved = problems.some(
                (problem) =>
                    problem.type === 'unresolved-link' || problem.type === 'unresolved-path'
            )
            if (dataviewApi && !hasUnresolved) {
                const error = await this.runQuery(query, queryType, file.path, dataviewApi)
                if (error !== null) {
                    problems.push({ type: 'dataview-error', message: error })
                }
            }
            if (problems.length > 0) {
                issues.push({ query, queryType, problems })
            }
        }

        return { path: file.path, queryCount, issues }
    }

    /** The Dataview error of a query, or null when it runs */
    private async runQuery(
        query: string,
        queryType: 'block' | 'inline',
        originFile: string,
        dataviewApi: DataviewApi
    ): Promise<string | null> {
        try {
            if (queryType === 'inline') {
                const result = serializeInlineQuery({ expression: query, originFile, dataviewApi })
                return result.success ? null : (result.error?.message ?? 'Unknown error')
            }
            const result = await dataviewApi.query(query, originFile)
            return result.successful ? null : result.error
        } catch (error) {
            return error instanceof Error ? error.message : String(error)
        }
    }

    /**
     * Replace the fixable self-references of a note's queries with `[[]]`.
     *
     * @param query only fix this query (as reported); default: every query
     * @returns the number of queries changed (0 when writing is blocked or the note is excluded)
     */
    async fixSelfReferences(path: string, query?: string): Promise<number> {
        if (this.host.isWritingBlocked()) {
            return 0
        }
        const file = this.host.app.vault.getFileByPath(path)
        if (!file || file.extension !== MARKDOWN_FILE_EXTENSION || this.host.isNoteExcluded(file)) {
            return 0
        }

        const context = this.contextFor(file.path)
        let queriesFixed = 0
        await this.host.app.vault.process(file, (data) => {
            const result = fixSelfReferences(data, context, query)
            queriesFixed = result.queriesFixed
            if (result.content !== data) {
                this.host.beforeWrite(file)
            }
            return result.content
        })

        if (queriesFixed > 0) {
            log(
                `Replaced self-references with [[]] in ${queriesFixed} query(ies) of [${path}]`,
                'info'
            )
            await this.host.afterFix([file])
        }
        return queriesFixed
    }
}
