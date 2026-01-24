import { describe, test, expect } from 'bun:test'
import {
    findDataviewCodeblocks,
    findDataviewInlineQueries,
    findAllDataviewQueries,
    convertToSerializedFormat,
    findQueryAtCursor,
    convertQueryAtCursor,
    convertAllQueries,
    convertSelectedQuery
} from './convert-dataview-query.fn'
import {
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_OPEN,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_END
} from '../constants'

describe('findDataviewCodeblocks', () => {
    test('should find a simple dataview codeblock', () => {
        const text = `# My Note

\`\`\`dataview
LIST FROM #project
\`\`\`

Some other content`

        const results = findDataviewCodeblocks(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.query).toBe('LIST FROM #project')
        expect(results[0]?.type).toBe('codeblock')
        expect(results[0]?.indentation).toBe('')
    })

    test('should find multiple dataview codeblocks', () => {
        const text = `# My Note

\`\`\`dataview
LIST FROM #project
\`\`\`

\`\`\`dataview
TABLE file.name, file.ctime FROM #task
\`\`\`
`

        const results = findDataviewCodeblocks(text)

        expect(results).toHaveLength(2)
        expect(results[0]?.query).toBe('LIST FROM #project')
        expect(results[1]?.query).toBe('TABLE file.name, file.ctime FROM #task')
    })

    test('should find indented dataview codeblock', () => {
        const text = `- Item
    \`\`\`dataview
    LIST FROM #project
    \`\`\`
`

        const results = findDataviewCodeblocks(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.query).toBe('LIST FROM #project')
        expect(results[0]?.indentation).toBe('    ')
    })

    test('should find multi-line dataview query', () => {
        const text = `\`\`\`dataview
LIST
FROM #project
WHERE file.ctime > date(today) - dur(7 days)
SORT file.ctime DESC
\`\`\`
`

        const results = findDataviewCodeblocks(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.query).toBe(
            'LIST\nFROM #project\nWHERE file.ctime > date(today) - dur(7 days)\nSORT file.ctime DESC'
        )
    })

    test('should return empty array when no codeblocks found', () => {
        const text = `# My Note

Just some regular text.
`

        const results = findDataviewCodeblocks(text)

        expect(results).toHaveLength(0)
    })

    test('should not match non-dataview codeblocks', () => {
        const text = `\`\`\`javascript
console.log('hello')
\`\`\`

\`\`\`dataview
LIST FROM #project
\`\`\`
`

        const results = findDataviewCodeblocks(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.query).toBe('LIST FROM #project')
    })
})

describe('findDataviewInlineQueries', () => {
    test('should find simple inline query', () => {
        const text = 'The count is `= length(this.file.tasks)`'

        const results = findDataviewInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.query).toBe('length(this.file.tasks)')
        expect(results[0]?.type).toBe('inline')
    })

    test('should find multiple inline queries', () => {
        const text = `Count: \`= length(this.file.tasks)\`
Name: \`= this.file.name\``

        const results = findDataviewInlineQueries(text)

        expect(results).toHaveLength(2)
        expect(results[0]?.query).toBe('length(this.file.tasks)')
        expect(results[1]?.query).toBe('this.file.name')
    })

    test('should return empty array when no inline queries found', () => {
        const text = 'Just some regular text with `code` but no dataview.'

        const results = findDataviewInlineQueries(text)

        expect(results).toHaveLength(0)
    })
})

describe('findAllDataviewQueries', () => {
    test('should find both codeblocks and inline queries', () => {
        const text = `# My Note

Count: \`= length(this.file.tasks)\`

\`\`\`dataview
LIST FROM #project
\`\`\`
`

        const results = findAllDataviewQueries(text)

        expect(results).toHaveLength(2)
        // Should be sorted by position
        expect(results[0]?.type).toBe('inline')
        expect(results[1]?.type).toBe('codeblock')
    })
})

describe('convertToSerializedFormat', () => {
    test('should convert simple query', () => {
        const result = convertToSerializedFormat('LIST FROM #project', '')

        expect(result).toBe(`${QUERY_FLAG_OPEN}LIST FROM #project${QUERY_FLAG_CLOSE}`)
    })

    test('should preserve indentation', () => {
        const result = convertToSerializedFormat('LIST FROM #project', '    ')

        expect(result).toBe(`    ${QUERY_FLAG_OPEN}LIST FROM #project${QUERY_FLAG_CLOSE}`)
    })

    test('should normalize multi-line query to single line', () => {
        const result = convertToSerializedFormat('LIST\nFROM #project\nWHERE done = false', '')

        expect(result).toBe(
            `${QUERY_FLAG_OPEN}LIST FROM #project WHERE done = false${QUERY_FLAG_CLOSE}`
        )
    })
})

describe('findQueryAtCursor', () => {
    test('should find query when cursor is inside codeblock', () => {
        const text = `# My Note

\`\`\`dataview
LIST FROM #project
\`\`\`
`
        // Cursor at position inside "LIST FROM #project"
        const codeblockStart = text.indexOf('```dataview')
        const cursorOffset = codeblockStart + 15 // Inside the codeblock

        const result = findQueryAtCursor(text, cursorOffset)

        expect(result).not.toBeNull()
        expect(result?.query).toBe('LIST FROM #project')
    })

    test('should return null when cursor is outside any query', () => {
        const text = `# My Note

\`\`\`dataview
LIST FROM #project
\`\`\`
`
        // Cursor at position in "# My Note"
        const cursorOffset = 5

        const result = findQueryAtCursor(text, cursorOffset)

        expect(result).toBeNull()
    })
})

