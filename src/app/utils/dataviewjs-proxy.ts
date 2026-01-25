/**
 * DataviewJS Proxy
 *
 * Creates a proxy `dv` object that intercepts rendering calls and captures
 * structured output for markdown conversion, rather than rendering to DOM.
 *
 * Supported rendering methods:
 * - dv.list(values) → Bullet list
 * - dv.table(headers, rows) → Markdown table
 * - dv.taskList(tasks, groupByFile) → Task list (checkboxes stripped)
 * - dv.paragraph(text) → Plain text block
 * - dv.header(level, text) → Markdown header
 * - dv.span(text) → Inline text
 *
 * Passthrough methods (delegated to real API):
 * - dv.pages(), dv.pagePaths(), dv.page()
 * - dv.current()
 * - dv.array(), dv.date(), dv.duration()
 * - dv.fileLink(), dv.sectionLink(), dv.blockLink()
 * - dv.luxon, dv.func, dv.value, dv.widget
 * - dv.io.load(), dv.io.csv(), dv.io.json()
 */
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import type { Literal, Link } from 'obsidian-dataview/lib/data-model/value'
import { literalToString } from './literal-to-string.fn'

/**
 * Type for captured output items
 */
interface CapturedOutput {
    type: 'list' | 'table' | 'taskList' | 'paragraph' | 'header' | 'span'
    content: string
}

/**
 * Type guard to check if a value is a Link
 */
function isLink(value: unknown): value is Link {
    return (
        value !== null &&
        typeof value === 'object' &&
        'path' in value &&
        'embed' in value &&
        typeof (value as Link).path === 'string' &&
        typeof (value as Link).embed === 'boolean'
    )
}

/**
 * Convert a value to markdown string
 */
function valueToMarkdown(value: Literal, dataviewApi: DataviewApi): string {
    return literalToString(value, dataviewApi)
}

/**
 * Convert an array of values to a markdown bullet list
 */
function listToMarkdown(values: Literal[], dataviewApi: DataviewApi): string {
    if (!values || values.length === 0) {
        return ''
    }

    const items = values.map((value) => {
        const str = valueToMarkdown(value, dataviewApi)
        return `- ${str}`
    })

    return items.join('\n')
}

/**
 * Convert headers and rows to a markdown table
 */
function tableToMarkdown(headers: string[], rows: Literal[][], dataviewApi: DataviewApi): string {
    if (!headers || headers.length === 0) {
        return ''
    }

    // Build header row
    const headerRow = `| ${headers.join(' | ')} |`

    // Build separator row
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`

    // Build data rows
    const dataRows = rows.map((row) => {
        const cells = row.map((cell) => {
            const str = valueToMarkdown(cell, dataviewApi)
            // Escape pipe characters in cell content
            return str.replace(/\|/g, '\\|')
        })
        return `| ${cells.join(' | ')} |`
    })

    return [headerRow, separatorRow, ...dataRows].join('\n')
}

/**
 * Attributes for dv.el()
 */
interface ElAttributes {
    href?: string
    src?: string
    alt?: string
    title?: string
    cls?: string
    attr?: Record<string, string>
}

/**
 * Convert an HTML element created by dv.el() to markdown.
 *
 * Supports common elements:
 * - p, div, span → text content
 * - h1-h6 → markdown headers
 * - b, strong → **bold**
 * - i, em → *italic*
 * - code → `code`
 * - pre → code block
 * - a → [text](href)
 * - br → newline
 * - hr → ---
 * - blockquote → > quote
 * - ul, ol, li → list items
 */
function elToMarkdown(
    tag: string,
    content: unknown,
    attrs: ElAttributes | undefined,
    dataviewApi: DataviewApi
): string {
    const tagLower = tag.toLowerCase()
    const textContent =
        content !== null && content !== undefined
            ? valueToMarkdown(content as Literal, dataviewApi)
            : ''

    switch (tagLower) {
        // Block elements that just contain text
        case 'p':
        case 'div':
            return textContent

        // Inline elements
        case 'span':
            return textContent

        // Headers
        case 'h1':
            return `# ${textContent}`
        case 'h2':
            return `## ${textContent}`
        case 'h3':
            return `### ${textContent}`
        case 'h4':
            return `#### ${textContent}`
        case 'h5':
            return `##### ${textContent}`
        case 'h6':
            return `###### ${textContent}`

        // Text formatting
        case 'b':
        case 'strong':
            return `**${textContent}**`
        case 'i':
        case 'em':
            return `*${textContent}*`
        case 'code':
            return `\`${textContent}\``
        case 's':
        case 'strike':
        case 'del':
            return `~~${textContent}~~`
        case 'u':
            // Markdown doesn't have underline, use HTML or just text
            return textContent
        case 'mark':
            return `==${textContent}==`
        case 'sup':
            return `^${textContent}^`
        case 'sub':
            return `~${textContent}~`

        // Links and images
        case 'a':
            if (attrs?.href) {
                return `[${textContent}](${attrs.href})`
            }
            return textContent
        case 'img':
            if (attrs?.src) {
                const alt = attrs?.alt ?? textContent ?? ''
                return `![${alt}](${attrs.src})`
            }
            return ''

        // Line breaks and separators
        case 'br':
            return '\n'
        case 'hr':
            return '---'

        // Blockquote
        case 'blockquote':
            // Add > prefix to each line
            return textContent
                .split('\n')
                .map((line) => `> ${line}`)
                .join('\n')

        // Code block
        case 'pre':
            return `\`\`\`\n${textContent}\n\`\`\``

        // Lists - these are tricky because dv.el doesn't nest well
        // Just handle li as a list item
        case 'li':
            return `- ${textContent}`
        case 'ul':
        case 'ol':
            // For ul/ol containers, just return content (li items handle themselves)
            return textContent

        // Table elements - basic support
        case 'table':
        case 'thead':
        case 'tbody':
        case 'tr':
        case 'th':
        case 'td':
            // Tables are complex; just extract text for now
            return textContent

        // Default: just return text content
        default:
            return textContent
    }
}

