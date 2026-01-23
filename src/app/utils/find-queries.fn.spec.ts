import { describe, expect, it } from 'bun:test'
import { findQueries } from './find-queries.fn'
import {
    QUERY_FLAG_OPEN,
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_OPEN
} from '../constants'

describe('findQueries', () => {
    const makeQuery = (query: string) => `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`
    const makeManualQuery = (query: string) =>
        `${QUERY_FLAG_MANUAL_OPEN}${query}${QUERY_FLAG_CLOSE}`
    const makeOnceQuery = (query: string) => `${QUERY_FLAG_ONCE_OPEN}${query}${QUERY_FLAG_CLOSE}`

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

    describe('unsupported query types', () => {
        it('should ignore task queries', () => {
            const text = makeQuery('task from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should ignore calendar queries', () => {
            const text = makeQuery('calendar from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should only include supported queries from mixed input', () => {
            const text = `${makeQuery('list')}\n${makeQuery('task')}\n${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result.map((r) => r.query)).toEqual(['list', 'table file.name'])
        })

        it('should ignore unsupported query types for manual queries', () => {
            const text = makeManualQuery('task from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(0)
        })

        it('should ignore unsupported query types for once queries', () => {
            const text = makeOnceQuery('calendar from "folder"')
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
    })
})