describe('convertQueryAtCursor', () => {
    test('should convert codeblock at cursor', () => {
        const text = `# My Note

\`\`\`dataview
LIST FROM #project
\`\`\`

More content`

        const codeblockStart = text.indexOf('```dataview')
        const cursorOffset = codeblockStart + 15

        const result = convertQueryAtCursor(text, cursorOffset)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(1)
        expect(result.newText).toContain(QUERY_FLAG_OPEN)
        expect(result.newText).toContain('LIST FROM #project')
        expect(result.newText).not.toContain('```dataview')
    })

    test('should return unchanged when no query at cursor', () => {
        const text = `# My Note

Some regular text
`
        const cursorOffset = 5

        const result = convertQueryAtCursor(text, cursorOffset)

        expect(result.converted).toBe(false)
        expect(result.newText).toBe(text)
        expect(result.count).toBe(0)
    })

    test('should skip unsupported query types', () => {
        const text = `\`\`\`dataview
CALENDAR file.ctime
\`\`\`
`
        const cursorOffset = 15

        const result = convertQueryAtCursor(text, cursorOffset)

        expect(result.converted).toBe(false)
        expect(result.skipped).toHaveLength(1)
        expect(result.skipped[0]).toContain('CALENDAR')
    })
})

describe('convertAllQueries', () => {
    test('should convert all codeblocks in file', () => {
        const text = `# My Note

\`\`\`dataview
LIST FROM #project
\`\`\`

\`\`\`dataview
TABLE file.name FROM #task
\`\`\`
`

        const result = convertAllQueries(text)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(2)
        expect(result.newText).not.toContain('```dataview')
        expect(result.newText).toContain('LIST FROM #project')
        expect(result.newText).toContain('TABLE file.name FROM #task')
    })

    test('should return unchanged when no queries found', () => {
        const text = `# My Note

Just some text
`

        const result = convertAllQueries(text)

        expect(result.converted).toBe(false)
        expect(result.newText).toBe(text)
        expect(result.count).toBe(0)
    })

    test('should skip unsupported query types and report them', () => {
        const text = `\`\`\`dataview
LIST FROM #project
\`\`\`

\`\`\`dataview
CALENDAR file.ctime
\`\`\`
`

        const result = convertAllQueries(text)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(1)
        expect(result.skipped).toHaveLength(1)
        expect(result.skipped[0]).toContain('CALENDAR')
    })

    test('should preserve indentation when converting', () => {
        const text = `- Item
    \`\`\`dataview
    LIST FROM #project
    \`\`\`
`

        const result = convertAllQueries(text)

        expect(result.converted).toBe(true)
        // Check that the converted text has proper indentation
        expect(result.newText).toContain(`    ${QUERY_FLAG_OPEN}`)
    })
})

describe('convertSelectedQuery', () => {
    test('should convert query in selected text', () => {
        const selectedText = `\`\`\`dataview
LIST FROM #project
\`\`\``

        const result = convertSelectedQuery(selectedText)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(1)
        expect(result.newText).toContain(QUERY_FLAG_OPEN)
        expect(result.newText).not.toContain('```dataview')
    })

    test('should return unchanged when no query in selection', () => {
        const selectedText = 'Just some regular text'

        const result = convertSelectedQuery(selectedText)

        expect(result.converted).toBe(false)
        expect(result.newText).toBe(selectedText)
    })
})

describe('inline query conversion to inline format', () => {
    test('should convert inline query to inline serialized format', () => {
        const text = 'Name: `=this.name`'

        const result = convertAllQueries(text)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(1)
        // Should use inline format, not block format
        expect(result.newText).toContain(INLINE_QUERY_FLAG_OPEN)
        expect(result.newText).toContain(INLINE_QUERY_END)
        expect(result.newText).not.toContain(QUERY_FLAG_OPEN)
        expect(result.newText).toBe('Name: <!-- IQ: =this.name --><!-- /IQ -->')
    })

    test('should convert inline query at cursor to inline format', () => {
        const text = 'Count: `=length(this.tasks)`'
        const cursorOffset = 10 // Inside the inline query

        const result = convertQueryAtCursor(text, cursorOffset)

        expect(result.converted).toBe(true)
        expect(result.newText).toContain(INLINE_QUERY_FLAG_OPEN)
        expect(result.newText).toContain(INLINE_QUERY_END)
        expect(result.newText).not.toContain(QUERY_FLAG_OPEN)
    })

    test('should convert both codeblock and inline queries appropriately', () => {
        const text = `# My Note

Count: \`=this.count\`

\`\`\`dataview
LIST FROM #project
\`\`\`
`

        const result = convertAllQueries(text)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(2)
        // Inline query should use inline format
        expect(result.newText).toContain(INLINE_QUERY_FLAG_OPEN)
        expect(result.newText).toContain(INLINE_QUERY_END)
        // Codeblock query should use block format
        expect(result.newText).toContain(QUERY_FLAG_OPEN)
        expect(result.newText).toContain('LIST FROM #project')
    })

    test('should convert selected inline query to inline format', () => {
        const selectedText = '`=this.file.name`'

        const result = convertSelectedQuery(selectedText)

        expect(result.converted).toBe(true)
        expect(result.newText).toContain(INLINE_QUERY_FLAG_OPEN)
        expect(result.newText).toContain(INLINE_QUERY_END)
    })

    test('inline queries should always be converted (not type-checked)', () => {
        // Inline queries are expressions, not queries with types like LIST/TABLE
        // They should always be converted regardless of content
        const text = '`=embed(this.portrait)`'

        const result = convertAllQueries(text)

        expect(result.converted).toBe(true)
        expect(result.count).toBe(1)
        expect(result.skipped).toHaveLength(0)
    })
})
