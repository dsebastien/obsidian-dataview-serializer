import { describe, expect, it } from 'bun:test'
import { isSupportedQueryType } from './is-supported-query-type.fn'

describe('isSupportedQueryType', () => {
    describe('supported query types', () => {
        it('should return true for list queries', () => {
            expect(isSupportedQueryType('list')).toBe(true)
            expect(isSupportedQueryType('LIST')).toBe(true)
            expect(isSupportedQueryType('List')).toBe(true)
            expect(isSupportedQueryType('list from "folder"')).toBe(true)
            expect(isSupportedQueryType('LIST FROM #tag')).toBe(true)
        })

        it('should return true for table queries', () => {
            expect(isSupportedQueryType('table')).toBe(true)
            expect(isSupportedQueryType('TABLE')).toBe(true)
            expect(isSupportedQueryType('Table')).toBe(true)
            expect(isSupportedQueryType('table file.name, date')).toBe(true)
            expect(isSupportedQueryType('TABLE WITHOUT ID file.name')).toBe(true)
        })

        it('should return true for task queries', () => {
            expect(isSupportedQueryType('task')).toBe(true)
            expect(isSupportedQueryType('TASK')).toBe(true)
            expect(isSupportedQueryType('Task')).toBe(true)
            expect(isSupportedQueryType('task from "folder"')).toBe(true)
            expect(isSupportedQueryType('TASK WHERE !completed')).toBe(true)
        })
    })

    describe('unsupported query types', () => {
        it('should return false for calendar queries', () => {
            expect(isSupportedQueryType('calendar')).toBe(false)
            expect(isSupportedQueryType('CALENDAR')).toBe(false)
        })

        it('should return false for unknown query types', () => {
            expect(isSupportedQueryType('unknown')).toBe(false)
            expect(isSupportedQueryType('dataview')).toBe(false)
            expect(isSupportedQueryType('query')).toBe(false)
        })

        it('should return false for empty string', () => {
            expect(isSupportedQueryType('')).toBe(false)
        })

        it('should return false for queries that contain but do not start with supported types', () => {
            expect(isSupportedQueryType('my list query')).toBe(false)
            expect(isSupportedQueryType('a table')).toBe(false)
            expect(isSupportedQueryType(' list')).toBe(false)
            expect(isSupportedQueryType(' table')).toBe(false)
        })
    })
})
