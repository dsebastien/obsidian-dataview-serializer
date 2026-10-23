import { ButtonComponent, Keymap, Modal, Notice } from 'obsidian'
import type { App } from 'obsidian'
import { NOTICE_TIMEOUT } from '../constants'
import type { QueryValidationReport, QueryValidator } from '../query-validator'
import { log } from '../../utils/log'
import { isFixableSelfReference } from '../utils/validate-queries.fn'

const PROBLEM_LABELS = {
    'unresolved-link': 'Missing note',
    'unresolved-path': 'Missing folder or file',
    'self-reference': 'Self-reference by name',
    'dataview-error': 'Dataview error'
} as const

/**
 * Report of the "Validate all queries" command: notes → queries → problems,
 * with links to open each note and one-click fixes for self-references.
 */
export class QueryValidationModal extends Modal {
    private report: QueryValidationReport | null = null
    private busy = false

    constructor(
        app: App,
        private readonly validator: QueryValidator,
        private readonly canWrite: () => boolean
    ) {
        super(app)
    }

    override onOpen(): void {
        this.setTitle('Validate queries')
        this.modalEl.addClass('dvs-validation-modal')
        void this.run(false)
    }

    override onClose(): void {
        this.contentEl.empty()
    }

    /** Validate the vault (or re-validate), showing progress meanwhile */
    private async run(runQueries: boolean): Promise<void> {
        if (this.busy) {
            return
        }
        this.busy = true
        this.contentEl.empty()
        const progressEl = this.contentEl.createDiv({
            cls: 'dvs-validation-summary',
            text: 'Scanning…'
        })

        try {
            this.report = await this.validator.validate({
                runQueries,
                onProgress: (processed, total) => {
                    progressEl.setText(
                        `${runQueries ? 'Running' : 'Scanning'} queries: ${processed}/${total} notes…`
                    )
                }
            })
        } catch (error) {
            log('Query validation failed', 'error', error)
            progressEl.setText(
                `Validation failed: ${error instanceof Error ? error.message : String(error)}`
            )
            return
        } finally {
            this.busy = false
        }

        this.render()
    }

    private fixableCount(): number {
        return (this.report?.notes ?? []).reduce(
            (sum, note) =>
                sum +
                note.issues.filter((issue) => issue.problems.some(isFixableSelfReference)).length,
            0
        )
    }

    private render(): void {
        const report = this.report
        if (!report) {
            return
        }
        const { contentEl } = this
        contentEl.empty()

        contentEl.createDiv({
            cls: 'dvs-validation-summary',
            text:
                report.problemCount === 0
                    ? `No problems found in ${report.queriesScanned} queries across ${report.notesScanned} notes.`
                    : `${report.problemCount} problem(s) in ${report.notes.length} note(s). ${report.queriesScanned} queries checked across ${report.notesScanned} notes${report.ranQueries ? ', Dataview errors included' : ''}.`
        })

        const actionsEl = contentEl.createDiv({ cls: 'dvs-validation-actions' })
        const fixable = this.fixableCount()
        if (fixable > 0 && this.canWrite()) {
            new ButtonComponent(actionsEl)
                .setButtonText(`Fix all self-references (${fixable})`)
                .setCta()
                .onClick(() => void this.fixAll())
        }
        if (!report.ranQueries) {
            new ButtonComponent(actionsEl)
                .setButtonText('Also check Dataview errors (slow)')
                .setTooltip('Runs every query through Dataview to report its errors')
                .onClick(() => void this.run(true))
        }
        new ButtonComponent(actionsEl)
            .setButtonText('Re-scan')
            .onClick(() => void this.run(report.ranQueries))

        const listEl = contentEl.createDiv({ cls: 'dvs-validation-list' })
        for (const note of report.notes) {
            const noteEl = listEl.createDiv({ cls: 'dvs-validation-note' })
            const linkEl = noteEl.createEl('a', {
                cls: 'dvs-validation-note-link internal-link',
                text: note.path,
                href: '#'
            })
            linkEl.addEventListener('click', (evt) => {
                evt.preventDefault()
                void this.app.workspace.openLinkText(note.path, '', Keymap.isModEvent(evt))
                this.close()
            })

            for (const issue of note.issues) {
                const queryEl = noteEl.createDiv({ cls: 'dvs-validation-query' })
                const headerEl = queryEl.createDiv({ cls: 'dvs-validation-query-header' })
                headerEl.createEl('code', { text: issue.query })
                if (issue.problems.some(isFixableSelfReference) && this.canWrite()) {
                    new ButtonComponent(headerEl)
                        .setButtonText('Fix')
                        .setTooltip('Replace self-references with [[]]')
                        .onClick(() => void this.fixOne(note.path, issue.query))
                }

                const problemsEl = queryEl.createEl('ul', { cls: 'dvs-validation-problems' })
                for (const problem of issue.problems) {
                    const itemEl = problemsEl.createEl('li')
                    itemEl.createSpan({
                        cls: `dvs-validation-problem-type dvs-validation-${problem.type}`,
                        text: PROBLEM_LABELS[problem.type]
                    })
                    itemEl.createSpan({ text: ` ${problem.message}` })
                }
            }
        }
    }

    private async fixOne(path: string, query: string): Promise<void> {
        const fixed = await this.validator.fixSelfReferences(path, query)
        new Notice(
            fixed > 0
                ? 'Dataview Serializer: self-references replaced with [[]].'
                : 'Dataview Serializer: nothing to fix (the note changed or is excluded).',
            NOTICE_TIMEOUT
        )
        await this.refreshNotes([path])
    }

    private async fixAll(): Promise<void> {
        const paths = (this.report?.notes ?? [])
            .filter((note) =>
                note.issues.some((issue) => issue.problems.some(isFixableSelfReference))
            )
            .map((note) => note.path)

        let queries = 0
        for (const path of paths) {
            queries += await this.validator.fixSelfReferences(path)
        }
        new Notice(
            `Dataview Serializer: replaced self-references with [[]] in ${queries} queries across ${paths.length} notes.`,
            NOTICE_TIMEOUT
        )
        await this.refreshNotes(paths)
    }

    /** Re-validate some notes and update the report in place */
    private async refreshNotes(paths: string[]): Promise<void> {
        const report = this.report
        if (!report) {
            return
        }
        const partial = await this.validator.validate({ paths, runQueries: report.ranQueries })
        const replaced = new Map(partial.notes.map((note) => [note.path, note]))

        report.notes = report.notes.flatMap((note) => {
            if (!paths.includes(note.path)) {
                return [note]
            }
            const updated = replaced.get(note.path)
            return updated ? [updated] : []
        })
        report.problemCount = report.notes.reduce(
            (sum, note) =>
                sum + note.issues.reduce((count, issue) => count + issue.problems.length, 0),
            0
        )
        this.render()
    }
}
