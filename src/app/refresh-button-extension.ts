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
    SERIALIZED_QUERY_START,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_FLAG_MANUAL_OPEN,
    INLINE_QUERY_FLAG_ONCE_OPEN,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    INLINE_QUERY_FLAG_CLOSE,
    INLINE_QUERY_END
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

/**
 * Interface for inline query flag info
 */
interface InlineQueryFlagInfo {
    flagOpen: string
    openIdx: number
    queryType: QueryType
    expression: string
    endIdx: number
}

/**
 * Detect inline query flags in a line and return all found inline queries.
 * Inline queries can appear multiple times on the same line.
 */
function detectInlineQueriesInLine(text: string): InlineQueryFlagInfo[] {
    const results: InlineQueryFlagInfo[] = []

    // All inline query flags in order of specificity (longer prefixes first)
    const flags: Array<{ flag: string; queryType: QueryType }> = [
        { flag: INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN, queryType: 'eject' },
        { flag: INLINE_QUERY_FLAG_MANUAL_OPEN, queryType: 'manual' },
        { flag: INLINE_QUERY_FLAG_ONCE_OPEN, queryType: 'once' },
        { flag: INLINE_QUERY_FLAG_OPEN, queryType: 'auto' }
    ]

    // Search for each flag type
    for (const { flag, queryType } of flags) {
        let searchStart = 0
        while (true) {
            const openIdx = text.indexOf(flag, searchStart)
            if (openIdx === -1) break

            // Find the closing flag
            const closeIdx = text.indexOf(INLINE_QUERY_FLAG_CLOSE, openIdx + flag.length)
            if (closeIdx === -1) {
                searchStart = openIdx + 1
                continue
            }

            // Find the end marker
            const endIdx = text.indexOf(INLINE_QUERY_END, closeIdx)
            if (endIdx === -1) {
                searchStart = openIdx + 1
                continue
            }

            // Extract the expression
            const expression = text.substring(openIdx + flag.length, closeIdx).trim()

            // Check if this position is already covered by a more specific flag
            const alreadyCovered = results.some((r) => r.openIdx === openIdx && r.flagOpen !== flag)

            if (!alreadyCovered && expression) {
                results.push({
                    flagOpen: flag,
                    openIdx,
                    queryType,
                    expression,
                    endIdx: endIdx + INLINE_QUERY_END.length
                })
            }

            searchStart = endIdx + INLINE_QUERY_END.length
        }
    }

    // Sort by position and remove duplicates
    results.sort((a, b) => a.openIdx - b.openIdx)
    const seen = new Set<number>()
    return results.filter((r) => {
        if (seen.has(r.openIdx)) return false
        seen.add(r.openIdx)
        return true
    })
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
const inlineQueryDecoration = Decoration.mark({ class: 'dvs-inline-query' })

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

                /**
                 * Widget for inline query badges and refresh button
                 */
                class InlineQueryWidgetGroup extends WidgetType {
                    constructor(
                        private expression: string,
                        private queryType: QueryType
                    ) {
                        super()
                    }

                    toDOM(editorView: EditorView): HTMLElement {
                        const container = document.createElement('span')
                        container.className = 'dvs-inline-query-widgets'

                        // Add query type badge (smaller for inline)
                        const badge = document.createElement('span')
                        badge.className = `dvs-inline-badge dvs-inline-badge-${this.queryType}`

                        const info = getQueryTypeInfo(this.queryType)
                        const iconSpan = document.createElement('span')
                        iconSpan.className = 'dvs-inline-badge-icon'
                        setIcon(iconSpan, info.icon)
                        badge.appendChild(iconSpan)

                        container.appendChild(badge)

                        // Add refresh button if enabled (smaller for inline)
                        if (settings.showRefreshButton) {
                            const btn = document.createElement('button')
                            btn.className = 'dvs-inline-refresh-button'
                            btn.setAttribute('aria-label', 'Refresh Inline Query')
                            setIcon(btn, 'refresh-cw')

                            btn.addEventListener('click', async (e) => {
                                e.preventDefault()
                                e.stopPropagation()

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

                                    const result = await processFile(
                                        file,
                                        true,
                                        this.expression,
                                        true
                                    )

                                    // Check for errors
                                    const firstError = result.errors[0]
                                    if (firstError) {
                                        const truncatedExpr =
                                            firstError.query.length > 50
                                                ? firstError.query.substring(0, 50) + '...'
                                                : firstError.query
                                        new Notice(
                                            `Inline query failed:\n"${truncatedExpr}"\n${firstError.message}`,
                                            NOTICE_TIMEOUT * 2
                                        )
                                    } else {
                                        new Notice('Inline query serialized')
                                    }
                                } catch (err) {
                                    console.error('Failed to refresh inline query', err)
                                    new Notice('Failed to refresh inline query')
                                }
                            })

                            container.appendChild(btn)
                        }

                        return container
                    }
                }

                // State for tracking multi-line query parsing in decorations
                interface MultiLineDecorationState {
                    isCapturing: boolean
                    startLineNumber: number
                    flagOpen: string
                    queryType: QueryType
                    queryLines: string[]
                    lineNumbers: number[]
                }

                let multiLineState: MultiLineDecorationState = {
                    isCapturing: false,
                    startLineNumber: -1,
                    flagOpen: '',
                    queryType: 'auto',
                    queryLines: [],
                    lineNumbers: []
                }

                for (const { from, to } of view.visibleRanges) {
                    const startLine = view.state.doc.lineAt(from)
                    const endLine = view.state.doc.lineAt(to)

                    for (let i = startLine.number; i <= endLine.number; i++) {
                        const line = view.state.doc.line(i)
                        const text = line.text

                        if (multiLineState.isCapturing) {
                            // We're in the middle of a multi-line query
                            multiLineState.queryLines.push(text)
                            multiLineState.lineNumbers.push(i)

                            // Add line decoration for this line
                            decorations.push({
                                from: line.from,
                                to: line.from,
                                decoration: queryLineDecoration
                            })

                            // Check if this line contains the closing flag
                            const closeIdx = text.indexOf(QUERY_FLAG_CLOSE)
                            const closeIdxTrimmed = text.indexOf(QUERY_FLAG_CLOSE.trim())
                            const actualCloseIdx = closeIdx !== -1 ? closeIdx : closeIdxTrimmed
                            const actualCloseFlag =
                                closeIdx !== -1 ? QUERY_FLAG_CLOSE : QUERY_FLAG_CLOSE.trim()

                            if (actualCloseIdx !== -1) {
                                // Multi-line query complete - extract the normalized query
                                const fullText = multiLineState.queryLines.join('\n')
                                const { flagOpen } = multiLineState

                                // Find opening flag position
                                let openFlagIdx = fullText.indexOf(flagOpen)
                                let flagLength = flagOpen.length
                                if (openFlagIdx === -1) {
                                    openFlagIdx = fullText.indexOf(flagOpen.trim())
                                    flagLength = flagOpen.trim().length
                                }

                                // Find closing flag position in full text
                                let closeFlagIdx = fullText.indexOf(QUERY_FLAG_CLOSE)
                                if (closeFlagIdx === -1) {
                                    closeFlagIdx = fullText.indexOf(QUERY_FLAG_CLOSE.trim())
                                }

                                if (openFlagIdx !== -1 && closeFlagIdx !== -1) {
                                    // Extract and normalize the query
                                    const queryContent = fullText.substring(
                                        openFlagIdx + flagLength,
                                        closeFlagIdx
                                    )
                                    const normalizedQuery = queryContent
                                        .split('\n')
                                        .map((l) => l.trim())
                                        .join(' ')
                                        .replace(/\s+/g, ' ')
                                        .trim()

                                    // Add widget at the end of the closing line
                                    const endPos =
                                        line.from + actualCloseIdx + actualCloseFlag.length

                                    decorations.push({
                                        from: endPos,
                                        to: endPos,
                                        decoration: Decoration.widget({
                                            widget: new QueryWidgetGroup(
                                                normalizedQuery,
                                                multiLineState.queryType
                                            ),
                                            side: 1
                                        })
                                    })
                                }

                                // Reset state
                                multiLineState = {
                                    isCapturing: false,
                                    startLineNumber: -1,
                                    flagOpen: '',
                                    queryType: 'auto',
                                    queryLines: [],
                                    lineNumbers: []
                                }
                            }
                        } else {
                            // Check for query definition line
                            const flagInfo = detectQueryFlagInLine(text)
                            if (flagInfo) {
                                const { flagOpen, openIdx, queryType } = flagInfo
                                const closeIdx = text.indexOf(QUERY_FLAG_CLOSE, openIdx)
                                const closeIdxTrimmed = text.indexOf(
                                    QUERY_FLAG_CLOSE.trim(),
                                    openIdx
                                )
                                const actualCloseIdx = closeIdx !== -1 ? closeIdx : closeIdxTrimmed
                                const actualCloseFlag =
                                    closeIdx !== -1 ? QUERY_FLAG_CLOSE : QUERY_FLAG_CLOSE.trim()

                                if (actualCloseIdx !== -1) {
                                    // Single-line query
                                    // Add line decoration
                                    decorations.push({
                                        from: line.from,
                                        to: line.from,
                                        decoration: queryLineDecoration
                                    })

                                    // Add widget with badge and refresh button
                                    const query = text
                                        .substring(openIdx + flagOpen.length, actualCloseIdx)
                                        .trim()
                                    const endPos =
                                        line.from + actualCloseIdx + actualCloseFlag.length

                                    decorations.push({
                                        from: endPos,
                                        to: endPos,
                                        decoration: Decoration.widget({
                                            widget: new QueryWidgetGroup(query, queryType),
                                            side: 1
                                        })
                                    })
                                } else {
                                    // Opening flag found but no closing flag - start multi-line capture
                                    multiLineState = {
                                        isCapturing: true,
                                        startLineNumber: i,
                                        flagOpen,
                                        queryType,
                                        queryLines: [text],
                                        lineNumbers: [i]
                                    }

                                    // Add line decoration for the opening line
                                    decorations.push({
                                        from: line.from,
                                        to: line.from,
                                        decoration: queryLineDecoration
                                    })
                                }
                            }
                        }

                        // Check for serialized query start line (only if not capturing multi-line)
                        if (!multiLineState.isCapturing && text.includes(SERIALIZED_QUERY_START)) {
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

                        // Check for inline queries (<!-- IQ: =expr -->result<!-- /IQ -->)
                        const inlineQueries = detectInlineQueriesInLine(text)
                        for (const iq of inlineQueries) {
                            // Add mark decoration for the entire inline query
                            decorations.push({
                                from: line.from + iq.openIdx,
                                to: line.from + iq.endIdx,
                                decoration: inlineQueryDecoration
                            })

                            // Add widget after the inline query end marker
                            decorations.push({
                                from: line.from + iq.endIdx,
                                to: line.from + iq.endIdx,
                                decoration: Decoration.widget({
                                    widget: new InlineQueryWidgetGroup(iq.expression, iq.queryType),
                                    side: 1
                                })
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
