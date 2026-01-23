import type { QueryUpdateMode } from './find-queries.fn'

export interface ShouldSkipQueryParams {
    updateMode: QueryUpdateMode
    isManualTrigger: boolean
    isAlreadySerialized: boolean
}

/**
 * Determines whether a query should be skipped based on its update mode
 * and whether the current update is a manual trigger.
 *
 * @param params - The parameters for determining skip behavior
 * @returns true if the query should be skipped, false otherwise
 */
export function shouldSkipQuery(params: ShouldSkipQueryParams): boolean {
    const { updateMode, isManualTrigger, isAlreadySerialized } = params

    // Manual triggers always process all queries
    if (isManualTrigger) {
        return false
    }

    // During automatic updates:
    // - Skip 'manual' queries (they only update on manual trigger)
    if (updateMode === 'manual') {
        return true
    }

    // - Skip 'once' queries if they're already serialized
    if (updateMode === 'once' && isAlreadySerialized) {
        return true
    }

    // 'auto' queries are never skipped
    return false
}
