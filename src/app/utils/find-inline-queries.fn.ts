import {
    INLINE_QUERY_FLAG_CLOSE,
    INLINE_QUERY_FLAG_MANUAL_OPEN,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    INLINE_QUERY_FLAG_ONCE_OPEN,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_END
} from '../constants'
import type { QueryUpdateMode } from './find-queries.fn'

/**
 * Interface to represent a serialized inline query with its context
 */
export interface InlineQueryWithContext {
    /** The expression (e.g., "this.ancestry", "this.file.name") */
    expression: string
    /** Start offset in the document (character offset from start) */
    startOffset: number
    /** End offset in the document (character offset from start) */
    endOffset: number
    /** Update mode for this query */
    updateMode: QueryUpdateMode
    /** The opening flag used */
    flagOpen: string
    /** The existing serialized result (if any) */
    currentResult?: string
    /** The full matched text (for replacement) */
    fullMatch: string
}

/**
 * Interface to represent a raw inline query (for conversion)
 */
export interface RawInlineQuery {
    /** The expression (e.g., "this.ancestry") */
    expression: string
    /** Start offset in the document */
    startOffset: number
    /** End offset in the document */
    endOffset: number
    /** The full matched text */
    fullMatch: string
}

/**
 * All inline query opening flags and their update modes
 */
const INLINE_QUERY_FLAGS: Array<{ flag: string; updateMode: QueryUpdateMode }> = [
    // Order matters: check longer prefixes first
    { flag: INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN, updateMode: 'once-and-eject' },
    { flag: INLINE_QUERY_FLAG_MANUAL_OPEN, updateMode: 'manual' },
    { flag: INLINE_QUERY_FLAG_ONCE_OPEN, updateMode: 'once' },
    { flag: INLINE_QUERY_FLAG_OPEN, updateMode: 'auto' }
]

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find all serialized inline queries in the given text.
 *
 * Detects patterns like:
 * - `<!-- IQ: =this.field -->result<!-- /IQ -->`
 * - `<!-- IQManual: =this.field -->result<!-- /IQ -->`
 * - `<!-- IQOnce: =this.field -->result<!-- /IQ -->`
 * - `<!-- IQOnceAndEject: =this.field -->result<!-- /IQ -->`
 *
 * @param text The document text to search for inline queries
 * @returns Array of inline queries with their context information
 */
export function findInlineQueries(text: string): InlineQueryWithContext[] {
    const results: InlineQueryWithContext[] = []

    for (const { flag, updateMode } of INLINE_QUERY_FLAGS) {
        // Build regex for this flag type
        // Pattern: <!-- IQ: =expr -->result<!-- /IQ -->
        // The expression starts with = and continues until the close flag
        const escapedFlagOpen = escapeRegExp(flag)
        const escapedFlagClose = escapeRegExp(INLINE_QUERY_FLAG_CLOSE)
        const escapedEnd = escapeRegExp(INLINE_QUERY_END)

        // Match: flag_open + expression + flag_close + result + end
        // Expression: starts with = and can contain anything except -->
        // Result: everything between flag_close and end marker
        const regex = new RegExp(
            `${escapedFlagOpen}(=[^-]*(?:-(?!->)[^-]*)*)${escapedFlagClose}([\\s\\S]*?)${escapedEnd}`,
            'g'
        )

        let match: RegExpExecArray | null
        while ((match = regex.exec(text)) !== null) {
            const expression = match[1]?.trim() ?? ''
            const currentResult = match[2] ?? ''

            // Skip if no expression found
            if (!expression) {
                continue
            }

            // Skip if this position was already matched by a more specific flag
            // (e.g., IQManual is more specific than IQ)
            const startOffset = match.index
            const alreadyMatched = results.some(
                (r) => r.startOffset === startOffset && r.flagOpen !== flag
            )
            if (alreadyMatched) {
                continue
            }

            results.push({
                expression,
                startOffset,
                endOffset: match.index + match[0].length,
                updateMode,
                flagOpen: flag,
                currentResult,
                fullMatch: match[0]
            })
        }
    }

    // Sort by position
    results.sort((a, b) => a.startOffset - b.startOffset)

    // Remove duplicates (keep the most specific match at each position)
    const seen = new Set<number>()
    return results.filter((r) => {
        if (seen.has(r.startOffset)) {
            return false
        }
        seen.add(r.startOffset)
        return true
    })
}

/**
 * Find all raw inline queries (backtick format) in the given text.
 *
 * Detects patterns like: `=this.field`
 * These are the standard Dataview inline query format.
 *
 * Note: This only finds queries that haven't been converted to the serialized format yet.
 *
 * @param text The document text to search for raw inline queries
 * @returns Array of raw inline queries
 */
export function findRawInlineQueries(text: string): RawInlineQuery[] {
    const results: RawInlineQuery[] = []

    // Pattern: `=expression`
    // The expression can contain anything except backticks
    const regex = /`=([^`]+)`/g

    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
        const expression = match[1]?.trim() ?? ''

        // Skip if no expression found
        if (!expression) {
            continue
        }

        results.push({
            expression: '=' + expression, // Include the = prefix
            startOffset: match.index,
            endOffset: match.index + match[0].length,
            fullMatch: match[0]
        })
    }

    return results
}

/**
 * Check if a serialized inline query already exists at the given expression.
 * This is used for idempotency checks.
 *
 * @param text The document text
 * @param expression The expression to check (including the = prefix)
 * @returns true if the expression is already serialized
 */
export function isInlineQueryAlreadySerialized(text: string, expression: string): boolean {
    const queries = findInlineQueries(text)
    return queries.some((q) => q.expression === expression)
}

/**
 * Build the serialized inline query format.
 *
 * @param expression The expression (e.g., "=this.field")
 * @param result The serialized result
 * @param updateMode The update mode for the query
 * @returns The formatted serialized inline query string
 */
export function buildSerializedInlineQuery(
    expression: string,
    result: string,
    updateMode: QueryUpdateMode = 'auto'
): string {
    let flagOpen: string
    switch (updateMode) {
        case 'manual':
            flagOpen = INLINE_QUERY_FLAG_MANUAL_OPEN
            break
        case 'once':
            flagOpen = INLINE_QUERY_FLAG_ONCE_OPEN
            break
        case 'once-and-eject':
            flagOpen = INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN
            break
        default:
            flagOpen = INLINE_QUERY_FLAG_OPEN
    }

    return `${flagOpen}${expression}${INLINE_QUERY_FLAG_CLOSE}${result}${INLINE_QUERY_END}`
}

/**
 * Convert a raw inline query to the serialized format marker (without result).
 * This creates an empty serialization marker that will be filled in when processed.
 *
 * @param expression The expression (e.g., "=this.field")
 * @param updateMode The update mode for the query
 * @returns The formatted serialized inline query string with empty result
 */
export function convertRawToSerializedFormat(
    expression: string,
    updateMode: QueryUpdateMode = 'auto'
): string {
    return buildSerializedInlineQuery(expression, '', updateMode)
}
