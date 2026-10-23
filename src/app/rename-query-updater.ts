import { Notice, TFile, TFolder } from 'obsidian'
import type { App, EventRef, TAbstractFile } from 'obsidian'
import {
    MARKDOWN_FILE_EXTENSION,
    NOTICE_TIMEOUT,
    QUERY_REFERENCE_INDEX_CHUNK_SIZE,
    RENAME_BATCH_DELAY_MS,
    RENAME_SETTLE_RECHECK_MS
} from './constants'
import { log } from '../utils/log'
import { QueryReferenceIndex } from './utils/query-reference-index'
import {
    buildRenameUpdateNotice,
    collapseRenames,
    rewriteQueryCommentsForRenames,
    type LinkResolver,
    type RenameOperation
} from './utils/rewrite-renamed-references.fn'

/** What the updater needs from the plugin */
export interface RenameQueryUpdaterHost {
    app: App
    /** Register an event for cleanup on plugin unload */
    registerEvent(eventRef: EventRef): void
    /** True when the note must not be touched (frontmatter opt-out, ignored folder) */
    isNoteExcluded(file: TFile): boolean
    /** Called just before the updater writes a note (silences the plugin's own modify handler) */
    beforeWrite(file: TFile): void
    /** Called with the notes the updater rewrote (to refresh their serialized output) */
    afterRewrite(files: TFile[]): Promise<void>
    showErrorNotifications(): boolean
}

/** Outcome of one rename batch */
export interface RenameBatchResult {
    queriesUpdated: number
    notesUpdated: TFile[]
}

const isMarkdownFile = (file: TAbstractFile): file is TFile =>
    file instanceof TFile && file.extension === MARKDOWN_FILE_EXTENSION

/**
 * Rewrites query references when notes or folders are renamed (#87).
 *
 * - Index: {@link QueryReferenceIndex}, built in the background once started
 *   (chunks of `cachedRead`), then kept current from create/modify/delete/
 *   rename events. Modified notes are re-read after a short debounce.
 * - Batching: rename events are collected and processed once the vault has
 *   been quiet for {@link RENAME_BATCH_DELAY_MS}. A folder rename fires one
 *   event per descendant plus one for the folder; they become one batch, and
 *   each affected note is written at most once per batch.
 * - Writes: `vault.process` (atomic, reads the latest content, so link updates
 *   Obsidian made in the meantime are kept); only query comment text changes.
 *   A recheck after {@link RENAME_SETTLE_RECHECK_MS} reapplies the batch to
 *   the notes it wrote, in case a concurrent writer overwrote the change.
 */
export class RenameQueryUpdater {
    private readonly index = new QueryReferenceIndex()
    private eventRefs: EventRef[] = []
    private running = false
    private indexBuild: Promise<void> = Promise.resolve()

    private pendingRenames: RenameOperation[] = []
    private batchTimer: number | null = null
    private batchChain: Promise<unknown> = Promise.resolve()

    /** Bumped on every rename event, so a recheck can tell it is outdated */
    private renameEventCount = 0

    private pendingReindex = new Set<string>()
    private reindexTimer: number | null = null

    constructor(private readonly host: RenameQueryUpdaterHost) {}

    get isRunning(): boolean {
        return this.running
    }

    /** Listen to vault events and build the index in the background */
    start(): void {
        if (this.running) {
            return
        }
        this.running = true
        const { vault } = this.host.app

        this.eventRefs = [
            vault.on('rename', (file, oldPath) => this.onRename(file, oldPath)),
            vault.on('modify', (file) => this.scheduleReindex(file)),
            vault.on('create', (file) => this.scheduleReindex(file)),
            vault.on('delete', (file) => {
                this.index.remove(file.path)
                this.pendingReindex.delete(file.path)
            })
        ]
        this.eventRefs.forEach((ref) => this.host.registerEvent(ref))

        this.indexBuild = this.buildIndex()
    }

    /** Stop listening and drop the index and any pending batch */
    stop(): void {
        if (!this.running) {
            return
        }
        this.running = false
        this.eventRefs.forEach((ref) => this.host.app.vault.offref(ref))
        this.eventRefs = []
        if (this.batchTimer !== null) {
            window.clearTimeout(this.batchTimer)
            this.batchTimer = null
        }
        if (this.reindexTimer !== null) {
            window.clearTimeout(this.reindexTimer)
            this.reindexTimer = null
        }
        this.pendingRenames = []
        this.pendingReindex.clear()
        this.index.clear()
    }

    private async buildIndex(): Promise<void> {
        const startedAt = Date.now()
        const files = this.host.app.vault.getMarkdownFiles()

        for (let i = 0; i < files.length; i += QUERY_REFERENCE_INDEX_CHUNK_SIZE) {
            if (!this.running) {
                return
            }
            await Promise.all(
                files
                    .slice(i, i + QUERY_REFERENCE_INDEX_CHUNK_SIZE)
                    .map((file) => this.reindex(file))
            )
            // Yield so that a large vault never blocks the UI
            await sleep(0)
        }

        log(
            `Query reference index built in ${Date.now() - startedAt}ms: ${files.length} notes read, ${this.index.noteCount} with references (${this.index.referenceCount} distinct)`,
            'debug'
        )
    }

    private async reindex(file: TFile): Promise<void> {
        try {
            const content = await this.host.app.vault.cachedRead(file)
            // Read the path after the await: the note may have been renamed meanwhile
            if (this.running && this.host.app.vault.getFileByPath(file.path) === file) {
                this.index.update(file.path, content)
            }
        } catch (error) {
            log(`Could not index the queries of [${file.path}]`, 'warn', error)
        }
    }