/**
 * Task item interface for dv.taskList
 */
interface TaskItem {
    text?: string
    completed?: boolean
    status?: string
    path?: string
    link?: Link
    children?: TaskItem[]
}

/**
 * Convert tasks to a markdown list (without checkboxes to prevent feedback loops)
 */
function taskListToMarkdown(
    tasks: TaskItem[],
    _groupByFile: boolean,
    dataviewApi: DataviewApi
): string {
    if (!tasks || tasks.length === 0) {
        return ''
    }

    const lines: string[] = []

    function processTask(task: TaskItem, indent: string): void {
        let text = task.text ?? ''

        // If there's a link, prepend it to the text
        if (task.link && isLink(task.link)) {
            const linkStr = valueToMarkdown(task.link, dataviewApi)
            text = text ? `${linkStr}: ${text}` : linkStr
        }

        // Render as simple list item (no checkbox to prevent feedback loops)
        lines.push(`${indent}- ${text}`)

        // Process children recursively
        if (task.children && Array.isArray(task.children)) {
            for (const child of task.children) {
                processTask(child, indent + '    ')
            }
        }
    }

    for (const task of tasks) {
        processTask(task, '')
    }

    return lines.join('\n')
}

/**
 * Result from creating a DataviewJS proxy
 */
export interface DataviewJSProxyResult {
    /** The proxy dv object to pass to executed JavaScript */
    proxy: Record<string, unknown>
    /** Function to get all captured outputs as markdown */
    getMarkdown: () => string
}

/**
 * Create a proxy dv object that captures rendering calls.
 *
 * @param dataviewApi The real Dataview API to delegate read operations to
 * @param originFile The file path where the query is located (for dv.current() context)
 * @returns The proxy object and a function to get captured markdown
 */
