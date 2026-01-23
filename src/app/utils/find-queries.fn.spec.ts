import { describe, expect, it } from 'bun:test'
import { findQueries, QueryWithContext } from './find-queries.fn'
import { QUERY_FLAG_OPEN, QUERY_FLAG_CLOSE } from '../constants'

describe('findQueries', () => {
    const makeQuery = (query: string) => `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`

    describe('basic query detection', () => {
        it('should find a single list query', () => {
            const text = makeQuery('list from "folder"')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].query).toBe('list from "folder"')
            expect(result[0].indentation).toBe('')
        })

        it('should find a single table query', () => {
            const text = makeQuery('table file.name, date')
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].query).toBe('table file.name, date')
            expect(result[0].indentation).toBe('')
        })

        it('should find multiple queries', () => {
            const text = `${makeQuery('list from "folder1"')}\n${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result[0].query).toBe('list from "folder1"')
            expect(result[1].query).toBe('table file.name')
        })
    })

    describe('indentation handling', () => {
        it('should capture space indentation', () => {
            const text = `    ${makeQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].indentation).toBe('    ')
        })

        it('should capture tab indentation', () => {
            const text = `\t\t${makeQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].indentation).toBe('\t\t')
        })

        it('should capture mixed indentation', () => {
            const text = `  \t  ${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].indentation).toBe('  \t  ')
        })

        it('should capture different indentations for multiple queries', () => {
            const text = `${makeQuery('list')}\n    ${makeQuery('table file.name')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
            expect(result[0].indentation).toBe('')
            expect(result[1].indentation).toBe('    ')
        })
    })

    describe('duplicate handling', () => {
        it('should ignore duplicate queries', () => {
            const text = `${makeQuery('list from "folder"')}\n${makeQuery('list from "folder"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].query).toBe('list from "folder"')
        })

        it('should keep queries that differ only by whitespace in content', () => {
            const text = `${makeQuery('list from "a"')}\n${makeQuery('list from "b"')}`
            const result = findQueries(text)
            expect(result).toHaveLength(2)
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
            expect(result[0].query).toBe('list from "folder"')
        })

        it('should handle queries with content before the flag', () => {
            const text = `Some text before ${makeQuery('list')}`
            const result = findQueries(text)
            expect(result).toHaveLength(1)
            expect(result[0].indentation).toBe('Some text before ')
        })
    })
})
