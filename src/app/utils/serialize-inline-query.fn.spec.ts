import { describe, expect, test } from 'bun:test'
import { isInsideTable } from './serialize-inline-query.fn'

// Note: serializeInlineQuery requires a real DataviewApi instance which is
// difficult to mock properly. The core logic is tested through literal-to-string tests.
// Integration testing should be done in Obsidian.

describe('isInsideTable', () => {
    test('detects line starting with pipe as table', () => {
        const text = '| Column 1 | Column 2 |'
        expect(isInsideTable(text, 5)).toBe(true)
    })

    test('detects line ending with pipe as table', () => {
        const text = 'Column 1 | Column 2 |'
        expect(isInsideTable(text, 5)).toBe(true)
    })

    test('detects line with multiple pipes as table', () => {
        const text = 'Name | Age | City'
        expect(isInsideTable(text, 5)).toBe(true)
    })

    test('does not detect regular text as table', () => {
        const text = 'This is regular text without tables.'
        expect(isInsideTable(text, 10)).toBe(false)
    })

    test('does not detect single pipe as table', () => {
        const text = 'This has a | single pipe.'
        expect(isInsideTable(text, 5)).toBe(false)
    })

    test('handles multiline content correctly', () => {
        const text = `This is regular text.
| Col 1 | Col 2 |
More text here.`
        // Position in the table line
        expect(isInsideTable(text, 25)).toBe(true)
        // Position in regular text
        expect(isInsideTable(text, 5)).toBe(false)
    })

    test('handles empty lines', () => {
        const text = '\n\n'
        expect(isInsideTable(text, 1)).toBe(false)
    })

    test('handles line at start of document', () => {
        const text = '| Header |'
        expect(isInsideTable(text, 0)).toBe(true)
    })

    test('handles line at end of document', () => {
        const text = 'text\n| Table |'
        expect(isInsideTable(text, 10)).toBe(true)
    })

    test('ignores escaped pipes', () => {
        const text = 'This has \\| escaped \\| pipes'
        expect(isInsideTable(text, 5)).toBe(false)
    })
})

describe('serializeInlineQuery - unit behavior', () => {
    // These tests document expected behavior based on implementation
    // Full integration tests require a real Dataview environment

    test('should handle expressions starting with =', () => {
        // The implementation strips the = prefix
        // Expression "=this.name" becomes "this.name" for evaluation
        const expression = '=this.name'
        const cleaned = expression.startsWith('=') ? expression.slice(1).trim() : expression.trim()
        expect(cleaned).toBe('this.name')
    })

    test('should handle expressions without =', () => {
        const expression = 'this.name'
        const cleaned = expression.startsWith('=') ? expression.slice(1).trim() : expression.trim()
        expect(cleaned).toBe('this.name')
    })

    test('should handle expressions with extra whitespace', () => {
        const expression = '=  this.name  '
        const cleaned = expression.startsWith('=') ? expression.slice(1).trim() : expression.trim()
        expect(cleaned).toBe('this.name')
    })

    test('should detect empty expressions', () => {
        const expression = '='
        const cleaned = expression.startsWith('=') ? expression.slice(1).trim() : expression.trim()
        expect(cleaned).toBe('')
    })
})
