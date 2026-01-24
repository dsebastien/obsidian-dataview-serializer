import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { App, MarkdownView, Notice, setIcon, TFile } from 'obsidian'
import {
    NOTICE_TIMEOUT,
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_OPEN,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_START
} from './constants'
import type { PluginSettings } from './types/plugin-settings.intf'

type QueryType = 'auto' | 'manual' | 'once' | 'eject'

interface QueryFlagInfo {
    flagOpen: string
    openIdx: number
    queryType: QueryType
}

/**
 * Detect which query flag is present in a line and return the flag info
 */
function detectQueryFlagInLine(text: string): QueryFlagInfo | null {
    // Check in order of specificity (longer prefixes first)
    const ejectIdx = text.indexOf(QUERY_FLAG_ONCE_AND_EJECT_OPEN)
    if (ejectIdx !== -1) {
        return { flagOpen: QUERY_FLAG_ONCE_AND_EJECT_OPEN, openIdx: ejectIdx, queryType: 'eject' }
    }
    const manualIdx = text.indexOf(QUERY_FLAG_MANUAL_OPEN)
    if (manualIdx !== -1) {
        return { flagOpen: QUERY_FLAG_MANUAL_OPEN, openIdx: manualIdx, queryType: 'manual' }
    }
    const onceIdx = text.indexOf(QUERY_FLAG_ONCE_OPEN)
    if (onceIdx !== -1) {
        return { flagOpen: QUERY_FLAG_ONCE_OPEN, openIdx: onceIdx, queryType: 'once' }
    }
    const autoIdx = text.indexOf(QUERY_FLAG_OPEN)
    if (autoIdx !== -1) {
        return { flagOpen: QUERY_FLAG_OPEN, openIdx: autoIdx, queryType: 'auto' }
    }
    return null
}

interface FileProcessingResult {
    filePath: string
    errors: Array<{
        message: string
        query: string
    }>
}

/**
 * Get the display label and icon for a query type
 */
function getQueryTypeInfo(queryType: QueryType): { label: string; icon: string } {
    switch (queryType) {
        case 'auto':
            return { label: 'auto', icon: 'refresh-cw' }
        case 'manual':
            return { label: 'manual', icon: 'hand' }
        case 'once':
            return { label: 'once', icon: 'circle-1' }
        case 'eject':
            return { label: 'eject', icon: 'log-out' }
    }
}

/**
 * Create the query type badge element
 */
function createQueryBadge(queryType: QueryType): HTMLElement {
    const badge = document.createElement('span')
    badge.className = `dvs-query-badge dvs-query-badge-${queryType}`

    const info = getQueryTypeInfo(queryType)

    const iconSpan = document.createElement('span')
    iconSpan.className = 'dvs-badge-icon'
    setIcon(iconSpan, info.icon)

    const labelSpan = document.createElement('span')
    labelSpan.textContent = info.label

    badge.appendChild(iconSpan)
    badge.appendChild(labelSpan)

    return badge
}

function createRefreshButton(onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'dvs-refresh-button'
    btn.setAttribute('aria-label', 'Refresh Dataview Query')
    setIcon(btn, 'refresh-cw')

    btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
    })

    return btn
}

// Line decoration classes
const queryLineDecoration = Decoration.line({ class: 'dvs-query-line' })
const resultsStartDecoration = Decoration.line({ class: 'dvs-results-start-line' })
const resultsEndDecoration = Decoration.line({ class: 'dvs-results-end-line' })

