import { describe, expect, it } from 'bun:test'
import { isTableQuery } from './is-table-query.fn'

describe('isTableQuery', () => {
    describe('table queries', () => {
        it('should return true for simple table query', () => {
            expect(isTableQuery('table')).toBe(true)
        })

        it('should return true for table query with fields', () => {
            expect(isTableQuery('table file.name, date, status')).toBe(true)
        })

        it('should return true for table query with FROM clause', () => {
            expect(isTableQuery('table file.name FROM "folder"')).toBe(true)
        })

        it('should return true for TABLE WITHOUT ID', () => {
            expect(isTableQuery('table without id file.name')).toBe(true)
        })

        it('should be case insensitive', () => {
            expect(isTableQuery('TABLE')).toBe(true)
            expect(isTableQuery('Table')).toBe(true)
            expect(isTableQuery('TABLE file.name')).toBe(true)
            expect(isTableQuery('TaBlE')).toBe(true)
        })
    })

    describe('non-table queries', () => {
        it('should return false for list queries', () => {
            expect(isTableQuery('list')).toBe(false)
            expect(isTableQuery('LIST')).toBe(false)
            expect(isTableQuery('list from "folder"')).toBe(false)
        })

        it('should return false for task queries', () => {
            expect(isTableQuery('task')).toBe(false)
            expect(isTableQuery('TASK')).toBe(false)
        })

        it('should return false for calendar queries', () => {
            expect(isTableQuery('calendar')).toBe(false)
            expect(isTableQuery('CALENDAR')).toBe(false)
        })

        it('should return false for empty string', () => {
            expect(isTableQuery('')).toBe(false)
        })

        it('should return false for queries containing but not starting with table', () => {
            expect(isTableQuery('my table query')).toBe(false)
            expect(isTableQuery(' table')).toBe(false)
            expect(isTableQuery('create table')).toBe(false)
        })
    })
})
