import { describe, expect, it } from 'bun:test'
import { isTaskQuery } from './is-task-query.fn'

describe('isTaskQuery', () => {
    describe('should return true for task queries', () => {
        it('should return true for lowercase task', () => {
            expect(isTaskQuery('task')).toBe(true)
        })

        it('should return true for uppercase TASK', () => {
            expect(isTaskQuery('TASK')).toBe(true)
        })

        it('should return true for mixed case Task', () => {
            expect(isTaskQuery('Task')).toBe(true)
        })

        it('should return true for task with WHERE clause', () => {
            expect(isTaskQuery('task WHERE !completed')).toBe(true)
            expect(isTaskQuery('TASK WHERE completed')).toBe(true)
        })

        it('should return true for task with FROM clause', () => {
            expect(isTaskQuery('task from "folder"')).toBe(true)
            expect(isTaskQuery('TASK FROM #tag')).toBe(true)
        })

        it('should return true for task with leading whitespace', () => {
            expect(isTaskQuery('  task')).toBe(true)
            expect(isTaskQuery('\ttask')).toBe(true)
        })
    })

    describe('should return false for non-task queries', () => {
        it('should return false for list queries', () => {
            expect(isTaskQuery('list')).toBe(false)
            expect(isTaskQuery('LIST')).toBe(false)
        })

        it('should return false for table queries', () => {
            expect(isTaskQuery('table')).toBe(false)
            expect(isTaskQuery('TABLE')).toBe(false)
        })

        it('should return false for calendar queries', () => {
            expect(isTaskQuery('calendar')).toBe(false)
            expect(isTaskQuery('CALENDAR')).toBe(false)
        })

        it('should return false for empty string', () => {
            expect(isTaskQuery('')).toBe(false)
        })

        it('should return false for queries containing but not starting with task', () => {
            expect(isTaskQuery('my task query')).toBe(false)
            expect(isTaskQuery('list of tasks')).toBe(false)
            expect(isTaskQuery(' a task')).toBe(false)
        })
    })
})
