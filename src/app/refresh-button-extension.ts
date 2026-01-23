import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { App, MarkdownView, Notice, setIcon, TFile } from 'obsidian'
import {
    NOTICE_TIMEOUT,
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_OPEN
} from './constants'

/**
 * Detect which query flag is present in a line and return the flag info
 */
function detectQueryFlagInLine(text: string): { flagOpen: string; openIdx: number } | null {
    // Check in order of specificity (longer prefixes first)
    const manualIdx = text.indexOf(QUERY_FLAG_MANUAL_OPEN)
    if (manualIdx !== -1) {
        return { flagOpen: QUERY_FLAG_MANUAL_OPEN, openIdx: manualIdx }
    }
    const onceIdx = text.indexOf(QUERY_FLAG_ONCE_OPEN)
    if (onceIdx !== -1) {
        return { flagOpen: QUERY_FLAG_ONCE_OPEN, openIdx: onceIdx }
    }
    const autoIdx = text.indexOf(QUERY_FLAG_OPEN)
    if (autoIdx !== -1) {
        return { flagOpen: QUERY_FLAG_OPEN, openIdx: autoIdx }
    }
    return null
}
import type { PluginSettings } from './types/plugin-settings.intf'

interface FileProcessingResult {
    filePath: string
    errors: Array<{
        message: string
        query: string
    }>
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

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view)
                }
            }

            buildDecorations(view: EditorView) {
                if (!getSettings().showRefreshButton) {
                    return new RangeSetBuilder<Decoration>().finish()
                }

                class RefreshButtonWidget extends WidgetType {
                    constructor(private query: string) {
                        super()
                    }

                    toDOM(editorView: EditorView): HTMLElement {
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

                        btn.style.marginLeft = '8px'
                        return btn
                    }
                }

                const builder = new RangeSetBuilder<Decoration>()

                for (const { from, to } of view.visibleRanges) {
                    const startLine = view.state.doc.lineAt(from)
                    const endLine = view.state.doc.lineAt(to)

                    for (let i = startLine.number; i <= endLine.number; i++) {
                        const line = view.state.doc.line(i)
                        const text = line.text
                        const flagInfo = detectQueryFlagInLine(text)

                        if (flagInfo) {
                            const { flagOpen, openIdx } = flagInfo
                            const closeIdx = text.indexOf(QUERY_FLAG_CLOSE, openIdx)
                            if (closeIdx !== -1) {
                                const query = text
                                    .substring(openIdx + flagOpen.length, closeIdx)
                                    .trim()

                                const endPos = line.from + closeIdx + QUERY_FLAG_CLOSE.length
                                builder.add(
                                    endPos,
                                    endPos,
                                    Decoration.widget({
                                        widget: new RefreshButtonWidget(query),
                                        side: 1
                                    })
                                )
                            }
                        }
                    }
                }

                return builder.finish()
            }
        },
        {
            decorations: (v) => v.decorations
        }
    )
