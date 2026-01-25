/**
 * Find DataviewJS queries in a document.
 *
 * Supports both legacy and alternative syntax variants:
 *
 * Legacy syntax:
 * <!-- DataviewJSToSerialize:
 * dv.list(dv.pages("#project").file.link)
 * -->
 *
 * Alternative syntax:
 * <!-- dataview-serializer-js:
 * dv.list(dv.pages("#project").file.link)
 * -->
 *
 * Both support update modes: auto, manual, once, once-and-eject
 */

import {
    DATAVIEWJS_FLAG_OPEN,
    DATAVIEWJS_FLAG_MANUAL_OPEN,
    DATAVIEWJS_FLAG_ONCE_OPEN,
    DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN,
    DATAVIEWJS_FLAG_OPEN_ALT,
    DATAVIEWJS_FLAG_MANUAL_OPEN_ALT,
    DATAVIEWJS_FLAG_ONCE_OPEN_ALT,
    DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    QUERY_FLAG_CLOSE,
    SERIALIZED_DATAVIEWJS_START,
    SERIALIZED_DATAVIEWJS_END,
    SERIALIZED_DATAVIEWJS_START_ALT,
    SERIALIZED_DATAVIEWJS_END_ALT
} from '../constants'
import type { QueryUpdateMode, SyntaxVariant } from './find-queries.fn'

/**
 * Interface to represent a DataviewJS query with its context
 */
export interface DataviewJSQueryWithContext {
    /** The JavaScript code to execute */
    jsCode: string
    /** Indentation of the query definition */
    indentation: string
    /** Update mode (auto, manual, once, once-and-eject) */
    updateMode: QueryUpdateMode
    /** Opening flag marker */
    flagOpen: string
    /** Closing flag marker (with or without leading space) */
    flagClose: string
    /** Syntax variant (legacy or alternative) */
    syntaxVariant: SyntaxVariant
    /**
     * The original query definition text from opening marker to closing marker.
     * Used for accurate replacement.
     */
    originalQueryDefinition: string
}

/**
 * All DataviewJS opening flags in order of specificity (most specific first)
 */
const DATAVIEWJS_FLAGS = [
    // Alternative syntax (more specific - check first)
    {
        flag: DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN_ALT,
        updateMode: 'once-and-eject' as QueryUpdateMode,
        syntaxVariant: 'alternative' as SyntaxVariant
    },
    {
        flag: DATAVIEWJS_FLAG_MANUAL_OPEN_ALT,
        updateMode: 'manual' as QueryUpdateMode,
        syntaxVariant: 'alternative' as SyntaxVariant
    },
    {
        flag: DATAVIEWJS_FLAG_ONCE_OPEN_ALT,
        updateMode: 'once' as QueryUpdateMode,
        syntaxVariant: 'alternative' as SyntaxVariant
    },
    {
        flag: DATAVIEWJS_FLAG_OPEN_ALT,
        updateMode: 'auto' as QueryUpdateMode,
        syntaxVariant: 'alternative' as SyntaxVariant
    },
    // Legacy syntax
    {
        flag: DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN,
        updateMode: 'once-and-eject' as QueryUpdateMode,
        syntaxVariant: 'legacy' as SyntaxVariant
    },
    {
        flag: DATAVIEWJS_FLAG_MANUAL_OPEN,
        updateMode: 'manual' as QueryUpdateMode,
        syntaxVariant: 'legacy' as SyntaxVariant
    },
    {
        flag: DATAVIEWJS_FLAG_ONCE_OPEN,
        updateMode: 'once' as QueryUpdateMode,
        syntaxVariant: 'legacy' as SyntaxVariant
    },
    {
        flag: DATAVIEWJS_FLAG_OPEN,
        updateMode: 'auto' as QueryUpdateMode,
        syntaxVariant: 'legacy' as SyntaxVariant
    }
]

/**
 * Detect which DataviewJS flag is present in a line.
 *
 * @param trimmedLine The trimmed line (for detection)
 * @param originalLine The original line (to determine which flag variant is present)
 */
function detectDataviewJSFlag(
    trimmedLine: string,
    originalLine: string
): { flagOpen: string; updateMode: QueryUpdateMode; syntaxVariant: SyntaxVariant } | null {
    // Helper to determine which flag variant (full or trimmed) is in the original line
    const getActualFlag = (fullFlag: string): string => {
        return originalLine.includes(fullFlag) ? fullFlag : fullFlag.trim()
    }

    for (const { flag, updateMode, syntaxVariant } of DATAVIEWJS_FLAGS) {
        if (trimmedLine.includes(flag.trim()) || trimmedLine.includes(flag)) {
            return {
                flagOpen: getActualFlag(flag),
                updateMode,
                syntaxVariant
            }
        }
    }

    return null
}

/**
 * State for tracking multi-line DataviewJS query parsing
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
 * Extract JavaScript code from accumulated lines.
 *
 * @param accumulatedLines The lines that make up the query
 * @param flagOpen The opening flag
 * @returns The extracted JavaScript code (trimmed)
 */
function extractJSCode(accumulatedLines: string[], flagOpen: string): string {
    const fullText = accumulatedLines.join('\n')

    // Find the position after the opening flag
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
    const jsCode = fullText.substring(openFlagIndex + flagLength, closeFlagIndex)

    // Trim leading/trailing whitespace but preserve internal formatting
    return jsCode.trim()
}