    private scheduleReindex(file: TAbstractFile): void {
        if (!isMarkdownFile(file)) {
            return
        }
        this.pendingReindex.add(file.path)
        if (this.reindexTimer !== null) {
            window.clearTimeout(this.reindexTimer)
        }
        this.reindexTimer = window.setTimeout(() => {
            this.reindexTimer = null
            void this.flushReindex()
        }, RENAME_BATCH_DELAY_MS)
    }

    private async flushReindex(): Promise<void> {
        const paths = [...this.pendingReindex]
        this.pendingReindex.clear()
        const { vault } = this.host.app
        await Promise.all(
            paths.map((path) => {
                const file = vault.getFileByPath(path)
                return file ? this.reindex(file) : Promise.resolve()
            })
        )
    }

    private onRename(file: TAbstractFile, oldPath: string): void {
        this.renameEventCount++
        this.index.rename(oldPath, file.path)
        if (this.pendingReindex.delete(oldPath)) {
            this.pendingReindex.add(file.path)
        }

        this.pendingRenames.push({
            kind: file instanceof TFolder ? 'folder' : 'file',
            oldPath,
            newPath: file.path
        })

        if (this.batchTimer !== null) {
            window.clearTimeout(this.batchTimer)
        }
        this.batchTimer = window.setTimeout(() => {
            this.batchTimer = null
            const renames = collapseRenames(this.pendingRenames)
            this.pendingRenames = []
            // One batch at a time: a later batch sees what an earlier one wrote
            this.batchChain = this.batchChain
                .then(() => this.processBatch(renames))
                .catch((error: unknown) =>
                    log('Could not update renamed references', 'error', error)
                )
        }, RENAME_BATCH_DELAY_MS)
    }

    /**
     * Rewrite the queries referencing the renamed entries.
     * Public for programmatic use and debugging; normally driven by events.
     */
    async processBatch(renames: RenameOperation[]): Promise<RenameBatchResult> {
        const result: RenameBatchResult = { queriesUpdated: 0, notesUpdated: [] }
        if (!this.running || renames.length === 0) {
            return result
        }

        await this.indexBuild
        await this.flushReindex()

        const candidates = this.index.notesAffectedBy(renames)
        log(
            `Rename batch of ${renames.length} entr(ies): ${candidates.size} note(s) may reference them`,
            'debug'
        )

        for (const path of candidates) {
            const outcome = await this.rewriteNote(
                path,
                this.index.renamesConcerning(path, renames)
            )
            if (outcome) {
                result.queriesUpdated += outcome.queriesUpdated
                result.notesUpdated.push(outcome.file)
            }
        }

        if (result.notesUpdated.length === 0) {
            return result
        }

        new Notice(
            buildRenameUpdateNotice(result.queriesUpdated, result.notesUpdated.length, renames),
            NOTICE_TIMEOUT
        )

        const written = result.notesUpdated.map((file) => file.path)
        const eventCountAtWrite = this.renameEventCount
        window.setTimeout(() => {
            // A newer rename supersedes this batch (renaming back must not be undone)
            if (this.renameEventCount === eventCountAtWrite) {
                this.batchChain = this.batchChain
                    .then(() => this.recheck(written, renames))
                    .catch((error: unknown) =>
                        log('Could not recheck renamed references', 'error', error)
                    )
            }
        }, RENAME_SETTLE_RECHECK_MS)

        await this.host.afterRewrite(result.notesUpdated)
        return result
    }

    /**
     * Reapply a batch to the notes it wrote. Rewriting is idempotent, so this
     * only changes a note whose rewrite was lost to a concurrent write.
     */
    private async recheck(paths: string[], renames: RenameOperation[]): Promise<void> {
        if (!this.running) {
            return
        }
        const repaired: TFile[] = []
        for (const path of paths) {
            const outcome = await this.rewriteNote(path, renames)
            if (outcome) {
                repaired.push(outcome.file)
            }
        }
        if (repaired.length > 0) {
            log(
                `Reapplied renamed references in ${repaired.length} note(s) after a concurrent write`,
                'info'
            )
            await this.host.afterRewrite(repaired)
        }
    }

    private async rewriteNote(
        path: string,
        renames: RenameOperation[]
    ): Promise<{ file: TFile; queriesUpdated: number } | null> {
        const { vault, metadataCache } = this.host.app
        const file = vault.getFileByPath(path)
        if (
            !file ||
            !isMarkdownFile(file) ||
            renames.length === 0 ||
            this.host.isNoteExcluded(file)
        ) {
            return null
        }

        const resolve: LinkResolver = (linkpath) =>
            metadataCache.getFirstLinkpathDest(linkpath, file.path)?.path ?? null

        let queriesUpdated = 0
        let newContent: string | null = null
        try {
            await vault.process(file, (data) => {
                const rewrite = rewriteQueryCommentsForRenames(data, renames, resolve)
                if (rewrite.changedComments.length === 0) {
                    return data
                }
                queriesUpdated = rewrite.queriesUpdated
                newContent = rewrite.content
                this.host.beforeWrite(file)
                return rewrite.content
            })
        } catch (error) {
            log(`Could not update renamed references in [${path}]`, 'error', error)
            if (this.host.showErrorNotifications()) {
                new Notice(
                    `Dataview Serializer: could not update the queries of "${file.basename}" after a rename. See the console for details.`,
                    NOTICE_TIMEOUT
                )
            }
            return null
        }

        if (newContent === null) {
            return null
        }
        this.index.update(file.path, newContent)
        log(`Updated ${queriesUpdated} query(ies) in [${path}] after a rename`, 'info')
        return { file, queriesUpdated }
    }
}
