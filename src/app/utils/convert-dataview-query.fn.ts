import { QUERY_FLAG_CLOSE, QUERY_FLAG_OPEN } from '../constants'
import { isSupportedQueryType } from './is-supported-query-type.fn'
import { convertRawToSerializedFormat } from './find-inline-queries.fn'

/**
 * Represents a detected Dataview query in the document
 */
export interface DetectedDataviewQuery {
    /** The query text (e.g., "LIST FROM #project") */
    query: string
    /** Start position in the document (character offset) */
    startOffset: number
    /** End position in the document (character offset) */
    endOffset: number
    /** The indentation of the line where the query starts */
    indentation: string
    /** The type of query block: 'codeblock' for ```dataview, 'inline' for `= */
    type: 'codeblock' | 'inline'
}

/**
 * Result of converting Dataview queries
 */
export interface ConversionResult {
    /** Whether any conversion was made */
    converted: boolean
    /** The new text after conversion */
    newText: string
    /** Number of queries converted */
    count: number
    /** Queries that were skipped (unsupported type) */
    skipped: string[]
}

/**
 * Regex to match Dataview codeblocks
 * Captures: full match, content inside the codeblock
 *
 * WARNING: Uses global flag - reset lastIndex before use, no await during iteration.
 */
const DATAVIEW_CODEBLOCK_REGEX = /^([ \t]*)```dataview\r?\n([\s\S]*?)\r?\n\1```/gm

/**
 * Regex to match Dataview inline queries (backtick format)
 * Matches: `= expression`
 * Note: Dataview inline queries start with `= (backtick, equals sign)
 *
 * WARNING: Uses global flag - reset lastIndex before use, no await during iteration.
 */
