import { QUERY_TYPE_TASK } from '../constants'

/**
 * Returns true if the query is a TASK query
 * @param query
 */
export const isTaskQuery = (query: string): boolean => {
    const queryLower = query.toLowerCase().trim()
    return queryLower.startsWith(QUERY_TYPE_TASK)
}
