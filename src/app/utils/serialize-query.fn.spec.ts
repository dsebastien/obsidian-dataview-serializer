import { describe, expect, it, mock, beforeAll } from 'bun:test'
import { serializeQuery } from './serialize-query.fn'
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import type { App, TFile } from 'obsidian'

// Polyfill for Obsidian's String.contains() method
declare global {
    interface String {
        contains(searchString: string): boolean
    }
}

beforeAll(() => {
    if (!String.prototype.contains) {
        String.prototype.contains = function (searchString: string): boolean {
            return this.includes(searchString)
        }
    }
})

describe('serializeQuery', () => {
    const createMockApp = (files: Partial<TFile>[]): App =>
        ({
            vault: {
                getFiles: () => files as TFile[]
            }
        }) as App

    const createMockDataviewApi = (markdownResult: string): DataviewApi =>
        ({
            tryQueryMarkdown: mock(() => Promise.resolve(markdownResult))
        }) as unknown as DataviewApi

    describe('basic query execution', () => {
        it('should call dataviewApi.tryQueryMarkdown with the query and origin file', async () => {
            const mockApp = createMockApp([])
            const tryQueryMarkdownMock = mock(() => Promise.resolve('result'))
            const mockApi = {
                tryQueryMarkdown: tryQueryMarkdownMock
            } as unknown as DataviewApi

            await serializeQuery({
                query: 'list from "folder"',
                originFile: 'my-note.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(tryQueryMarkdownMock).toHaveBeenCalledTimes(1)
            expect(tryQueryMarkdownMock).toHaveBeenCalledWith('list from "folder"', 'my-note.md')
        })

        it('should return the query result', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- Item 1\n- Item 2')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result).toContain('- Item 1')
            expect(result).toContain('- Item 2')
        })
    })

    describe('list queries', () => {
        it('should simplify links for unique file names', async () => {
            const mockApp = createMockApp([{ name: 'unique-note.md' }])
            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            // Should remove the path for unique files
            expect(result).toBe('- [[unique-note]]\n')
        })

        it('should keep full path for non-unique file names', async () => {
            const mockApp = createMockApp([{ name: 'note.md' }, { name: 'note.md' }])
            const mockApi = createMockDataviewApi('- [[folder/note.md|note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            // Should keep the full path for non-unique files
            expect(result).toBe('- [[folder/note.md|note]]\n')
        })
    })

    describe('table queries', () => {
        it('should handle table query content', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('| File | Date |\n| --- | --- |\n| Note | 2024 |')

            const result = await serializeQuery({
                query: 'table file.name, date',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result).toContain('| File | Date |')
            expect(result).toContain('| Note | 2024 |')
        })

        it('should replace double backslashes with single backslashes', async () => {
            const mockApp = createMockApp([])
            // Dataview outputs double backslashes in table markdown
            const mockApi = createMockDataviewApi('| File |\\\\| Value |')

            const result = await serializeQuery({
                query: 'table',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            // Should have single backslash after processing
            expect(result).toBe('| File |\\| Value |')
        })
    })

    describe('indentation', () => {
        it('should apply space indentation to all lines', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- item1\n- item2\n- item3')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                indentation: '    '
            })

            expect(result).toBe('    - item1\n    - item2\n    - item3')
        })

        it('should apply tab indentation', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- item1\n- item2')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                indentation: '\t'
            })

            expect(result).toBe('\t- item1\n\t- item2')
        })

        it('should apply mixed indentation', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('line1\nline2')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                indentation: '  \t'
            })

            expect(result).toBe('  \tline1\n  \tline2')
        })

        it('should not modify output when indentation is not provided', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- item1\n- item2')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result).toBe('- item1\n- item2')
        })

        it('should not modify output when indentation is empty string', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- item1\n- item2')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                indentation: ''
            })

            expect(result).toBe('- item1\n- item2')
        })
    })

    describe('error handling', () => {
        it('should return empty string on query error', async () => {
            const mockApp = createMockApp([])
            const mockApi = {
                tryQueryMarkdown: mock(() => Promise.reject(new Error('Query failed')))
            } as unknown as DataviewApi

            const result = await serializeQuery({
                query: 'invalid query',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result).toBe('')
        })

        it('should handle empty query result', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result).toBe('')
        })
    })
})