/**
 * Detect DataviewJS queries in the given string.
 *
 * DataviewJS queries are always multi-line (JavaScript code spans lines).
 * The opening marker starts with `<!-- DataviewJSToSerialize:` and ends with `-->`.
 *
 * @param text The document text to search for queries
 * @returns Array of DataviewJS queries with their context information
 */
export function findDataviewJSQueries(text: string): DataviewJSQueryWithContext[] {
    const retVal: DataviewJSQueryWithContext[] = []
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
                const jsCode = extractJSCode(
                    multiLineState.accumulatedLines,
                    multiLineState.flagOpen
                )

                // Determine which closing flag variant is present
                const flagClose = line.includes(QUERY_FLAG_CLOSE)
                    ? QUERY_FLAG_CLOSE
                    : QUERY_FLAG_CLOSE.trim()

                if (jsCode) {
                    // Check for duplicates (same JS code)
                    const isDuplicate = retVal.some((item) => item.jsCode === jsCode)

                    if (!isDuplicate) {
                        retVal.push({
                            jsCode,
                            indentation: multiLineState.indentation,
                            updateMode: multiLineState.updateMode,
                            flagOpen: multiLineState.flagOpen,
                            flagClose,
                            syntaxVariant: multiLineState.syntaxVariant,
                            originalQueryDefinition: multiLineState.accumulatedLines.join('\n')
                        })
                    }
                }

                // Reset state
                multiLineState = createInitialMultiLineState()
            }
        } else {
            // Not currently capturing, look for a new DataviewJS query
            const flagInfo = detectDataviewJSFlag(trimmedLine, line)

            if (flagInfo) {
                const { flagOpen, updateMode, syntaxVariant } = flagInfo

                // Check if the closing flag is on the same line (single-line query)
                // This is rare for DataviewJS but possible
                const hasClosingFlag =
                    trimmedLine.includes(QUERY_FLAG_CLOSE) ||
                    trimmedLine.includes(QUERY_FLAG_CLOSE.trim())

                // Find the flag position in the line
                const flagIndex = line.indexOf(flagOpen.trim())
                const indentation = flagIndex >= 0 ? line.substring(0, flagIndex) : ''

                if (hasClosingFlag) {
                    // Single-line query (rare but possible)
                    // Extract JS code between opening flag and closing flag

                    // Find opening flag position
                    let openFlagIndex = trimmedLine.indexOf(flagOpen)
                    let flagLength = flagOpen.length
                    if (openFlagIndex === -1) {
                        openFlagIndex = trimmedLine.indexOf(flagOpen.trim())
                        flagLength = flagOpen.trim().length
                    }

                    // Find closing flag position
                    let closeFlagIndex = trimmedLine.indexOf(QUERY_FLAG_CLOSE)
                    let flagClose = QUERY_FLAG_CLOSE
                    if (closeFlagIndex === -1) {
                        closeFlagIndex = trimmedLine.indexOf(QUERY_FLAG_CLOSE.trim())
                        flagClose = line.includes(QUERY_FLAG_CLOSE)
                            ? QUERY_FLAG_CLOSE
                            : QUERY_FLAG_CLOSE.trim()
                    }

                    if (openFlagIndex !== -1 && closeFlagIndex !== -1) {
                        const jsCode = trimmedLine
                            .substring(openFlagIndex + flagLength, closeFlagIndex)
                            .trim()

                        if (jsCode && !retVal.some((item) => item.jsCode === jsCode)) {
                            retVal.push({
                                jsCode,
                                indentation,
                                updateMode,
                                flagOpen,
                                flagClose,
                                syntaxVariant,
                                originalQueryDefinition: line
                            })
                        }
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
                        indentation,
                        accumulatedLines: [line]
                    }
                }
            }
        }
    }

    // If multiLineState.isCapturing is still true at the end,
    // it means we have an incomplete query (no closing flag found).
    // We simply ignore it.

    return retVal
}

/**
 * Build a serialized DataviewJS query string with markers.
 *
 * @param jsCode The JavaScript code (for reference in result marker)
 * @param serializedContent The serialized markdown content
 * @param syntaxVariant Which syntax variant to use for markers
 * @returns The full serialized block with markers
 */
export function buildSerializedDataviewJS(
    serializedContent: string,
    syntaxVariant: SyntaxVariant
): string {
    const startMarker =
        syntaxVariant === 'alternative'
            ? SERIALIZED_DATAVIEWJS_START_ALT
            : SERIALIZED_DATAVIEWJS_START
    const endMarker =
        syntaxVariant === 'alternative' ? SERIALIZED_DATAVIEWJS_END_ALT : SERIALIZED_DATAVIEWJS_END

    // Close the start marker with -->
    return `${startMarker} -->\n${serializedContent}\n${endMarker}`
}

/**
 * Check if a DataviewJS query is already serialized.
 *
 * @param text The document text
 * @param jsCode The JavaScript code to check
 * @returns true if the query already has serialized output
 */
export function isDataviewJSAlreadySerialized(text: string): boolean {
    // Check for both legacy and alternative result markers
    return (
        text.includes(SERIALIZED_DATAVIEWJS_START) || text.includes(SERIALIZED_DATAVIEWJS_START_ALT)
    )
}
