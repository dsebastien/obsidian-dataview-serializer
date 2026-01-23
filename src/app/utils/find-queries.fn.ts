import {
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_OPEN
} from '../constants'
import { isSupportedQueryType } from './is-supported-query-type.fn'

/**
 * Update mode for a query
 * - 'auto': Automatic updates (default behavior)
 * - 'manual': Skips automatic updates; refreshable via commands/button
 * - 'once': Only serializes once; never auto-updates after first serialization
 */
export type QueryUpdateMode = 'auto' | 'manual' | 'once'

/**
 * Interface to represent a query with its indentation context
 */
export interface QueryWithContext {
    query: string
    indentation: string
    updateMode: QueryUpdateMode
    flagOpen: string
}

/**
 * Detect which query flag is present in a line and return the flag info
 */
function detectQueryFlag(line: string): { flagOpen: string; updateMode: QueryUpdateMode } | null {
    // Check in order of specificity (longer prefixes first)
    if (line.includes(QUERY_FLAG_MANUAL_OPEN)) {
        return { flagOpen: QUERY_FLAG_MANUAL_OPEN, updateMode: 'manual' }
    }
    if (line.includes(QUERY_FLAG_ONCE_OPEN)) {
        return { flagOpen: QUERY_FLAG_ONCE_OPEN, updateMode: 'once' }
    }
    if (line.includes(QUERY_FLAG_OPEN)) {
        return { flagOpen: QUERY_FLAG_OPEN, updateMode: 'auto' }
    }
    return null
}

/**
 * Detect the queries in the given string with their indentation context.
 * Ignores duplicates and ignores unsupported query types
 * @param text
 */
export const findQueries = (text: string): QueryWithContext[] => {
    const retVal: QueryWithContext[] = []

    const lines: string[] = text.split('\n')
    for (const line of lines) {
        const trimmedLine = line.trim()
        const flagInfo = detectQueryFlag(trimmedLine)

        if (flagInfo && trimmedLine.includes(QUERY_FLAG_CLOSE)) {
            const { flagOpen, updateMode } = flagInfo

            // Extract the indentation (everything before the flag in the original line)
            const indentation = line.substring(0, line.indexOf(flagOpen.trim()))

            // Extract the query content between the flags
            const openFlagIndex = trimmedLine.indexOf(flagOpen)
            const closeFlagIndex = trimmedLine.indexOf(QUERY_FLAG_CLOSE)
            const foundQuery = trimmedLine
                .substring(openFlagIndex + flagOpen.length, closeFlagIndex)
                .trim()

            // Ignore duplicates
            // Make sure it is a supported query
            if (
                !retVal.some((item) => item.query === foundQuery) &&
                isSupportedQueryType(foundQuery)
            ) {
                retVal.push({ query: foundQuery, indentation, updateMode, flagOpen })
            }
        }
    }

    return retVal
}
