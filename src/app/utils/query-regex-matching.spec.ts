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

    describe('multi-line query matching', () => {
        /**
         * Build the regex for multi-line query matching.
         * This matches the logic from plugin.ts when originalQueryDefinition is present.
         */
        function buildMultiLineQueryRegex(
            originalQueryDefinition: string,
            normalizedQuery: string
        ): RegExp {
            const escapedOriginalDefinition = escapeRegExp(originalQueryDefinition)
            const escapedQuery = escapeRegExp(normalizedQuery)
            const escapedSerializedStart = escapeRegExp(SERIALIZED_QUERY_START)
            const escapedSerializedEnd = escapeRegExp(SERIALIZED_QUERY_END)
            const escapedQueryClose = escapeRegExp(QUERY_FLAG_CLOSE)

            return new RegExp(
                `(${escapedOriginalDefinition}\\n)(?:${escapedSerializedStart}${escapedQuery}${escapedQueryClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
                'gm'
            )
        }

        it('should match a multi-line query definition', () => {
            const originalDef = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const normalizedQuery = 'TABLE file.name FROM "folder"'

            const regex = buildMultiLineQueryRegex(originalDef, normalizedQuery)
            const fileContent = `${originalDef}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should match a multi-line query with existing serialized block', () => {
            const originalDef = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const normalizedQuery = 'TABLE file.name FROM "folder"'

            const regex = buildMultiLineQueryRegex(originalDef, normalizedQuery)
            const fileContent = `${originalDef}
${SERIALIZED_QUERY_START}${normalizedQuery}${QUERY_FLAG_CLOSE}
| File | Name |
| --- | --- |
| note1 | Note 1 |
${SERIALIZED_QUERY_END}
`

            const matches = fileContent.match(regex)
            expect(matches).toHaveLength(1)
        })

        it('should correctly replace a multi-line query definition while preserving format', () => {
            const originalDef = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const normalizedQuery = 'TABLE file.name FROM "folder"'

            const regex = buildMultiLineQueryRegex(originalDef, normalizedQuery)
            const fileContent = `Some content before

${originalDef}

Some content after`

            // Build the replacement (preserving original multi-line format)
            const replacement = `${originalDef}
${SERIALIZED_QUERY_START}${normalizedQuery}${QUERY_FLAG_CLOSE}

| File | Name |
| --- | --- |
| note1 | Note 1 |

${SERIALIZED_QUERY_END}
`

            const result = fileContent.replace(regex, replacement)

            // Should preserve the original multi-line format
            expect(result).toContain('TABLE file.name\n')
            expect(result).toContain('FROM "folder"')
            expect(result).toContain(SERIALIZED_QUERY_START)
            expect(result).toContain('note1')
        })

        it('should not interfere with similar but different multi-line queries', () => {
            const originalDef1 = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder1"
${QUERY_FLAG_CLOSE}`
            const originalDef2 = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder2"
${QUERY_FLAG_CLOSE}`
            const normalizedQuery1 = 'TABLE file.name FROM "folder1"'
            const normalizedQuery2 = 'TABLE file.name FROM "folder2"'

            const fileContent = `${originalDef1}
${originalDef2}
`

            const regex1 = buildMultiLineQueryRegex(originalDef1, normalizedQuery1)
            const regex2 = buildMultiLineQueryRegex(originalDef2, normalizedQuery2)

            // Each regex should match exactly one query
            expect(fileContent.match(regex1)).toHaveLength(1)
            expect(fileContent.match(regex2)).toHaveLength(1)

            // Verify they match the correct ones
            const match1 = fileContent.match(regex1)?.[0]
            const match2 = fileContent.match(regex2)?.[0]

            expect(match1).toContain('folder1')
            expect(match1).not.toContain('folder2')
            expect(match2).toContain('folder2')
            expect(match2).not.toContain('folder1')
        })

        it('should handle complex multi-line TABLE queries', () => {
            const originalDef = `${QUERY_FLAG_OPEN}
TABLE
  dateformat(release-date, "yyyy-MM-dd") AS "Release Date",
  rating,
  status
FROM "Games"
WHERE rating > 7
SORT finished-date DESC
${QUERY_FLAG_CLOSE}`
            const normalizedQuery =
                'TABLE dateformat(release-date, "yyyy-MM-dd") AS "Release Date", rating, status FROM "Games" WHERE rating > 7 SORT finished-date DESC'

            const regex = buildMultiLineQueryRegex(originalDef, normalizedQuery)
            const fileContent = `${originalDef}\n`

            expect(regex.test(fileContent)).toBe(true)
        })
    })
})