export function createDataviewJSProxy(
    dataviewApi: DataviewApi,
    originFile: string
): DataviewJSProxyResult {
    const capturedOutputs: CapturedOutput[] = []

    // Create the io proxy for async file operations
    // DataviewIOApi only has: csv, load, normalize
    const ioProxy = {
        load: (path: string, origin?: string) => dataviewApi.io.load(path, origin),
        csv: (path: string, origin?: string) => dataviewApi.io.csv(path, origin),
        normalize: (path: string, origin?: string) => dataviewApi.io.normalize(path, origin)
    }

    // Create the proxy dv object
    const proxy: Record<string, unknown> = {
        // Rendering methods (captured)
        list: (values: Literal[]): void => {
            // Handle DataArray vs regular array
            const arr = Array.isArray(values)
                ? values
                : ((values as { values?: Literal[] }).values ?? [])
            const markdown = listToMarkdown(arr as Literal[], dataviewApi)
            if (markdown) {
                capturedOutputs.push({ type: 'list', content: markdown })
            }
        },

        table: (headers: string[], rows: Literal[][]): void => {
            // Handle DataArray vs regular array
            const rowArr = Array.isArray(rows)
                ? rows
                : ((rows as { values?: Literal[][] }).values ?? [])
            const markdown = tableToMarkdown(headers, rowArr as Literal[][], dataviewApi)
            if (markdown) {
                capturedOutputs.push({ type: 'table', content: markdown })
            }
        },

        taskList: (tasks: TaskItem[], groupByFile = false): void => {
            // Handle DataArray vs regular array
            const taskArr = Array.isArray(tasks)
                ? tasks
                : ((tasks as { values?: TaskItem[] }).values ?? [])
            const markdown = taskListToMarkdown(taskArr, groupByFile, dataviewApi)
            if (markdown) {
                capturedOutputs.push({ type: 'taskList', content: markdown })
            }
        },

        paragraph: (text: Literal): void => {
            const markdown = valueToMarkdown(text, dataviewApi)
            if (markdown) {
                capturedOutputs.push({ type: 'paragraph', content: markdown })
            }
        },

        header: (level: number, text: Literal): void => {
            const markdown = valueToMarkdown(text, dataviewApi)
            if (markdown) {
                const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6))
                capturedOutputs.push({ type: 'header', content: `${hashes} ${markdown}` })
            }
        },

        span: (text: Literal): void => {
            const markdown = valueToMarkdown(text, dataviewApi)
            if (markdown) {
                capturedOutputs.push({ type: 'span', content: markdown })
            }
        },

        // el() - create arbitrary HTML elements, converted to markdown
        el: (tag: string, content?: unknown, attrs?: ElAttributes): void => {
            const markdown = elToMarkdown(tag, content, attrs, dataviewApi)
            if (markdown) {
                // Determine output type based on tag
                const tagLower = tag.toLowerCase()
                const blockTags = [
                    'p',
                    'div',
                    'h1',
                    'h2',
                    'h3',
                    'h4',
                    'h5',
                    'h6',
                    'blockquote',
                    'pre',
                    'hr',
                    'ul',
                    'ol',
                    'li'
                ]
                const outputType = blockTags.includes(tagLower) ? 'paragraph' : 'span'
                capturedOutputs.push({ type: outputType, content: markdown })
            }
        },

        // view() is not supported - requires external template files
        view: (): Promise<void> => {
            return Promise.reject(
                new Error('dv.view() is not supported in serialized DataviewJS queries.')
            )
        },

        // executeJs() is not supported - nested execution
        executeJs: (): Promise<void> => {
            return Promise.reject(
                new Error('dv.executeJs() is not supported in serialized DataviewJS queries.')
            )
        },

        // Passthrough methods (read-only operations)
        pages: (query?: string) => dataviewApi.pages(query, originFile),
        pagePaths: (query?: string) => dataviewApi.pagePaths(query, originFile),
        page: (path: string, originFile?: string) => dataviewApi.page(path, originFile),

        // current() returns the page metadata for the origin file
        current: () => dataviewApi.page(originFile),

        // Utility methods
        array: (raw: unknown) => dataviewApi.array(raw),
        isArray: (raw: unknown) => dataviewApi.isArray(raw),
        date: (text: string) => dataviewApi.date(text),
        duration: (text: string) => dataviewApi.duration(text),
        fileLink: (path: string, embed?: boolean, display?: string) =>
            dataviewApi.fileLink(path, embed, display),
        sectionLink: (path: string, section: string, embed?: boolean, display?: string) =>
            dataviewApi.sectionLink(path, section, embed, display),
        blockLink: (path: string, block: string, embed?: boolean, display?: string) =>
            dataviewApi.blockLink(path, block, embed, display),

        // Compare and utility functions
        compare: (a: unknown, b: unknown) => dataviewApi.compare(a, b),
        equal: (a: unknown, b: unknown) => dataviewApi.equal(a, b),
        clone: (value: Literal) => dataviewApi.clone(value),
        parse: (value: string) => dataviewApi.parse(value),

        // Luxon passthrough
        luxon: dataviewApi.luxon,

        // IO operations (async)
        io: ioProxy,

        // Dataview API passthrough properties
        func: dataviewApi.func,
        value: dataviewApi.value,
        widget: dataviewApi.widget,

        // evaluate expressions
        evaluate: (expr: string, context?: Record<string, unknown>) =>
            dataviewApi.evaluate(expr, context, originFile),
        tryEvaluate: (expr: string, context?: Record<string, unknown>) =>
            dataviewApi.tryEvaluate(expr, context, originFile),

        // query (returns markdown, same as block queries)
        query: (query: string, file?: string) => dataviewApi.query(query, file ?? originFile),
        queryMarkdown: (query: string, file?: string) =>
            dataviewApi.queryMarkdown(query, file ?? originFile),
        tryQuery: (query: string, file?: string) => dataviewApi.tryQuery(query, file ?? originFile),
        tryQueryMarkdown: (query: string, file?: string) =>
            dataviewApi.tryQueryMarkdown(query, file ?? originFile),

        // Markdown generation (returns strings)
        markdownTable: (headers: string[] | undefined, values: unknown[][] | undefined) =>
            dataviewApi.markdownTable(headers, values),
        markdownList: (values: unknown[] | undefined) => dataviewApi.markdownList(values),
        markdownTaskList: (values: unknown) => dataviewApi.markdownTaskList(values),

        // execute() normally renders to DOM, but we capture via queryMarkdown
        execute: async (query: string, file?: string): Promise<void> => {
            const markdown = await dataviewApi.queryMarkdown(query, file ?? originFile)
            if (markdown) {
                capturedOutputs.push({ type: 'paragraph', content: markdown })
            }
        }
    }

    // Function to get all captured outputs as a single markdown string
    const getMarkdown = (): string => {
        if (capturedOutputs.length === 0) {
            return ''
        }

        // Join outputs with double newlines for separation
        return capturedOutputs.map((output) => output.content).join('\n\n')
    }

    return { proxy, getMarkdown }
}
