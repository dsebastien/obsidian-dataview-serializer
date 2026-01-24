import { describe, expect, it } from 'bun:test'
import { escapeRegExp } from './escape-reg-exp.fn'
import {
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_OPEN,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_START
} from '../constants'

/**
 * Tests for the query regex matching logic used in plugin.ts.
 * These tests verify that similar queries don't interfere with each other.
 *
 * Regression tests for: https://github.com/dsebastien/obsidian-dataview-serializer/issues/25
 */
describe('query regex matching', () => {
    /**
     * Build the regex used in plugin.ts to match and replace queries.
     * This matches the logic from plugin.ts lines 637-642.
     */
    function buildQueryToSerializeRegex(
        query: string,
        indentation = '',
        flagOpen = QUERY_FLAG_OPEN
    ): RegExp {
        const escapedQuery = escapeRegExp(query)
        const escapedIndentation = escapeRegExp(indentation)
        const escapedFlagOpen = escapeRegExp(flagOpen)
        const escapedSerializedStart = escapeRegExp(SERIALIZED_QUERY_START)
        const escapedSerializedEnd = escapeRegExp(SERIALIZED_QUERY_END)
        const escapedQueryClose = escapeRegExp(QUERY_FLAG_CLOSE)

        return new RegExp(
            `^(${escapedIndentation}${escapedFlagOpen}${escapedQuery}${escapedQueryClose}\\n)(?:${escapedSerializedStart}${escapedQuery}${escapedQueryClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
            'gm'
        )
    }

    describe('issue #25: multiple queries with similar prefixes', () => {
        it('should not match a longer query when searching for a shorter prefix query', () => {
            const shortQuery = 'LIST FROM #project'
            const longQuery = 'LIST FROM #project and #done'

            const regex = buildQueryToSerializeRegex(shortQuery)
            const fileContent = `${QUERY_FLAG_OPEN}${longQuery}${QUERY_FLAG_CLOSE}\n`

            // The short query regex should NOT match the long query line
            expect(regex.test(fileContent)).toBe(false)
        })

        it('should not match a shorter query when searching for a longer query', () => {
            const shortQuery = 'LIST FROM #project'
            const longQuery = 'LIST FROM #project and #done'

            const regex = buildQueryToSerializeRegex(longQuery)
            const fileContent = `${QUERY_FLAG_OPEN}${shortQuery}${QUERY_FLAG_CLOSE}\n`

            // The long query regex should NOT match the short query line
            expect(regex.test(fileContent)).toBe(false)
        })

        it('should correctly match only the exact query in a file with similar queries', () => {
            const shortQuery = 'LIST FROM #project'
            const longQuery = 'LIST FROM #project and #done'

            const fileContent = `${QUERY_FLAG_OPEN}${shortQuery}${QUERY_FLAG_CLOSE}
${QUERY_FLAG_OPEN}${longQuery}${QUERY_FLAG_CLOSE}
`

            const shortRegex = buildQueryToSerializeRegex(shortQuery)
            const longRegex = buildQueryToSerializeRegex(longQuery)

            // Each regex should match exactly one query line
            const shortMatches = fileContent.match(shortRegex)
            const longMatches = fileContent.match(longRegex)

            expect(shortMatches).toHaveLength(1)
            expect(shortMatches?.[0]).toContain(shortQuery)
            expect(shortMatches?.[0]).not.toContain('and #done')

            expect(longMatches).toHaveLength(1)
            expect(longMatches?.[0]).toContain(longQuery)
        })

        it('should handle queries that are substrings at different positions', () => {
            const query1 = 'LIST FROM #done and #project'
            const query2 = 'LIST FROM #project'
            const query3 = 'LIST FROM #project and #done'

            const fileContent = `${QUERY_FLAG_OPEN}${query1}${QUERY_FLAG_CLOSE}
${QUERY_FLAG_OPEN}${query2}${QUERY_FLAG_CLOSE}
${QUERY_FLAG_OPEN}${query3}${QUERY_FLAG_CLOSE}
`

            const regex1 = buildQueryToSerializeRegex(query1)
            const regex2 = buildQueryToSerializeRegex(query2)
            const regex3 = buildQueryToSerializeRegex(query3)

            expect(fileContent.match(regex1)).toHaveLength(1)
            expect(fileContent.match(regex2)).toHaveLength(1)
            expect(fileContent.match(regex3)).toHaveLength(1)
        })
    })

    describe('exact query matching', () => {
        it('should match a query exactly', () => {
            const query = 'LIST FROM #project'
            const regex = buildQueryToSerializeRegex(query)
            const fileContent = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should match a query with existing serialized block', () => {
            const query = 'LIST FROM #project'
            const regex = buildQueryToSerializeRegex(query)
            const fileContent = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}
- [[Note 1]]
- [[Note 2]]
${SERIALIZED_QUERY_END}
`

            const matches = fileContent.match(regex)
            expect(matches).toHaveLength(1)
        })

        it('should match queries with special regex characters', () => {
            const query = 'LIST FROM "path/to/folder" WHERE field = "value"'
            const regex = buildQueryToSerializeRegex(query)
            const fileContent = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should match queries with indentation', () => {
            const query = 'LIST FROM #project'
            const indentation = '    '
            const regex = buildQueryToSerializeRegex(query, indentation)
            const fileContent = `${indentation}${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })
    })
})
