import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import type { Literal } from 'obsidian-dataview/lib/data-model/value'
import { log } from '../../utils/log'
import { literalToString, escapeForTable } from './literal-to-string.fn'

/**
 * Result of serializing an inline query
 */
export interface InlineQuerySerializationResult {
    /** Whether the serialization was successful */
    success: boolean
    /** The serialized content (empty string on failure) */
    serializedContent: string
    /** Error information if serialization failed */
    error?: {
        message: string
        expression: string
    }
}

/**
 * Parameters for serializing an inline query
 */
interface SerializeInlineQueryParams {
    /** The expression to evaluate (e.g., "=this.name", "=this.file.ctime") */
    expression: string
    /** The file path where this query is located */
    originFile: string
    /** The Dataview API instance */
    dataviewApi: DataviewApi
    /** Whether the result will be used in a table cell (needs escaping) */
    isTableCell?: boolean
}

/**
 * Serialize an inline Dataview query expression.
 *
 * This function evaluates inline expressions like:
 * - =this.name (field access)
 * - =this.file.ctime (nested property)
 * - =embed(this.portrait) (function calls)
 * - =this.tags (arrays)
 *
 * @param params Parameters for serialization
 * @returns Result containing the serialized content or error information
 */
export async function serializeInlineQuery(
    params: SerializeInlineQueryParams
): Promise<InlineQuerySerializationResult> {
    const { expression, originFile, dataviewApi, isTableCell = false } = params

    // Remove the leading = from the expression if present
    // Dataview's tryEvaluate expects expressions without the = prefix
    const cleanExpression = expression.startsWith('=')
        ? expression.slice(1).trim()
        : expression.trim()

    if (!cleanExpression) {
        return {
            success: false,
            serializedContent: '',
            error: {
                message: 'Empty expression',
                expression
            }
        }
    }

    try {
        // Get the page metadata for the origin file
        // This provides the 'this' context for expressions like =this.tags
        // Try different path formats as Dataview can be picky about paths
        let page = dataviewApi.page(originFile, originFile)

        // If that didn't work, try without the second argument
        if (!page) {
            page = dataviewApi.page(originFile)
        }

        // If still no luck, try stripping the .md extension
        if (!page && originFile.endsWith('.md')) {
            const pathWithoutExt = originFile.slice(0, -3)
            page = dataviewApi.page(pathWithoutExt, originFile)
            if (!page) {
                page = dataviewApi.page(pathWithoutExt)
            }
        }

        if (!page) {
            log(`Could not get page metadata for ${originFile}`, 'warn')
            return {
                success: false,
                serializedContent: '',
                error: {
                    message: `Could not get page metadata for file: ${originFile}`,
                    expression
                }
            }
        }

        // Create context with 'this' pointing to the page data
        // This mimics how Dataview's inline queries work
        const context = { this: page }

        // Use evaluate() which returns a Result, allowing us to handle errors gracefully
        const evalResult = dataviewApi.evaluate(cleanExpression, context, originFile)

        // Check if evaluation failed
        if (!evalResult.successful) {
            return {
                success: false,
                serializedContent: '',
                error: {
                    message: evalResult.error ?? 'Unknown evaluation error',
                    expression
                }
            }
        }

        const result: Literal = evalResult.value

        // Convert the result to string
        let serializedContent = literalToString(result, dataviewApi)

        // If the result is empty, use a placeholder
        if (serializedContent === '') {
            serializedContent = '-'
        }

        // Escape for table cells if needed
        if (isTableCell) {
            serializedContent = escapeForTable(serializedContent)
        }

        return {
            success: true,
            serializedContent
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        log(`Failed to evaluate inline expression: ${expression}`, 'warn', err)

        return {
            success: false,
            serializedContent: '',
            error: {
                message: errorMessage,
                expression
            }
        }
    }
}

/**
 * Check if a position in the text is inside a markdown table.
 * This is used to determine if table cell escaping is needed.
 *
 * @param text The full document text
 * @param offset The character offset to check
 * @returns true if the offset is inside a table
 */
export function isInsideTable(text: string, offset: number): boolean {
    // Find the line containing the offset
    let lineStart = offset
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--
    }

    let lineEnd = offset
    while (lineEnd < text.length && text[lineEnd] !== '\n') {
        lineEnd++
    }

    const line = text.substring(lineStart, lineEnd)

    // A line is likely part of a table if it contains | characters
    // Simple heuristic: line starts with |, ends with |, or has multiple | chars
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('|') || trimmedLine.endsWith('|')) {
        return true
    }

    // Count pipe characters (excluding escaped ones)
    const pipeCount = (trimmedLine.match(/(?<!\\)\|/g) ?? []).length
    return pipeCount >= 2
}
