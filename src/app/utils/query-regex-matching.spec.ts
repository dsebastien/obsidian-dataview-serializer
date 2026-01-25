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
     * This matches the logic from plugin.ts for single-line queries.
     * Note: \\s* before the closing flag allows trailing whitespace between the
     * query and --> (users may have extra spaces before the closing comment)
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
            `^(${escapedIndentation}${escapedFlagOpen}${escapedQuery}\\s*${escapedQueryClose}\\n)(?:${escapedSerializedStart}${escapedQuery}${escapedQueryClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
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

    /**
     * Regression tests for: https://github.com/dsebastien/obsidian-dataview-serializer/issues/53
     * Issue: Queries with trailing whitespace before --> were not matching
     */
    describe('issue #53: trailing whitespace before closing flag', () => {
        it('should match a query with extra spaces before closing flag', () => {
            const query = 'list from #class/video-game'
            const regex = buildQueryToSerializeRegex(query)
            // Note: extra spaces before -->
            const fileContent = `${QUERY_FLAG_OPEN}${query}   ${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should match a query with tabs before closing flag', () => {
            const query = 'LIST FROM #project'
            const regex = buildQueryToSerializeRegex(query)
            const fileContent = `${QUERY_FLAG_OPEN}${query}\t\t${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should match a query with mixed whitespace before closing flag', () => {
            const query = 'TABLE file.name FROM "folder"'
            const regex = buildQueryToSerializeRegex(query)
            const fileContent = `${QUERY_FLAG_OPEN}${query}  \t ${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should still match a query with no extra whitespace', () => {
            const query = 'LIST FROM #project'
            const regex = buildQueryToSerializeRegex(query)
            const fileContent = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`

            expect(regex.test(fileContent)).toBe(true)
        })

        it('should correctly replace query with trailing whitespace', () => {
            const query = 'list from #class/video-game'
            const regex = buildQueryToSerializeRegex(query)
            // File with extra spaces before -->
            const fileContent = `${QUERY_FLAG_OPEN}${query}   ${QUERY_FLAG_CLOSE}\n`

            const replacement = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}
- [[Game 1]]
- [[Game 2]]

${SERIALIZED_QUERY_END}
`

            const result = fileContent.replace(regex, replacement)

            // Should have replaced and added serialized content
            expect(result).toContain(SERIALIZED_QUERY_START)
            expect(result).toContain('[[Game 1]]')
            expect(result).toContain(SERIALIZED_QUERY_END)
        })

        it('should match query with trailing whitespace and existing serialized block', () => {
            const query = 'LIST FROM #project'
            const regex = buildQueryToSerializeRegex(query)
            // Query line has trailing spaces, serialized block exists
            const fileContent = `${QUERY_FLAG_OPEN}${query}   ${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}
- [[Note 1]]
- [[Note 2]]
${SERIALIZED_QUERY_END}
`

            const matches = fileContent.match(regex)
            expect(matches).toHaveLength(1)
        })

        it('should handle file with multiple queries having different whitespace patterns', () => {
            const query1 = 'LIST FROM #project'
            const query2 = 'LIST FROM #done'

            // query1 has extra spaces, query2 has no extra spaces
            const fileContent = `${QUERY_FLAG_OPEN}${query1}   ${QUERY_FLAG_CLOSE}
${QUERY_FLAG_OPEN}${query2}${QUERY_FLAG_CLOSE}
`

            const regex1 = buildQueryToSerializeRegex(query1)
            const regex2 = buildQueryToSerializeRegex(query2)

            expect(fileContent.match(regex1)).toHaveLength(1)
            expect(fileContent.match(regex2)).toHaveLength(1)
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

    /**
     * Regression tests for: https://github.com/dsebastien/obsidian-dataview-serializer/issues/56
     * Issue: When a query is modified, the old serialized results were retained and new results
     * added to the top, causing duplicate serialized blocks.
     *
     * Fix: The replacement regex now matches ANY query text in the SerializedQuery marker
     * (using [^\\n]* instead of the exact query), so when a query is modified, the old
     * serialized block is found and replaced, not left orphaned.
     */
    describe('issue #56: modified queries should replace old serialized content', () => {
        /**
         * Build the FIXED regex that matches any query text in the SerializedQuery marker.
         * This is the new implementation that fixes issue #56.
         */
        function buildFixedQueryToSerializeRegex(
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

            // Key fix: Use [^\\n]* instead of ${escapedQuery} in the SerializedQuery marker
            // This matches ANY query text, allowing us to find and replace the old serialized
            // block even when the query has been modified
            return new RegExp(
                `^(${escapedIndentation}${escapedFlagOpen}${escapedQuery}\\s*${escapedQueryClose}\\n)(?:${escapedSerializedStart}[^\\n]*${escapedQueryClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
                'gm'
            )
        }

        it('should match modified query with old serialized block (issue #56 scenario)', () => {
            // User originally had query with "15" and it was serialized
            const oldQuery = 'table embed(link(thumbnail, "15")) FROM #class/book'
            // User modified query to "150"
            const newQuery = 'table embed(link(thumbnail, "150")) FROM #class/book'

            // File content after user modifies the query (but before plugin processes)
            // Note: QueryToSerialize has new query, but SerializedQuery still has old query
            const fileContent = `${QUERY_FLAG_OPEN}${newQuery}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${oldQuery}${QUERY_FLAG_CLOSE}
| File | Thumbnail |
| --- | --- |
| Book1 | ![[thumb1.png]] |
${SERIALIZED_QUERY_END}
`

            // The fixed regex should match the ENTIRE block (query definition + old serialized block)
            const regex = buildFixedQueryToSerializeRegex(newQuery)
            const matches = fileContent.match(regex)

            // Should match exactly one block
            expect(matches).toHaveLength(1)
            // The match should include both the query definition AND the old serialized block
            expect(matches?.[0]).toContain(QUERY_FLAG_OPEN + newQuery)
            expect(matches?.[0]).toContain(SERIALIZED_QUERY_START)
            expect(matches?.[0]).toContain(SERIALIZED_QUERY_END)
        })

        it('should correctly replace old serialized content when query is modified', () => {
            const oldQuery = 'table embed(link(thumbnail, "15")) FROM #class/book'
            const newQuery = 'table embed(link(thumbnail, "150")) FROM #class/book'

            // File content with old serialized block
            const fileContent = `${QUERY_FLAG_OPEN}${newQuery}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${oldQuery}${QUERY_FLAG_CLOSE}
| File | Thumbnail |
| --- | --- |
| Book1 | ![[thumb1.png|15]] |
${SERIALIZED_QUERY_END}
`

            // New serialized content (with larger thumbnails)
            const replacement = `${QUERY_FLAG_OPEN}${newQuery}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${newQuery}${QUERY_FLAG_CLOSE}

| File | Thumbnail |
| --- | --- |
| Book1 | ![[thumb1.png|150]] |

${SERIALIZED_QUERY_END}
`

            const regex = buildFixedQueryToSerializeRegex(newQuery)
            const result = fileContent.replace(regex, replacement)

            // Should have the new query in both places
            expect(result).toContain(`${QUERY_FLAG_OPEN}${newQuery}`)
            expect(result).toContain(`${SERIALIZED_QUERY_START}${newQuery}`)
            // Should have the new thumbnail size
            expect(result).toContain('|150]]')
            // Should NOT have duplicate SerializedQuery blocks
            expect(result.split(SERIALIZED_QUERY_START).length).toBe(2) // 1 occurrence = 2 parts
            expect(result.split(SERIALIZED_QUERY_END).length).toBe(2)
        })

        it('should not leave orphaned serialized blocks', () => {
            const oldQuery = 'LIST FROM #tag1'
            const newQuery = 'LIST FROM #tag1 AND #tag2'

            const fileContent = `Some content before

${QUERY_FLAG_OPEN}${newQuery}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${oldQuery}${QUERY_FLAG_CLOSE}
- [[Note 1]]
- [[Note 2]]
${SERIALIZED_QUERY_END}

Some content after
`

            const replacement = `${QUERY_FLAG_OPEN}${newQuery}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${newQuery}${QUERY_FLAG_CLOSE}
- [[Note 3]]

${SERIALIZED_QUERY_END}
`

            const regex = buildFixedQueryToSerializeRegex(newQuery)
            const result = fileContent.replace(regex, replacement)

            // Verify no orphaned blocks
            expect(result.split(SERIALIZED_QUERY_START).length).toBe(2)
            expect(result.split(SERIALIZED_QUERY_END).length).toBe(2)
            // Verify old content is gone
            expect(result).not.toContain('[[Note 1]]')
            expect(result).not.toContain('[[Note 2]]')
            // Verify new content is present
            expect(result).toContain('[[Note 3]]')
            // Verify surrounding content preserved
            expect(result).toContain('Some content before')
            expect(result).toContain('Some content after')
        })

        it('should still correctly distinguish between different queries in same file', () => {
            const query1 = 'LIST FROM #project'
            const query2 = 'LIST FROM #done'

            // File with two different queries, each with serialized blocks
            const fileContent = `${QUERY_FLAG_OPEN}${query1}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${query1}${QUERY_FLAG_CLOSE}
- [[Project 1]]
${SERIALIZED_QUERY_END}

${QUERY_FLAG_OPEN}${query2}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${query2}${QUERY_FLAG_CLOSE}
- [[Done 1]]
${SERIALIZED_QUERY_END}
`

            const regex1 = buildFixedQueryToSerializeRegex(query1)
            const regex2 = buildFixedQueryToSerializeRegex(query2)

            // Each regex should match only its own query
            const matches1 = fileContent.match(regex1)
            const matches2 = fileContent.match(regex2)

            expect(matches1).toHaveLength(1)
            expect(matches2).toHaveLength(1)
            expect(matches1?.[0]).toContain('[[Project 1]]')
            expect(matches1?.[0]).not.toContain('[[Done 1]]')
            expect(matches2?.[0]).toContain('[[Done 1]]')
            expect(matches2?.[0]).not.toContain('[[Project 1]]')
        })

        it('should handle query modification when multiple queries exist', () => {
            // Query 1 unchanged, Query 2 modified
            const query1 = 'LIST FROM #unchanged'
            const oldQuery2 = 'LIST FROM #modified version1'
            const newQuery2 = 'LIST FROM #modified version2'

            const fileContent = `${QUERY_FLAG_OPEN}${query1}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${query1}${QUERY_FLAG_CLOSE}
- [[Unchanged 1]]
${SERIALIZED_QUERY_END}

${QUERY_FLAG_OPEN}${newQuery2}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${oldQuery2}${QUERY_FLAG_CLOSE}
- [[Modified Old]]
${SERIALIZED_QUERY_END}
`

            // Only replace the modified query
            const replacement2 = `${QUERY_FLAG_OPEN}${newQuery2}${QUERY_FLAG_CLOSE}
${SERIALIZED_QUERY_START}${newQuery2}${QUERY_FLAG_CLOSE}
- [[Modified New]]
${SERIALIZED_QUERY_END}
`

            const regex2 = buildFixedQueryToSerializeRegex(newQuery2)
            const result = fileContent.replace(regex2, replacement2)

            // Query 1 should be unchanged
            expect(result).toContain(`${QUERY_FLAG_OPEN}${query1}`)
            expect(result).toContain(`${SERIALIZED_QUERY_START}${query1}`)
            expect(result).toContain('[[Unchanged 1]]')
            // Query 2 should be updated
            expect(result).toContain(`${QUERY_FLAG_OPEN}${newQuery2}`)
            expect(result).toContain(`${SERIALIZED_QUERY_START}${newQuery2}`)
            expect(result).toContain('[[Modified New]]')
            expect(result).not.toContain('[[Modified Old]]')
            // Should have exactly 2 serialized blocks
            expect(result.split(SERIALIZED_QUERY_START).length).toBe(3) // 2 occurrences = 3 parts
        })
    })
})