const DATAVIEW_INLINE_REGEX = /`=\s*([^`]+)`/g

/**
 * Find all Dataview codeblocks in the given text
 */
export function findDataviewCodeblocks(text: string): DetectedDataviewQuery[] {
    const results: DetectedDataviewQuery[] = []
    // Reset lastIndex for reuse of pre-compiled regex
    DATAVIEW_CODEBLOCK_REGEX.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = DATAVIEW_CODEBLOCK_REGEX.exec(text)) !== null) {
        const indentation = match[1] ?? ''
        const queryContent = match[2]?.trim() ?? ''

        if (queryContent) {
            results.push({
                query: queryContent,
                startOffset: match.index,
                endOffset: match.index + match[0].length,
                indentation,
                type: 'codeblock'
            })
        }
    }

    return results
}

/**
 * Find all Dataview inline queries in the given text
 */
export function findDataviewInlineQueries(text: string): DetectedDataviewQuery[] {
    const results: DetectedDataviewQuery[] = []
    // Reset lastIndex for reuse of pre-compiled regex
    DATAVIEW_INLINE_REGEX.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = DATAVIEW_INLINE_REGEX.exec(text)) !== null) {
        const queryContent = match[1]?.trim() ?? ''

        if (queryContent) {
            // Find the indentation by looking backwards for the start of the line
            let lineStart = match.index
            while (lineStart > 0 && text[lineStart - 1] !== '\n') {
                lineStart--
            }
            const lineContent = text.substring(lineStart, match.index)
            const indentMatch = lineContent.match(/^([ \t]*)/)
            const indentation = indentMatch?.[1] ?? ''

            results.push({
                query: queryContent,
                startOffset: match.index,
                endOffset: match.index + match[0].length,
                indentation,
                type: 'inline'
            })
        }
    }

    return results
}

/**
 * Find all Dataview queries (both codeblocks and inline) in the given text
 */
export function findAllDataviewQueries(text: string): DetectedDataviewQuery[] {
    const codeblocks = findDataviewCodeblocks(text)
    const inlineQueries = findDataviewInlineQueries(text)

    // Combine and sort by position
    return [...codeblocks, ...inlineQueries].sort((a, b) => a.startOffset - b.startOffset)
}

/**
 * Convert a Dataview query to the serialized format
 * @param query The query text
 * @param indentation The indentation to preserve
 * @returns The converted text in serialized format
 */
export function convertToSerializedFormat(query: string, indentation: string): string {
    // Normalize the query: handle multi-line queries by joining them
    const normalizedQuery = query
        .split('\n')
        .map((line) => line.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

    return `${indentation}${QUERY_FLAG_OPEN}${normalizedQuery}${QUERY_FLAG_CLOSE}`
}

/**
 * Find the Dataview query at the given cursor position
 * @param text The document text
 * @param cursorOffset The cursor position (character offset from start)
 * @returns The detected query at cursor position, or null if none found
 */
export function findQueryAtCursor(
    text: string,
    cursorOffset: number
): DetectedDataviewQuery | null {
    const allQueries = findAllDataviewQueries(text)

    for (const query of allQueries) {
        if (cursorOffset >= query.startOffset && cursorOffset <= query.endOffset) {
            return query
        }
    }

    return null
}

/**
 * Convert the Dataview query at the cursor position to serialized format
 * @param text The document text
 * @param cursorOffset The cursor position (character offset from start)
 * @returns Conversion result with the new text
 */
export function convertQueryAtCursor(text: string, cursorOffset: number): ConversionResult {
    const query = findQueryAtCursor(text, cursorOffset)

    if (!query) {
        return {
            converted: false,
            newText: text,
            count: 0,
            skipped: []
        }
    }

    // For inline queries, we don't check supported types since they can be expressions
    // For codeblock queries, check if the query type is supported
    if (query.type === 'codeblock' && !isSupportedQueryType(query.query)) {
        return {
            converted: false,
            newText: text,
            count: 0,
            skipped: [query.query]
        }
    }

    // Use appropriate format based on query type
    const serializedFormat =
        query.type === 'inline'
            ? convertRawToSerializedFormat('=' + query.query)
            : convertToSerializedFormat(query.query, query.indentation)

    const newText =
        text.substring(0, query.startOffset) + serializedFormat + text.substring(query.endOffset)

    return {
        converted: true,
        newText,
        count: 1,
        skipped: []
    }
}

/**
 * Convert all Dataview queries in the text to serialized format
 * @param text The document text
 * @returns Conversion result with the new text
 */
export function convertAllQueries(text: string): ConversionResult {
    const allQueries = findAllDataviewQueries(text)

    if (allQueries.length === 0) {
        return {
            converted: false,
            newText: text,
            count: 0,
            skipped: []
        }
    }

    let newText = text
    let convertedCount = 0
    const skipped: string[] = []

    // Process queries in reverse order to preserve offsets
    for (let i = allQueries.length - 1; i >= 0; i--) {
        const query = allQueries[i]!

        // For codeblock queries, check if the query type is supported
        // Inline queries can be expressions, so we always convert them
        if (query.type === 'codeblock' && !isSupportedQueryType(query.query)) {
            skipped.push(query.query)
            continue
        }

        // Use appropriate format based on query type
        const serializedFormat =
            query.type === 'inline'
                ? convertRawToSerializedFormat('=' + query.query)
                : convertToSerializedFormat(query.query, query.indentation)

        newText =
            newText.substring(0, query.startOffset) +
            serializedFormat +
            newText.substring(query.endOffset)
        convertedCount++
    }

    return {
        converted: convertedCount > 0,
        newText,
        count: convertedCount,
        skipped
    }
}

/**
 * Convert selected text containing a Dataview query to serialized format
 * This handles the case where user has selected text that contains a query
 * @param selectedText The selected text
 * @returns Conversion result
 */
export function convertSelectedQuery(selectedText: string): ConversionResult {
    // Try to find queries in the selected text
    const queries = findAllDataviewQueries(selectedText)

    if (queries.length === 0) {
        // No queries found in selection
        return {
            converted: false,
            newText: selectedText,
            count: 0,
            skipped: []
        }
    }

    // Convert all queries found in selection
    let newText = selectedText
    let convertedCount = 0
    const skipped: string[] = []

    // Process in reverse order
    for (let i = queries.length - 1; i >= 0; i--) {
        const query = queries[i]!

        // For codeblock queries, check if the query type is supported
        // Inline queries can be expressions, so we always convert them
        if (query.type === 'codeblock' && !isSupportedQueryType(query.query)) {
            skipped.push(query.query)
            continue
        }

        // Use appropriate format based on query type
        const serializedFormat =
            query.type === 'inline'
                ? convertRawToSerializedFormat('=' + query.query)
                : convertToSerializedFormat(query.query, query.indentation)

        newText =
            newText.substring(0, query.startOffset) +
            serializedFormat +
            newText.substring(query.endOffset)
        convertedCount++
    }

    return {
        converted: convertedCount > 0,
        newText,
        count: convertedCount,
        skipped
    }
}
