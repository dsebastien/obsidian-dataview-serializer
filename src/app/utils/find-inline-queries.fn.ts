import {
    INLINE_QUERY_FLAG_CLOSE,
    INLINE_QUERY_FLAG_MANUAL_OPEN,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    INLINE_QUERY_FLAG_ONCE_OPEN,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_END,
    INLINE_QUERY_FLAG_OPEN_ALT,
    INLINE_QUERY_FLAG_MANUAL_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    INLINE_QUERY_END_ALT
} from '../constants'
import type { QueryUpdateMode, SyntaxVariant } from './find-queries.fn'

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
    /**
     * Which syntax variant this query uses.
     * Used to generate matching end markers (legacy query -> legacy end marker).
     */
    syntaxVariant: SyntaxVariant
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
const INLINE_QUERY_FLAGS: Array<{
    flag: string
    updateMode: QueryUpdateMode
    syntaxVariant: SyntaxVariant
    endMarker: string
}> = [
    // Order matters: check longer prefixes first
    // Alternative syntax first (longer prefixes)
    {
        flag: INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
        updateMode: 'once-and-eject',
        syntaxVariant: 'alternative',
        endMarker: INLINE_QUERY_END_ALT
    },
    {
        flag: INLINE_QUERY_FLAG_MANUAL_OPEN_ALT,
        updateMode: 'manual',
        syntaxVariant: 'alternative',
        endMarker: INLINE_QUERY_END_ALT
    },
    {
        flag: INLINE_QUERY_FLAG_ONCE_OPEN_ALT,
        updateMode: 'once',
        syntaxVariant: 'alternative',
        endMarker: INLINE_QUERY_END_ALT
    },
    {
        flag: INLINE_QUERY_FLAG_OPEN_ALT,
        updateMode: 'auto',
        syntaxVariant: 'alternative',
        endMarker: INLINE_QUERY_END_ALT
    },
    // Legacy syntax
    {
        flag: INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
        updateMode: 'once-and-eject',
        syntaxVariant: 'legacy',
        endMarker: INLINE_QUERY_END
    },
    {
        flag: INLINE_QUERY_FLAG_MANUAL_OPEN,
        updateMode: 'manual',
        syntaxVariant: 'legacy',
        endMarker: INLINE_QUERY_END
    },
    {
        flag: INLINE_QUERY_FLAG_ONCE_OPEN,
        updateMode: 'once',
        syntaxVariant: 'legacy',
        endMarker: INLINE_QUERY_END
    },
    {
        flag: INLINE_QUERY_FLAG_OPEN,
        updateMode: 'auto',
        syntaxVariant: 'legacy',
        endMarker: INLINE_QUERY_END
    }
]

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pre-compiled regex patterns for inline queries.
 * Compiled once at module load to avoid creating 8 RegExp objects per findInlineQueries() call.
 *
 * WARNING: These regexes use the global flag and share state via lastIndex.
 * Safe to use in synchronous loops (reset lastIndex before each use).
 * DO NOT add await statements between exec() calls when iterating.
 */
const COMPILED_INLINE_PATTERNS = INLINE_QUERY_FLAGS.map(
    ({ flag, updateMode, syntaxVariant, endMarker }) => {
        const escapedFlagOpen = escapeRegExp(flag)
        const escapedFlagClose = escapeRegExp(INLINE_QUERY_FLAG_CLOSE)
        const escapedEnd = escapeRegExp(endMarker)
        return {
            regex: new RegExp(
                `${escapedFlagOpen}(=[^-]*(?:-(?!->)[^-]*)*)${escapedFlagClose}([\\s\\S]*?)${escapedEnd}`,
                'g'
            ),
            updateMode,
            flag,
            syntaxVariant
        }
    }
)

/**
 * Pre-compiled regex for raw inline queries (backtick format: `=expression`).
 * Compiled once at module load.
 *
 * WARNING: Uses global flag - reset lastIndex before use, no await during iteration.
 */
const RAW_INLINE_QUERY_REGEX = /`=([^`]+)`/g

/**
 * Find all serialized inline queries in the given text.
 *
 * Detects patterns like:
 * - `<!-- IQ: =this.field -->result<!-- /IQ -->` (legacy)
 * - `<!-- IQManual: =this.field -->result<!-- /IQ -->` (legacy)
 * - `<!-- IQOnce: =this.field -->result<!-- /IQ -->` (legacy)
 * - `<!-- IQOnceAndEject: =this.field -->result<!-- /IQ -->` (legacy)
 * - `<!-- dataview-serializer-iq: =this.field -->result<!-- /dataview-serializer-iq -->` (alternative)
 * - `<!-- dataview-serializer-iq-manual: =this.field -->result<!-- /dataview-serializer-iq -->` (alternative)
 * - `<!-- dataview-serializer-iq-once: =this.field -->result<!-- /dataview-serializer-iq -->` (alternative)
 * - `<!-- dataview-serializer-iq-once-and-eject: =this.field -->result<!-- /dataview-serializer-iq -->` (alternative)
 *
 * @param text The document text to search for inline queries
 * @returns Array of inline queries with their context information
 */
export function findInlineQueries(text: string): InlineQueryWithContext[] {
    const results: InlineQueryWithContext[] = []

    for (const { regex, flag, updateMode, syntaxVariant } of COMPILED_INLINE_PATTERNS) {
        // Reset lastIndex for reuse of pre-compiled regex
        regex.lastIndex = 0

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
                fullMatch: match[0],
                syntaxVariant
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

    // Reset lastIndex for reuse of pre-compiled regex
    RAW_INLINE_QUERY_REGEX.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = RAW_INLINE_QUERY_REGEX.exec(text)) !== null) {
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
 * @param syntaxVariant Which syntax variant to use (defaults to 'legacy' for backward compatibility)
 * @returns The formatted serialized inline query string
 */
export function buildSerializedInlineQuery(
    expression: string,
    result: string,
    updateMode: QueryUpdateMode = 'auto',
    syntaxVariant: SyntaxVariant = 'legacy'
): string {
    let flagOpen: string
    let endMarker: string

    if (syntaxVariant === 'alternative') {
        switch (updateMode) {
            case 'manual':
                flagOpen = INLINE_QUERY_FLAG_MANUAL_OPEN_ALT
                break
            case 'once':
                flagOpen = INLINE_QUERY_FLAG_ONCE_OPEN_ALT
                break
            case 'once-and-eject':
                flagOpen = INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT
                break
            default:
                flagOpen = INLINE_QUERY_FLAG_OPEN_ALT
        }
        endMarker = INLINE_QUERY_END_ALT
    } else {
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
        endMarker = INLINE_QUERY_END
    }

    return `${flagOpen}${expression}${INLINE_QUERY_FLAG_CLOSE}${result}${endMarker}`
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
