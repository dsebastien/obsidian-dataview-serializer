import {
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_OPEN,
    QUERY_FLAG_OPEN_ALT,
    QUERY_FLAG_MANUAL_OPEN_ALT,
    QUERY_FLAG_ONCE_OPEN_ALT,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT
} from '../constants'
import { isSupportedQueryType } from './is-supported-query-type.fn'

/**
 * Update mode for a query
 * - 'auto': Automatic updates (default behavior)
 * - 'manual': Skips automatic updates; refreshable via commands/button
 * - 'once': Only serializes once; never auto-updates after first serialization
 * - 'once-and-eject': Serializes once and removes surrounding tags, leaving only the output
 */
export type QueryUpdateMode = 'auto' | 'manual' | 'once' | 'once-and-eject'

/**
 * Syntax variant for query markers
 * - 'legacy': Original QueryToSerialize/IQ syntax
 * - 'alternative': New dataview-serializer- prefix syntax
 */
export type SyntaxVariant = 'legacy' | 'alternative'

/**
 * Interface to represent a query with its indentation context
 */
export interface QueryWithContext {
    query: string
    indentation: string
    updateMode: QueryUpdateMode
    flagOpen: string
    /**
     * The closing flag variant found in the file (with or without leading space).
     * Used for accurate regex matching in plugin.ts.
     */
    flagClose: string
    /**
     * For multi-line queries, this stores the original text from the opening flag
     * to the closing flag (inclusive), preserving newlines. Used for accurate replacement.
     * For single-line queries, this is undefined.
     */
    originalQueryDefinition?: string
    /**
     * Which syntax variant this query uses.
     * Used to generate matching result markers (legacy query -> legacy markers).
     */
    syntaxVariant: SyntaxVariant
}

/**
 * Detect which query flag is present in a line and return the flag info.
 * Returns the actual flag variant found in the original line (with or without trailing space)
 * to ensure accurate regex matching in plugin.ts.
 *
 * @param trimmedLine The trimmed line (for detection)
 * @param originalLine The original line (to determine which flag variant is present)
 *
 * Note: We check for both full and trimmed versions of flags because
 * for multi-line queries, the opening flag might be at the end of a line
 * without the trailing space.
 */
function detectQueryFlag(
    trimmedLine: string,
    originalLine: string
): { flagOpen: string; updateMode: QueryUpdateMode; syntaxVariant: SyntaxVariant } | null {
    // Helper to determine which flag variant (full or trimmed) is in the original line
    const getActualFlag = (fullFlag: string): string => {
        // If the original line contains the full flag (with trailing space), use it
        // Otherwise use the trimmed version
        return originalLine.includes(fullFlag) ? fullFlag : fullFlag.trim()
    }

    // Check in order of specificity (longer prefixes first)
    // IMPORTANT: Check alternative syntax first since it has longer prefixes
    // that might otherwise be partially matched by legacy syntax
    // Use trimmedLine for detection, but originalLine to determine the actual flag variant

    // Alternative syntax checks (longer prefixes)
    if (
        trimmedLine.includes(QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT.trim()) ||
        trimmedLine.includes(QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT),
            updateMode: 'once-and-eject',
            syntaxVariant: 'alternative'
        }
    }
    if (
        trimmedLine.includes(QUERY_FLAG_MANUAL_OPEN_ALT.trim()) ||
        trimmedLine.includes(QUERY_FLAG_MANUAL_OPEN_ALT)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_MANUAL_OPEN_ALT),
            updateMode: 'manual',
            syntaxVariant: 'alternative'
        }
    }
    if (
        trimmedLine.includes(QUERY_FLAG_ONCE_OPEN_ALT.trim()) ||
        trimmedLine.includes(QUERY_FLAG_ONCE_OPEN_ALT)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_ONCE_OPEN_ALT),
            updateMode: 'once',
            syntaxVariant: 'alternative'
        }
    }
    if (
        trimmedLine.includes(QUERY_FLAG_OPEN_ALT.trim()) ||
        trimmedLine.includes(QUERY_FLAG_OPEN_ALT)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_OPEN_ALT),
            updateMode: 'auto',
            syntaxVariant: 'alternative'
        }
    }

    // Legacy syntax checks
    if (
        trimmedLine.includes(QUERY_FLAG_ONCE_AND_EJECT_OPEN.trim()) ||
        trimmedLine.includes(QUERY_FLAG_ONCE_AND_EJECT_OPEN)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_ONCE_AND_EJECT_OPEN),
            updateMode: 'once-and-eject',
            syntaxVariant: 'legacy'
        }
    }
    if (
        trimmedLine.includes(QUERY_FLAG_MANUAL_OPEN.trim()) ||
        trimmedLine.includes(QUERY_FLAG_MANUAL_OPEN)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_MANUAL_OPEN),
            updateMode: 'manual',
            syntaxVariant: 'legacy'
        }
    }
    if (
        trimmedLine.includes(QUERY_FLAG_ONCE_OPEN.trim()) ||
        trimmedLine.includes(QUERY_FLAG_ONCE_OPEN)
    ) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_ONCE_OPEN),
            updateMode: 'once',
            syntaxVariant: 'legacy'
        }
    }
    if (trimmedLine.includes(QUERY_FLAG_OPEN.trim()) || trimmedLine.includes(QUERY_FLAG_OPEN)) {
        return {
            flagOpen: getActualFlag(QUERY_FLAG_OPEN),
            updateMode: 'auto',
            syntaxVariant: 'legacy'
        }
    }
    return null
}

