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

        it('should return success true and the query result', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- Item 1\n- Item 2')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toContain('- Item 1')
            expect(result.serializedContent).toContain('- Item 2')
            expect(result.error).toBeUndefined()
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
            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[unique-note]]\n')
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
            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[folder/note.md|note]]\n')
        })
    })

    describe('linkFormat setting', () => {
        it('should simplify links when linkFormat is "shortest" (default)', async () => {
            const mockApp = createMockApp([{ name: 'unique-note.md' }])
            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'shortest'
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[unique-note]]\n')
        })

        it('should keep full path when linkFormat is "absolute" even for unique files', async () => {
            const mockApp = createMockApp([{ name: 'unique-note.md' }])
            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'absolute'
            })

            // Should keep full path even though file is unique
            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[folder/unique-note.md|unique-note]]\n')
        })

        it('should keep full path in table queries when linkFormat is "absolute"', async () => {
            const mockApp = createMockApp([{ name: 'unique-note.md' }])
            const mockApi = createMockDataviewApi(
                '| File |\n| --- |\n| [[folder/unique-note.md\\|unique-note]] |'
            )

            const result = await serializeQuery({
                query: 'table file.name',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'absolute'
            })

            // Should keep full path in table queries (pipe remains escaped in tables)
            expect(result.success).toBe(true)
            expect(result.serializedContent).toContain('folder/unique-note.md')
            expect(result.serializedContent).toContain('unique-note')
        })

        it('should default to "shortest" when linkFormat is not provided', async () => {
            const mockApp = createMockApp([{ name: 'unique-note.md' }])
            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
                // linkFormat not provided
            })

            // Should simplify by default
            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[unique-note]]\n')
        })

        it('should use shortest when linkFormat is "obsidian" and Obsidian setting is "shortest"', async () => {
            const mockApp = {
                vault: {
                    getFiles: () => [{ name: 'unique-note.md' }] as TFile[],
                    config: { newLinkFormat: 'shortest' }
                }
            } as unknown as App

            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'obsidian'
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[unique-note]]\n')
        })

        it('should use absolute when linkFormat is "obsidian" and Obsidian setting is "absolute"', async () => {
            const mockApp = {
                vault: {
                    getFiles: () => [{ name: 'unique-note.md' }] as TFile[],
                    config: { newLinkFormat: 'absolute' }
                }
            } as unknown as App

            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'obsidian'
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[folder/unique-note.md|unique-note]]\n')
        })

        it('should use absolute when linkFormat is "obsidian" and Obsidian setting is "relative"', async () => {
            const mockApp = {
                vault: {
                    getFiles: () => [{ name: 'unique-note.md' }] as TFile[],
                    config: { newLinkFormat: 'relative' }
                }
            } as unknown as App

            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'obsidian'
            })

            // Relative maps to absolute for consistency
            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[folder/unique-note.md|unique-note]]\n')
        })

        it('should default to shortest when linkFormat is "obsidian" and Obsidian config is missing', async () => {
            const mockApp = {
                vault: {
                    getFiles: () => [{ name: 'unique-note.md' }] as TFile[],
                    config: {}
                }
            } as unknown as App

            const mockApi = createMockDataviewApi('- [[folder/unique-note.md|unique-note]]\n')

            const result = await serializeQuery({
                query: 'list',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'obsidian'
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- [[unique-note]]\n')
        })
    })

    describe('task queries', () => {
        it('should strip checkbox markers from task output', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('- [ ] Incomplete task\n- [x] Completed task')

            const result = await serializeQuery({
                query: 'task',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            // Checkboxes should be stripped, converting tasks to regular list items
            expect(result.serializedContent).toBe('- Incomplete task\n- Completed task')
            expect(result.serializedContent).not.toContain('[ ]')
            expect(result.serializedContent).not.toContain('[x]')
        })

        it('should strip various checkbox states', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi(
                '- [ ] Unchecked\n- [x] Checked\n- [X] Checked uppercase\n- [/] Partial\n- [-] Cancelled'
            )

            const result = await serializeQuery({
                query: 'task',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe(
                '- Unchecked\n- Checked\n- Checked uppercase\n- Partial\n- Cancelled'
            )
        })

        it('should simplify links in task output for unique file names', async () => {
            const mockApp = createMockApp([{ name: 'project.md' }])
            const mockApi = createMockDataviewApi('- [ ] Task from [[folder/project.md|project]]\n')

            const result = await serializeQuery({
                query: 'task WHERE !completed',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            // Checkbox stripped and link simplified
            expect(result.serializedContent).toBe('- Task from [[project]]\n')
        })

        it('should keep full path in task output for non-unique file names', async () => {
            const mockApp = createMockApp([{ name: 'todo.md' }, { name: 'todo.md' }])
            const mockApi = createMockDataviewApi('- [ ] Task from [[folder/todo.md|todo]]\n')

            const result = await serializeQuery({
                query: 'task',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            // Checkbox stripped but path kept for non-unique files
            expect(result.serializedContent).toBe('- Task from [[folder/todo.md|todo]]\n')
        })

        it('should respect linkFormat "absolute" for task queries', async () => {
            const mockApp = createMockApp([{ name: 'unique-task.md' }])
            const mockApi = createMockDataviewApi(
                '- [x] Done task from [[folder/unique-task.md|unique-task]]\n'
            )

            const result = await serializeQuery({
                query: 'task WHERE completed',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp,
                linkFormat: 'absolute'
            })

            expect(result.success).toBe(true)
            // Checkbox stripped but full path kept due to absolute format
            expect(result.serializedContent).toBe(
                '- Done task from [[folder/unique-task.md|unique-task]]\n'
            )
        })

        it('should preserve indented tasks', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi(
                '- [ ] Parent task\n  - [ ] Child task\n    - [x] Grandchild task'
            )

            const result = await serializeQuery({
                query: 'task',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe(
                '- Parent task\n  - Child task\n    - Grandchild task'
            )
        })

        it('should handle empty task output', async () => {
            const mockApp = createMockApp([])
            const mockApi = createMockDataviewApi('')

            const result = await serializeQuery({
                query: 'task WHERE false',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toContain('| File | Date |')
            expect(result.serializedContent).toContain('| Note | 2024 |')
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
            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('| File |\\| Value |')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('    - item1\n    - item2\n    - item3')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('\t- item1\n\t- item2')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('  \tline1\n  \tline2')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- item1\n- item2')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('- item1\n- item2')
        })
    })

    describe('error handling', () => {
        it('should return success false with error details on query error', async () => {
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

            expect(result.success).toBe(false)
            expect(result.serializedContent).toBe('')
            expect(result.error).toBeDefined()
            expect(result.error?.message).toBe('Query failed')
            expect(result.error?.query).toBe('invalid query')
        })

        it('should handle non-Error exceptions', async () => {
            const mockApp = createMockApp([])
            const mockApi = {
                tryQueryMarkdown: mock(() => Promise.reject('String error'))
            } as unknown as DataviewApi

            const result = await serializeQuery({
                query: 'invalid query',
                originFile: 'origin.md',
                dataviewApi: mockApi,
                app: mockApp
            })

            expect(result.success).toBe(false)
            expect(result.serializedContent).toBe('')
            expect(result.error).toBeDefined()
            expect(result.error?.message).toBe('String error')
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

            expect(result.success).toBe(true)
            expect(result.serializedContent).toBe('')
            expect(result.error).toBeUndefined()
        })
    })
})
