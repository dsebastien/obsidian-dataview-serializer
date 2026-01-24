import { describe, expect, it } from 'bun:test'
import { findQueries } from './find-queries.fn'
import {
    QUERY_FLAG_OPEN,
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN
} from '../constants'

describe('findQueries', () => {
    const makeQuery = (query: string) => `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`
    const makeManualQuery = (query: string) =>
        `${QUERY_FLAG_MANUAL_OPEN}${query}${QUERY_FLAG_CLOSE}`
    const makeOnceQuery = (query: string) => `${QUERY_FLAG_ONCE_OPEN}${query}${QUERY_FLAG_CLOSE}`
    const makeOnceAndEjectQuery = (query: string) =>
        `${QUERY_FLAG_ONCE_AND_EJECT_OPEN}${query}${QUERY_FLAG_CLOSE}`

    describe('basic query detection', () => {
        it('should find a single list query', () => {
            const text = makeQuery('list from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('list from "folder"')
            expect(result[0]!.indentation).toBe('')
        })

        it('should find a single table query', () => {
            const text = makeQuery('table file.name, date')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('table file.name, date')
            expect(result[0]!.indentation).toBe('')
        })

        it('should find multiple queries', () => {
            const text = `${makeQuery('list from "folder1"')}\n${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result[0]!.query).toBe('list from "folder1"')
            expect(result[1]!.query).toBe('table file.name')
        })
    })

    describe('update mode detection', () => {
        it('should detect auto update mode for standard queries', () => {
            const text = makeQuery('list from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.updateMode).toBe('auto')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN)
        })

        it('should detect manual update mode for manual queries', () => {
            const text = makeManualQuery('list from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.updateMode).toBe('manual')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_MANUAL_OPEN)
        })

        it('should detect once update mode for once queries', () => {
            const text = makeOnceQuery('list from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.updateMode).toBe('once')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_ONCE_OPEN)
        })

        it('should detect once-and-eject update mode for once-and-eject queries', () => {
            const text = makeOnceAndEjectQuery('list from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.updateMode).toBe('once-and-eject')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_ONCE_AND_EJECT_OPEN)
        })

        it('should handle mixed query types in the same file', () => {
            const text = `${makeQuery('list from "auto"')}\n${makeManualQuery('list from "manual"')}\n${makeOnceQuery('list from "once"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(3)
            expect(result[0]!.updateMode).toBe('auto')
            expect(result[0]!.query).toBe('list from "auto"')
            expect(result[1]!.updateMode).toBe('manual')
            expect(result[1]!.query).toBe('list from "manual"')
            expect(result[2]!.updateMode).toBe('once')
            expect(result[2]!.query).toBe('list from "once"')
        })

        it('should handle all four query types in the same file', () => {
            const text = `${makeQuery('list from "auto"')}\n${makeManualQuery('list from "manual"')}\n${makeOnceQuery('list from "once"')}\n${makeOnceAndEjectQuery('list from "eject"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(4)
            expect(result[0]!.updateMode).toBe('auto')
            expect(result[0]!.query).toBe('list from "auto"')
            expect(result[1]!.updateMode).toBe('manual')
            expect(result[1]!.query).toBe('list from "manual"')
            expect(result[2]!.updateMode).toBe('once')
            expect(result[2]!.query).toBe('list from "once"')
            expect(result[3]!.updateMode).toBe('once-and-eject')
            expect(result[3]!.query).toBe('list from "eject"')
        })
    })

    describe('indentation handling', () => {
        it('should capture space indentation', () => {
            const text = `    ${makeQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('    ')
        })

        it('should capture tab indentation', () => {
            const text = `\t\t${makeQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('\t\t')
        })

        it('should capture mixed indentation', () => {
            const text = `  \t  ${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('  \t  ')
        })

        it('should capture different indentations for multiple queries', () => {
            const text = `${makeQuery('list')}\n    ${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result[0]!.indentation).toBe('')
            expect(result[1]!.indentation).toBe('    ')
        })

        it('should capture indentation for manual queries', () => {
            const text = `    ${makeManualQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('    ')
            expect(result[0]!.updateMode).toBe('manual')
        })

        it('should capture indentation for once queries', () => {
            const text = `\t${makeOnceQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('\t')
            expect(result[0]!.updateMode).toBe('once')
        })

        it('should capture different indentations for all query types', () => {
            const text = `${makeQuery('list')}\n  ${makeManualQuery('table file.name')}\n    ${makeOnceQuery('list from "once"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(3)
            expect(result[0]!.indentation).toBe('')
            expect(result[0]!.updateMode).toBe('auto')
            expect(result[1]!.indentation).toBe('  ')
            expect(result[1]!.updateMode).toBe('manual')
            expect(result[2]!.indentation).toBe('    ')
            expect(result[2]!.updateMode).toBe('once')
        })

        it('should capture indentation for once-and-eject queries', () => {
            const text = `\t\t${makeOnceAndEjectQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('\t\t')
            expect(result[0]!.updateMode).toBe('once-and-eject')
        })
    })

    describe('duplicate handling', () => {
        it('should ignore duplicate queries', () => {
            const text = `${makeQuery('list from "folder"')}\n${makeQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('list from "folder"')
        })

        it('should keep queries that differ only by whitespace in content', () => {
            const text = `${makeQuery('list from "a"')}\n${makeQuery('list from "b"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
        })

        it('should ignore duplicates even with different update modes', () => {
            const text = `${makeQuery('list from "folder"')}\n${makeManualQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            // First one wins
            expect(result[0]!.updateMode).toBe('auto')
        })
    })

    describe('supported query types - task', () => {
        it('should find task queries', () => {
            const text = makeQuery('task from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('task from "folder"')
        })

        it('should find task queries with WHERE clause', () => {
            const text = makeQuery('TASK WHERE !completed')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TASK WHERE !completed')
        })

        it('should find manual task queries', () => {
            const text = makeManualQuery('task from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('task from "folder"')
            expect(result[0]!.updateMode).toBe('manual')
        })

        it('should find once task queries', () => {
            const text = makeOnceQuery('task WHERE completed')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('task WHERE completed')
            expect(result[0]!.updateMode).toBe('once')
        })

        it('should find once-and-eject task queries', () => {
            const text = makeOnceAndEjectQuery('task from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('task from "folder"')
            expect(result[0]!.updateMode).toBe('once-and-eject')
        })
    })

    describe('unsupported query types', () => {
        it('should ignore calendar queries', () => {
            const text = makeQuery('calendar from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should only include supported queries from mixed input', () => {
            const text = `${makeQuery('list')}\n${makeQuery('calendar')}\n${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result.map((r) => r.query)).toEqual(['list', 'table file.name'])
        })

        it('should ignore unsupported query types for manual queries', () => {
            const text = makeManualQuery('calendar from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should ignore unsupported query types for once queries', () => {
            const text = makeOnceQuery('calendar from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should ignore unsupported query types for once-and-eject queries', () => {
            const text = makeOnceAndEjectQuery('calendar from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })
    })

    describe('edge cases', () => {
        it('should return empty array for empty string', () => {
            const result = findQueries('')
            expect(result).toEqual([])
        })

        it('should return empty array for text without queries', () => {
            const result = findQueries('This is just regular markdown text')
            expect(result).toEqual([])
        })

        it('should return empty array for incomplete query flags', () => {
            const result = findQueries(`${QUERY_FLAG_OPEN}list from "folder"`)
            expect(result).toEqual([])
        })

        it('should handle query with extra whitespace', () => {
            const text = makeQuery('  list from "folder"  ')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('list from "folder"')
        })

        it('should handle queries with content before the flag', () => {
            const text = `Some text before ${makeQuery('list')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('Some text before ')
        })

        it('should return empty array for incomplete manual query flags', () => {
            const result = findQueries(`${QUERY_FLAG_MANUAL_OPEN}list from "folder"`)
            expect(result).toEqual([])
        })

        it('should return empty array for incomplete once query flags', () => {
            const result = findQueries(`${QUERY_FLAG_ONCE_OPEN}list from "folder"`)
            expect(result).toEqual([])
        })

        it('should return empty array for incomplete once-and-eject query flags', () => {
            const result = findQueries(`${QUERY_FLAG_ONCE_AND_EJECT_OPEN}list from "folder"`)
            expect(result).toEqual([])
        })
    })

    describe('multi-line query support', () => {
        it('should find a basic multi-line query', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE
  file.name AS "Name",
  file.mtime AS "Modified"
FROM "folder"
SORT file.mtime DESC
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe(
                'TABLE file.name AS "Name", file.mtime AS "Modified" FROM "folder" SORT file.mtime DESC'
            )
            expect(result[0]!.updateMode).toBe('auto')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN)
        })

        it('should preserve originalQueryDefinition for multi-line queries', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.originalQueryDefinition).toBeDefined()
            expect(result[0]!.originalQueryDefinition).toContain('TABLE file.name')
            expect(result[0]!.originalQueryDefinition).toContain('FROM "folder"')
        })

        it('should not set originalQueryDefinition for single-line queries', () => {
            const text = makeQuery('LIST FROM "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.originalQueryDefinition).toBeUndefined()
        })

        it('should handle multi-line manual query', () => {
            const text = `${QUERY_FLAG_MANUAL_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name FROM "folder"')
            expect(result[0]!.updateMode).toBe('manual')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_MANUAL_OPEN)
        })

        it('should handle multi-line once query', () => {
            const text = `${QUERY_FLAG_ONCE_OPEN}
LIST FROM "folder"
WHERE status = "done"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('LIST FROM "folder" WHERE status = "done"')
            expect(result[0]!.updateMode).toBe('once')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_ONCE_OPEN)
        })

        it('should handle multi-line once-and-eject query', () => {
            const text = `${QUERY_FLAG_ONCE_AND_EJECT_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name FROM "folder"')
            expect(result[0]!.updateMode).toBe('once-and-eject')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_ONCE_AND_EJECT_OPEN)
        })

        it('should capture indentation for multi-line queries', () => {
            const text = `    ${QUERY_FLAG_OPEN}
    TABLE file.name
    FROM "folder"
    ${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.indentation).toBe('    ')
        })

        it('should handle mixed single-line and multi-line queries', () => {
            const singleLine = makeQuery('LIST FROM "single"')
            const multiLine = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "multi"
${QUERY_FLAG_CLOSE}`
            const text = `${singleLine}\n${multiLine}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result[0]!.query).toBe('LIST FROM "single"')
            expect(result[0]!.originalQueryDefinition).toBeUndefined()
            expect(result[1]!.query).toBe('TABLE file.name FROM "multi"')
            expect(result[1]!.originalQueryDefinition).toBeDefined()
        })

        it('should normalize whitespace in multi-line queries', () => {
            const text = `${QUERY_FLAG_OPEN}
  TABLE
    file.name     AS    "Name"
  FROM     "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            // Multiple spaces should be normalized to single spaces
            expect(result[0]!.query).toBe('TABLE file.name AS "Name" FROM "folder"')
        })

        it('should handle empty lines within multi-line queries', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE file.name

FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name FROM "folder"')
        })

        it('should handle complex TABLE query with multiple columns', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE
  dateformat(release-date, "yyyy-MM-dd") AS "Release Date",
  rating,
  status
FROM "Games"
WHERE rating > 7
SORT finished-date DESC
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe(
                'TABLE dateformat(release-date, "yyyy-MM-dd") AS "Release Date", rating, status FROM "Games" WHERE rating > 7 SORT finished-date DESC'
            )
        })

        it('should ignore incomplete multi-line queries (no closing flag)', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"`
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should handle closing flag on same line as content', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder" ${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name FROM "folder"')
        })

        it('should deduplicate multi-line queries with same content', () => {
            const multiLine1 = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const multiLine2 = `${QUERY_FLAG_OPEN}
TABLE file.name FROM "folder"
${QUERY_FLAG_CLOSE}`
            const text = `${multiLine1}\n${multiLine2}`
            const result = findQueries(text)
            // Both normalize to the same query, so only first one is kept
            expect(result).toHaveLength(1)
        })

        it('should deduplicate multi-line and single-line with same content', () => {
            const singleLine = makeQuery('TABLE file.name FROM "folder"')
            const multiLine = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const text = `${singleLine}\n${multiLine}`
            const result = findQueries(text)
            // Single-line comes first, so it wins
            expect(result).toHaveLength(1)
            expect(result[0]!.originalQueryDefinition).toBeUndefined()
        })

        it('should find task queries in multi-line format', () => {
            const text = `${QUERY_FLAG_OPEN}
TASK
WHERE !completed
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TASK WHERE !completed FROM "folder"')
        })

        it('should ignore unsupported query types in multi-line format', () => {
            const text = `${QUERY_FLAG_OPEN}
CALENDAR
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should handle query starting on opening flag line', () => {
            const text = `${QUERY_FLAG_OPEN}TABLE
  file.name AS "Name"
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name AS "Name" FROM "folder"')
        })
    })

    describe('trimmed flag handling', () => {
        it('should detect single-line query with trimmed opening flag (no trailing space)', () => {
            // Flag without trailing space: "<!-- QueryToSerialize:" instead of "<!-- QueryToSerialize: "
            const text = `${QUERY_FLAG_OPEN.trim()}LIST FROM "folder"${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('LIST FROM "folder"')
            // The flagOpen should match what's actually in the text for correct regex replacement
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN.trim())
            expect(result[0]!.flagClose).toBe(QUERY_FLAG_CLOSE)
        })

        it('should detect single-line query with trimmed closing flag (no leading space)', () => {
            // Flag without leading space: "-->" instead of " -->"
            const text = `${QUERY_FLAG_OPEN}LIST FROM "folder"${QUERY_FLAG_CLOSE.trim()}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('LIST FROM "folder"')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN)
            expect(result[0]!.flagClose).toBe(QUERY_FLAG_CLOSE.trim())
        })

        it('should detect query with both flags trimmed', () => {
            const text = `${QUERY_FLAG_OPEN.trim()}LIST FROM "folder"${QUERY_FLAG_CLOSE.trim()}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('LIST FROM "folder"')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN.trim())
            expect(result[0]!.flagClose).toBe(QUERY_FLAG_CLOSE.trim())
        })

        it('should detect multi-line query with trimmed opening flag', () => {
            const text = `${QUERY_FLAG_OPEN.trim()}
TABLE file.name
FROM "folder"
${QUERY_FLAG_CLOSE}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name FROM "folder"')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN.trim())
            expect(result[0]!.flagClose).toBe(QUERY_FLAG_CLOSE)
        })

        it('should detect multi-line query with trimmed closing flag', () => {
            const text = `${QUERY_FLAG_OPEN}
TABLE file.name
FROM "folder"${QUERY_FLAG_CLOSE.trim()}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0]!.query).toBe('TABLE file.name FROM "folder"')
            expect(result[0]!.flagOpen).toBe(QUERY_FLAG_OPEN)
            expect(result[0]!.flagClose).toBe(QUERY_FLAG_CLOSE.trim())
        })
    })
})
