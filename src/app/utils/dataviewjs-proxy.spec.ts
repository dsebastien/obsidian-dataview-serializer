import { describe, expect, test, mock } from 'bun:test'
import { createDataviewJSProxy } from './dataviewjs-proxy'
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'

// Create a mock DataviewApi
function createMockDataviewApi(): DataviewApi {
    return {
        pages: mock(() => []),
        pagePaths: mock(() => []),
        page: mock(() => undefined),
        current: mock(() => undefined),
        array: mock((x: unknown) => x),
        isArray: mock((x: unknown) => Array.isArray(x)),
        date: mock(() => null),
        duration: mock(() => null),
        fileLink: mock(() => ({ path: 'test', embed: false })),
        sectionLink: mock(() => ({ path: 'test', embed: false })),
        blockLink: mock(() => ({ path: 'test', embed: false })),
        compare: mock(() => 0),
        equal: mock(() => true),
        evaluate: mock(() => ({ successful: true, value: '' })),
        query: mock(async () => ({ successful: true, value: { values: [] } })),
        queryMarkdown: mock(async () => ''),
        tryQuery: mock(async () => ({ successful: true, value: { values: [] } })),
        tryQueryMarkdown: mock(async () => ''),
        io: {
            load: mock(async () => ''),
            csv: mock(async () => []),
            normalize: mock(() => '')
        },
        luxon: {},
        func: {},
        value: {},
        widget: {}
    } as unknown as DataviewApi
}