/**
 * State for tracking multi-line query parsing
 */
interface MultiLineState {
    isCapturing: boolean
    startLineIndex: number
    flagOpen: string
    updateMode: QueryUpdateMode
    syntaxVariant: SyntaxVariant
    indentation: string
    accumulatedLines: string[]
}

/**
 * Create initial multi-line state
 */
function createInitialMultiLineState(): MultiLineState {
    return {
        isCapturing: false,
        startLineIndex: -1,
        flagOpen: '',
        updateMode: 'auto',
        syntaxVariant: 'legacy',
        indentation: '',
        accumulatedLines: []
    }
}

/**
 * Extract query content from accumulated lines
 * @param accumulatedLines The lines that make up the query
 * @param flagOpen The opening flag
 * @returns The extracted query text (trimmed and normalized)
 */
function extractMultiLineQuery(accumulatedLines: string[], flagOpen: string): string {
    const fullText = accumulatedLines.join('\n')

    // Find the position after the opening flag
    // Try with the full flag first, then the trimmed version
    let openFlagIndex = fullText.indexOf(flagOpen)
    let flagLength = flagOpen.length
    if (openFlagIndex === -1) {
        openFlagIndex = fullText.indexOf(flagOpen.trim())
        flagLength = flagOpen.trim().length
    }
    if (openFlagIndex === -1) {
        return ''
    }

    // Find the closing flag (try both with and without leading space)
    let closeFlagIndex = fullText.indexOf(QUERY_FLAG_CLOSE)
    if (closeFlagIndex === -1) {
        closeFlagIndex = fullText.indexOf(QUERY_FLAG_CLOSE.trim())
    }
    if (closeFlagIndex === -1) {
        return ''
    }

    // Extract content between flags
    const queryContent = fullText.substring(openFlagIndex + flagLength, closeFlagIndex)

    // Normalize whitespace: replace newlines and multiple spaces with single spaces, then trim
    return queryContent
        .split('\n')
        .map((line) => line.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Detect the queries in the given string with their indentation context.
 * Supports both single-line and multi-line query definitions.
 * Ignores duplicates and ignores unsupported query types.
 *
 * Multi-line queries are detected when the opening flag is found but the closing
 * flag is not on the same line. Lines are accumulated until the closing flag is found.
 *
 * @param text The document text to search for queries
 * @returns Array of queries with their context information
 */
export const findQueries = (text: string): QueryWithContext[] => {
    const retVal: QueryWithContext[] = []
    const lines: string[] = text.split('\n')
    let multiLineState = createInitialMultiLineState()

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        const trimmedLine = line.trim()

        if (multiLineState.isCapturing) {
            // We're in the middle of capturing a multi-line query
            multiLineState.accumulatedLines.push(line)

            // Check if this line contains the closing flag (with or without leading space)
            if (line.includes(QUERY_FLAG_CLOSE) || line.includes(QUERY_FLAG_CLOSE.trim())) {
                // Multi-line query complete
                const foundQuery = extractMultiLineQuery(
                    multiLineState.accumulatedLines,
                    multiLineState.flagOpen
                )

                // Determine which closing flag variant is present
                const flagClose = line.includes(QUERY_FLAG_CLOSE)
                    ? QUERY_FLAG_CLOSE
                    : QUERY_FLAG_CLOSE.trim()

                if (
                    foundQuery &&
                    !retVal.some((item) => item.query === foundQuery) &&
                    isSupportedQueryType(foundQuery)
                ) {
                    retVal.push({
                        query: foundQuery,
                        indentation: multiLineState.indentation,
                        updateMode: multiLineState.updateMode,
                        flagOpen: multiLineState.flagOpen,
                        flagClose,
                        originalQueryDefinition: multiLineState.accumulatedLines.join('\n'),
                        syntaxVariant: multiLineState.syntaxVariant
                    })
                }

                // Reset state
                multiLineState = createInitialMultiLineState()
            }
        } else {
            // Not currently capturing, look for a new query
            const flagInfo = detectQueryFlag(trimmedLine, line)

            if (flagInfo) {
                const { flagOpen, updateMode, syntaxVariant } = flagInfo

                // Check for closing flag (with or without leading space)
                const hasClosingFlag =
                    trimmedLine.includes(QUERY_FLAG_CLOSE) ||
                    trimmedLine.includes(QUERY_FLAG_CLOSE.trim())

                if (hasClosingFlag) {
                    // Single-line query (existing behavior)
                    const indentation = line.substring(0, line.indexOf(flagOpen.trim()))

                    // Find opening flag position (try with and without trailing space)
                    let openFlagIndex = trimmedLine.indexOf(flagOpen)
                    let flagLength = flagOpen.length
                    if (openFlagIndex === -1) {
                        openFlagIndex = trimmedLine.indexOf(flagOpen.trim())
                        flagLength = flagOpen.trim().length
                    }

                    // Find closing flag position and determine which variant is used
                    // Check on the ORIGINAL line to get the actual flag variant
                    let closeFlagIndex = trimmedLine.indexOf(QUERY_FLAG_CLOSE)
                    let flagClose = QUERY_FLAG_CLOSE
                    if (closeFlagIndex === -1) {
                        closeFlagIndex = trimmedLine.indexOf(QUERY_FLAG_CLOSE.trim())
                        // Check the original line to see which variant is actually present
                        flagClose = line.includes(QUERY_FLAG_CLOSE)
                            ? QUERY_FLAG_CLOSE
                            : QUERY_FLAG_CLOSE.trim()
                    }

                    const foundQuery = trimmedLine
                        .substring(openFlagIndex + flagLength, closeFlagIndex)
                        .trim()

                    if (
                        !retVal.some((item) => item.query === foundQuery) &&
                        isSupportedQueryType(foundQuery)
                    ) {
                        retVal.push({
                            query: foundQuery,
                            indentation,
                            updateMode,
                            flagOpen,
                            flagClose,
                            syntaxVariant
                        })
                    }
                } else {
                    // Opening flag found but no closing flag on this line
                    // Start capturing for multi-line query
                    multiLineState = {
                        isCapturing: true,
                        startLineIndex: i,
                        flagOpen,
                        updateMode,
                        syntaxVariant,
                        indentation: line.substring(0, line.indexOf(flagOpen.trim())),
                        accumulatedLines: [line]
                    }
                }
            }
        }
    }

    // Note: If multiLineState.isCapturing is still true at the end,
    // it means we have an incomplete multi-line query (no closing flag found).
    // We simply ignore it, similar to how we ignore single-line queries without closing flags.

    return retVal
}