export const refreshButtonExtension = (
    app: App,
    getSettings: () => PluginSettings,
    processFile: (
        file: TFile,
        force?: boolean,
        targetQuery?: string,
        isManualTrigger?: boolean
    ) => Promise<FileProcessingResult>
) =>
    ViewPlugin.fromClass(
        class {
            decorations: DecorationSet

            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view)
            }

            update(update: ViewUpdate): void {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view)
                }
            }

            buildDecorations(view: EditorView): DecorationSet {
                const settings = getSettings()
                const decorations: Array<{ from: number; to: number; decoration: Decoration }> = []

                /**
                 * Widget for query badges and refresh button
                 */
                class QueryWidgetGroup extends WidgetType {
                    constructor(
                        private query: string,
                        private queryType: QueryType
                    ) {
                        super()
                    }

                    toDOM(editorView: EditorView): HTMLElement {
                        const container = document.createElement('span')
                        container.className = 'dvs-query-widgets'

                        // Add query type badge
                        const badge = createQueryBadge(this.queryType)
                        container.appendChild(badge)

                        // Add refresh button if enabled
                        if (settings.showRefreshButton) {
                            const btn = createRefreshButton(async () => {
                                try {
                                    const leaf = app.workspace
                                        .getLeavesOfType('markdown')
                                        .find(
                                            (leaf) =>
                                                leaf.view instanceof MarkdownView &&
                                                leaf.view.contentEl.contains(editorView.dom)
                                        )

                                    if (!(leaf?.view instanceof MarkdownView)) return
                                    const file = leaf.view.file
                                    if (!file) return

                                    const result = await processFile(file, true, this.query, true)

                                    // Check for errors
                                    const firstError = result.errors[0]
                                    if (firstError) {
                                        const truncatedQuery =
                                            firstError.query.length > 50
                                                ? firstError.query.substring(0, 50) + '...'
                                                : firstError.query
                                        new Notice(
                                            `Query failed:\n"${truncatedQuery}"\n${firstError.message}`,
                                            NOTICE_TIMEOUT * 2
                                        )
                                    } else {
                                        new Notice('Dataview query serialized')
                                    }
                                } catch (err) {
                                    console.error('Failed to refresh dataview query', err)
                                    new Notice('Failed to refresh dataview query')
                                }
                            })

                            container.appendChild(btn)
                        }

                        return container
                    }
                }

                for (const { from, to } of view.visibleRanges) {
                    const startLine = view.state.doc.lineAt(from)
                    const endLine = view.state.doc.lineAt(to)

                    for (let i = startLine.number; i <= endLine.number; i++) {
                        const line = view.state.doc.line(i)
                        const text = line.text

                        // Check for query definition line
                        const flagInfo = detectQueryFlagInLine(text)
                        if (flagInfo) {
                            const { flagOpen, openIdx, queryType } = flagInfo
                            const closeIdx = text.indexOf(QUERY_FLAG_CLOSE, openIdx)
                            if (closeIdx !== -1) {
                                // Add line decoration
                                decorations.push({
                                    from: line.from,
                                    to: line.from,
                                    decoration: queryLineDecoration
                                })

                                // Add widget with badge and refresh button
                                const query = text
                                    .substring(openIdx + flagOpen.length, closeIdx)
                                    .trim()
                                const endPos = line.from + closeIdx + QUERY_FLAG_CLOSE.length

                                decorations.push({
                                    from: endPos,
                                    to: endPos,
                                    decoration: Decoration.widget({
                                        widget: new QueryWidgetGroup(query, queryType),
                                        side: 1
                                    })
                                })
                            }
                        }

                        // Check for serialized query start line
                        if (text.includes(SERIALIZED_QUERY_START)) {
                            decorations.push({
                                from: line.from,
                                to: line.from,
                                decoration: resultsStartDecoration
                            })
                        }

                        // Check for serialized query end line
                        if (text.includes(SERIALIZED_QUERY_END)) {
                            decorations.push({
                                from: line.from,
                                to: line.from,
                                decoration: resultsEndDecoration
                            })
                        }
                    }
                }

                // Sort decorations by position (required by RangeSetBuilder)
                decorations.sort((a, b) => a.from - b.from || a.to - b.to)

                const builder = new RangeSetBuilder<Decoration>()
                for (const { from, to, decoration } of decorations) {
                    builder.add(from, to, decoration)
                }

                return builder.finish()
            }
        },
        {
            decorations: (v) => v.decorations
        }
    )