describe('createDataviewJSProxy', () => {
    describe('dv.list()', () => {
        test('should capture list output as markdown', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvList = proxy['list'] as (values: unknown[]) => void
            dvList(['Item 1', 'Item 2', 'Item 3'])

            const markdown = getMarkdown()
            expect(markdown).toBe('- Item 1\n- Item 2\n- Item 3')
        })

        test('should handle empty list', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvList = proxy['list'] as (values: unknown[]) => void
            dvList([])

            const markdown = getMarkdown()
            expect(markdown).toBe('')
        })
    })

    describe('dv.table()', () => {
        test('should capture table output as markdown', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvTable = proxy['table'] as (headers: string[], rows: unknown[][]) => void
            dvTable(
                ['Name', 'Value'],
                [
                    ['Alice', '100'],
                    ['Bob', '200']
                ]
            )

            const markdown = getMarkdown()
            expect(markdown).toContain('| Name | Value |')
            expect(markdown).toContain('| --- | --- |')
            expect(markdown).toContain('| Alice | 100 |')
            expect(markdown).toContain('| Bob | 200 |')
        })

        test('should escape pipe characters in table cells', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvTable = proxy['table'] as (headers: string[], rows: unknown[][]) => void
            dvTable(['Data'], [['value|with|pipes']])

            const markdown = getMarkdown()
            expect(markdown).toContain('value\\|with\\|pipes')
        })
    })

    describe('dv.paragraph()', () => {
        test('should capture paragraph output', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            dvParagraph('This is a paragraph.')

            const markdown = getMarkdown()
            expect(markdown).toBe('This is a paragraph.')
        })
    })

    describe('dv.header()', () => {
        test('should capture header output with correct level', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvHeader = proxy['header'] as (level: number, text: unknown) => void
            dvHeader(2, 'My Header')

            const markdown = getMarkdown()
            expect(markdown).toBe('## My Header')
        })

        test('should limit header level to 6', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvHeader = proxy['header'] as (level: number, text: unknown) => void
            dvHeader(10, 'Deep Header')

            const markdown = getMarkdown()
            expect(markdown).toBe('###### Deep Header')
        })

        test('should ensure header level is at least 1', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvHeader = proxy['header'] as (level: number, text: unknown) => void
            dvHeader(0, 'Top Header')

            const markdown = getMarkdown()
            expect(markdown).toBe('# Top Header')
        })
    })

    describe('dv.span()', () => {
        test('should capture span output', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvSpan = proxy['span'] as (text: unknown) => void
            dvSpan('Inline text')

            const markdown = getMarkdown()
            expect(markdown).toBe('Inline text')
        })
    })

    describe('multiple outputs', () => {
        test('should capture multiple outputs separated by double newlines', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvHeader = proxy['header'] as (level: number, text: unknown) => void
            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            const dvList = proxy['list'] as (values: unknown[]) => void

            dvHeader(1, 'Title')
            dvParagraph('Some description')
            dvList(['Item 1', 'Item 2'])

            const markdown = getMarkdown()
            expect(markdown).toContain('# Title')
            expect(markdown).toContain('Some description')
            expect(markdown).toContain('- Item 1')
            expect(markdown).toContain('- Item 2')
        })
    })

    describe('dv.el()', () => {
        test('should capture paragraph element as text', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEl = proxy['el'] as (tag: string, content?: unknown) => void
            dvEl('p', 'Hello world')

            const markdown = getMarkdown()
            expect(markdown).toBe('Hello world')
        })

        test('should capture header elements with proper markdown', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEl = proxy['el'] as (tag: string, content?: unknown) => void
            dvEl('h2', 'My Section')

            const markdown = getMarkdown()
            expect(markdown).toBe('## My Section')
        })

        test('should capture bold text', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEl = proxy['el'] as (tag: string, content?: unknown) => void
            dvEl('strong', 'Important')

            const markdown = getMarkdown()
            expect(markdown).toBe('**Important**')
        })

        test('should capture code element', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEl = proxy['el'] as (tag: string, content?: unknown) => void
            dvEl('code', 'const x = 1')

            const markdown = getMarkdown()
            expect(markdown).toBe('`const x = 1`')
        })

        test('should capture link with href attribute', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEl = proxy['el'] as (
                tag: string,
                content?: unknown,
                attrs?: { href?: string }
            ) => void
            dvEl('a', 'Click here', { href: 'https://example.com' })

            const markdown = getMarkdown()
            expect(markdown).toBe('[Click here](https://example.com)')
        })

        test('should capture horizontal rule', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEl = proxy['el'] as (tag: string) => void
            dvEl('hr')

            const markdown = getMarkdown()
            expect(markdown).toBe('---')
        })
    })

    describe('dv.execute()', () => {
        test('should capture query output via queryMarkdown', async () => {
            const mockApi = createMockDataviewApi()
            // Mock queryMarkdown to return some markdown
            mockApi.queryMarkdown = async () => '- Item 1\n- Item 2'

            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvExecute = proxy['execute'] as (query: string) => Promise<void>
            await dvExecute('LIST FROM #tag')

            const markdown = getMarkdown()
            expect(markdown).toBe('- Item 1\n- Item 2')
        })

        test('should pass origin file to queryMarkdown', async () => {
            const mockApi = createMockDataviewApi()
            let capturedFile: string | undefined
            mockApi.queryMarkdown = async (_query: string, file?: string) => {
                capturedFile = file
                return ''
            }

            const { proxy } = createDataviewJSProxy(mockApi, 'notes/my-file.md')

            const dvExecute = proxy['execute'] as (query: string) => Promise<void>
            await dvExecute('LIST')

            expect(capturedFile).toBe('notes/my-file.md')
        })
    })

    describe('unsupported methods', () => {
        test('dv.view() should return rejected promise', async () => {
            const mockApi = createMockDataviewApi()
            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvView = proxy['view'] as () => Promise<void>
            await expect(dvView()).rejects.toThrow('dv.view() is not supported')
        })

        test('dv.executeJs() should return rejected promise', async () => {
            const mockApi = createMockDataviewApi()
            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvExecuteJs = proxy['executeJs'] as () => Promise<void>
            await expect(dvExecuteJs()).rejects.toThrow('dv.executeJs() is not supported')
        })
    })

    describe('passthrough methods', () => {
        test('dv.pages() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvPages = proxy['pages'] as (query?: string) => unknown
            dvPages('#project')

            expect(mockApi.pages).toHaveBeenCalledWith('#project', 'test.md')
        })

        test('dv.current() should call dv.page with origin file', () => {
            const mockApi = createMockDataviewApi()
            const { proxy } = createDataviewJSProxy(mockApi, 'notes/test.md')

            const dvCurrent = proxy['current'] as () => unknown
            dvCurrent()

            expect(mockApi.page).toHaveBeenCalledWith('notes/test.md')
        })

        test('dv.fileLink() should return a Link object', () => {
            const mockApi = createMockDataviewApi()
            mockApi.fileLink = mock(() => ({
                path: '2021-08-08',
                embed: false,
                display: undefined,
                toString: () => '[[2021-08-08]]'
            }))

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvFileLink = proxy['fileLink'] as (
                path: string,
                embed?: boolean,
                display?: string
            ) => unknown
            const link = dvFileLink('2021-08-08')

            expect(mockApi.fileLink).toHaveBeenCalledWith('2021-08-08', undefined, undefined)
            expect(link).toHaveProperty('path', '2021-08-08')
        })

        test('dv.sectionLink() should return a Link object', () => {
            const mockApi = createMockDataviewApi()
            mockApi.sectionLink = mock(() => ({
                path: 'note',
                subpath: 'section',
                type: 'header',
                embed: false,
                toString: () => '[[note#section]]'
            }))

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvSectionLink = proxy['sectionLink'] as (
                path: string,
                section: string,
                embed?: boolean,
                display?: string
            ) => unknown
            const link = dvSectionLink('note', 'section')

            expect(mockApi.sectionLink).toHaveBeenCalledWith(
                'note',
                'section',
                undefined,
                undefined
            )
            expect(link).toHaveProperty('path', 'note')
        })

        test('dv.blockLink() should return a Link object', () => {
            const mockApi = createMockDataviewApi()
            mockApi.blockLink = mock(() => ({
                path: 'note',
                subpath: 'block123',
                type: 'block',
                embed: false,
                toString: () => '[[note#^block123]]'
            }))

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvBlockLink = proxy['blockLink'] as (
                path: string,
                block: string,
                embed?: boolean,
                display?: string
            ) => unknown
            const link = dvBlockLink('note', 'block123')

            expect(mockApi.blockLink).toHaveBeenCalledWith('note', 'block123', undefined, undefined)
            expect(link).toHaveProperty('path', 'note')
        })
    })

    describe('rendering Link objects', () => {
        test('dv.paragraph() should render a Link object as markdown', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            // Create a Link-like object
            const link = {
                path: '2021-08-08',
                embed: false,
                toString: () => '[[2021-08-08]]'
            }

            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            dvParagraph(link)

            const markdown = getMarkdown()
            expect(markdown).toBe('[[2021-08-08]]')
        })

        test('dv.list() should render Link objects as markdown list', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const links = [
                { path: 'note1', embed: false, toString: () => '[[note1]]' },
                { path: 'note2', embed: false, toString: () => '[[note2]]' }
            ]

            const dvList = proxy['list'] as (values: unknown[]) => void
            dvList(links)

            const markdown = getMarkdown()
            expect(markdown).toBe('- [[note1]]\n- [[note2]]')
        })

        test('dv.span() should render an embedded Link', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const link = {
                path: 'image.png',
                embed: true,
                toString: () => '![[image.png]]'
            }

            const dvSpan = proxy['span'] as (text: unknown) => void
            dvSpan(link)

            const markdown = getMarkdown()
            expect(markdown).toBe('![[image.png]]')
        })

        test('dv.paragraph() should render Link with display text', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const link = {
                path: '2021-08-08',
                embed: false,
                display: 'My Date',
                toString: () => '[[2021-08-08|My Date]]'
            }

            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            dvParagraph(link)

            const markdown = getMarkdown()
            expect(markdown).toBe('[[2021-08-08|My Date]]')
        })
    })

    describe('rendering special types', () => {
        test('dv.paragraph() should render null as dash', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            dvParagraph(null)

            const markdown = getMarkdown()
            expect(markdown).toBe('-')
        })

        test('dv.list() should render numbers', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvList = proxy['list'] as (values: unknown[]) => void
            dvList([1, 2, 3])

            const markdown = getMarkdown()
            expect(markdown).toBe('- 1\n- 2\n- 3')
        })

        test('dv.list() should render booleans', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvList = proxy['list'] as (values: unknown[]) => void
            dvList([true, false])

            const markdown = getMarkdown()
            expect(markdown).toBe('- true\n- false')
        })

        test('dv.paragraph() should render arrays as comma-separated values', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            dvParagraph(['a', 'b', 'c'])

            const markdown = getMarkdown()
            expect(markdown).toBe('a, b, c')
        })

        test('dv.paragraph() should render objects as key-value pairs', () => {
            const mockApi = createMockDataviewApi()
            const { proxy, getMarkdown } = createDataviewJSProxy(mockApi, 'test.md')

            const dvParagraph = proxy['paragraph'] as (text: unknown) => void
            dvParagraph({ name: 'Alice', age: 30 })

            const markdown = getMarkdown()
            expect(markdown).toBe('{ name: Alice, age: 30 }')
        })
    })

    describe('io methods', () => {
        test('dv.io.load() should call the underlying API', async () => {
            const mockApi = createMockDataviewApi()
            mockApi.io.load = mock(async () => 'file content')

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const io = proxy['io'] as { load: (path: string) => Promise<string> }
            const result = await io.load('data.txt')

            expect(mockApi.io.load).toHaveBeenCalledWith('data.txt', undefined)
            expect(result).toBe('file content')
        })

        test('dv.io.csv() should call the underlying API', async () => {
            const mockApi = createMockDataviewApi()
            const csvData = [{ name: 'Alice' }, { name: 'Bob' }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockApi.io.csv = mock(async () => csvData) as any

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const io = proxy['io'] as { csv: (path: string) => Promise<unknown[]> }
            const result = await io.csv('data.csv')

            expect(mockApi.io.csv).toHaveBeenCalledWith('data.csv', undefined)
            expect(result).toEqual(csvData)
        })

        test('dv.io.normalize() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            mockApi.io.normalize = mock(() => '/absolute/path/file.md')

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const io = proxy['io'] as { normalize: (path: string) => string }
            const result = io.normalize('relative/file.md')

            expect(mockApi.io.normalize).toHaveBeenCalledWith('relative/file.md', undefined)
            expect(result).toBe('/absolute/path/file.md')
        })
    })

    describe('utility methods', () => {
        test('dv.array() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            const mockArray = { values: [1, 2, 3] }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockApi.array = mock(() => mockArray) as any

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvArray = proxy['array'] as (raw: unknown) => unknown
            const result = dvArray([1, 2, 3])

            expect(mockApi.array).toHaveBeenCalledWith([1, 2, 3])
            expect(result).toBe(mockArray)
        })

        test('dv.isArray() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockApi.isArray = mock(() => true) as any

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvIsArray = proxy['isArray'] as (raw: unknown) => boolean
            const result = dvIsArray([1, 2, 3])

            expect(mockApi.isArray).toHaveBeenCalledWith([1, 2, 3])
            expect(result).toBe(true)
        })

        test('dv.compare() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            mockApi.compare = mock(() => -1)

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvCompare = proxy['compare'] as (a: unknown, b: unknown) => number
            const result = dvCompare('a', 'b')

            expect(mockApi.compare).toHaveBeenCalledWith('a', 'b')
            expect(result).toBe(-1)
        })

        test('dv.equal() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            mockApi.equal = mock(() => true)

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvEqual = proxy['equal'] as (a: unknown, b: unknown) => boolean
            const result = dvEqual('a', 'a')

            expect(mockApi.equal).toHaveBeenCalledWith('a', 'a')
            expect(result).toBe(true)
        })
    })

    describe('query methods', () => {
        test('dv.queryMarkdown() should call the underlying API with origin file', async () => {
            const mockApi = createMockDataviewApi()
            mockApi.queryMarkdown = mock(async () => '- Result 1\n- Result 2')

            const { proxy } = createDataviewJSProxy(mockApi, 'notes/test.md')

            const dvQueryMarkdown = proxy['queryMarkdown'] as (query: string) => Promise<string>
            const result = await dvQueryMarkdown('LIST FROM #tag')

            expect(mockApi.queryMarkdown).toHaveBeenCalledWith('LIST FROM #tag', 'notes/test.md')
            expect(result).toBe('- Result 1\n- Result 2')
        })

        test('dv.query() should call the underlying API', async () => {
            const mockApi = createMockDataviewApi()
            const queryResult = { successful: true, value: { values: ['a', 'b'] } }
            mockApi.query = mock(async () => queryResult)

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvQuery = proxy['query'] as (query: string) => Promise<unknown>
            const result = await dvQuery('LIST')

            expect(mockApi.query).toHaveBeenCalledWith('LIST', 'test.md')
            expect(result).toEqual(queryResult)
        })
    })

    describe('markdown generation methods', () => {
        test('dv.markdownList() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            mockApi.markdownList = mock(() => '- a\n- b')

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvMarkdownList = proxy['markdownList'] as (values: unknown[]) => string
            const result = dvMarkdownList(['a', 'b'])

            expect(mockApi.markdownList).toHaveBeenCalledWith(['a', 'b'])
            expect(result).toBe('- a\n- b')
        })

        test('dv.markdownTable() should call the underlying API', () => {
            const mockApi = createMockDataviewApi()
            mockApi.markdownTable = mock(() => '| A | B |\n|---|---|\n| 1 | 2 |')

            const { proxy } = createDataviewJSProxy(mockApi, 'test.md')

            const dvMarkdownTable = proxy['markdownTable'] as (
                headers: string[],
                values: unknown[][]
            ) => string
            const result = dvMarkdownTable(['A', 'B'], [['1', '2']])

            expect(mockApi.markdownTable).toHaveBeenCalledWith(['A', 'B'], [['1', '2']])
            expect(result).toBe('| A | B |\n|---|---|\n| 1 | 2 |')
        })
    })
})
