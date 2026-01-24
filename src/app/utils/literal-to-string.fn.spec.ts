import { describe, expect, test } from 'bun:test'
import { literalToString, escapeForTable } from './literal-to-string.fn'
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'

// Mock DataviewApi - we don't use it directly in the current implementation
const mockDataviewApi = {} as DataviewApi

describe('literalToString', () => {
    describe('primitives', () => {
        test('converts null to dash', () => {
            expect(literalToString(null, mockDataviewApi)).toBe('-')
        })

        test('converts undefined to dash', () => {
            expect(literalToString(undefined as unknown as null, mockDataviewApi)).toBe('-')
        })

        test('converts string directly', () => {
            expect(literalToString('hello world', mockDataviewApi)).toBe('hello world')
        })

        test('converts empty string', () => {
            expect(literalToString('', mockDataviewApi)).toBe('')
        })

        test('converts number to string', () => {
            expect(literalToString(42, mockDataviewApi)).toBe('42')
        })

        test('converts decimal number', () => {
            expect(literalToString(3.14159, mockDataviewApi)).toBe('3.14159')
        })

        test('converts zero', () => {
            expect(literalToString(0, mockDataviewApi)).toBe('0')
        })

        test('converts negative number', () => {
            expect(literalToString(-123, mockDataviewApi)).toBe('-123')
        })

        test('converts true to string', () => {
            expect(literalToString(true, mockDataviewApi)).toBe('true')
        })

        test('converts false to string', () => {
            expect(literalToString(false, mockDataviewApi)).toBe('false')
        })
    })

    describe('functions', () => {
        test('converts function to placeholder', () => {
            const fn = () => 'test'
            expect(literalToString(fn, mockDataviewApi)).toBe('<function>')
        })
    })

    describe('arrays', () => {
        test('converts empty array to dash', () => {
            expect(literalToString([], mockDataviewApi)).toBe('-')
        })

        test('converts single item array', () => {
            expect(literalToString(['item'], mockDataviewApi)).toBe('item')
        })

        test('converts multi-item array to comma-separated', () => {
            expect(literalToString(['a', 'b', 'c'], mockDataviewApi)).toBe('a, b, c')
        })

        test('converts mixed type array', () => {
            expect(literalToString(['text', 42, true], mockDataviewApi)).toBe('text, 42, true')
        })

        test('handles nested arrays', () => {
            expect(literalToString([['a', 'b'], ['c']], mockDataviewApi)).toBe('a, b, c')
        })

        test('handles array with null values', () => {
            expect(literalToString(['a', null, 'b'], mockDataviewApi)).toBe('a, -, b')
        })
    })

    describe('objects', () => {
        test('converts empty object to dash', () => {
            expect(literalToString({}, mockDataviewApi)).toBe('-')
        })

        test('converts simple object', () => {
            const result = literalToString({ name: 'John' }, mockDataviewApi)
            expect(result).toBe('{ name: John }')
        })

        test('converts object with multiple keys', () => {
            const result = literalToString({ name: 'John', age: 30 }, mockDataviewApi)
            expect(result).toContain('name: John')
            expect(result).toContain('age: 30')
        })

        test('converts nested object', () => {
            const result = literalToString({ person: { name: 'John' } }, mockDataviewApi)
            expect(result).toContain('person: { name: John }')
        })
    })

    describe('Links', () => {
        test('converts basic link', () => {
            const link = {
                path: 'Some Note',
                embed: false,
                type: 'file' as const,
                toString: () => '[[Some Note]]'
            }
            expect(literalToString(link, mockDataviewApi)).toBe('[[Some Note]]')
        })

        test('converts embedded link', () => {
            const link = {
                path: 'Image.png',
                embed: true,
                type: 'file' as const,
                toString: () => '![[Image.png]]'
            }
            expect(literalToString(link, mockDataviewApi)).toBe('![[Image.png]]')
        })

        test('converts link with display text', () => {
            const link = {
                path: 'Some Note',
                display: 'My Note',
                embed: false,
                type: 'file' as const,
                toString: () => '[[Some Note|My Note]]'
            }
            expect(literalToString(link, mockDataviewApi)).toBe('[[Some Note|My Note]]')
        })

        test('converts header link', () => {
            const link = {
                path: 'Some Note',
                subpath: 'Section',
                embed: false,
                type: 'header' as const,
                toString: () => '[[Some Note#Section]]'
            }
            expect(literalToString(link, mockDataviewApi)).toBe('[[Some Note#Section]]')
        })

        test('converts block link', () => {
            const link = {
                path: 'Some Note',
                subpath: 'abc123',
                embed: false,
                type: 'block' as const,
                toString: () => '[[Some Note#^abc123]]'
            }
            expect(literalToString(link, mockDataviewApi)).toBe('[[Some Note#^abc123]]')
        })

        test('falls back to manual link construction when toString fails', () => {
            const link = {
                path: 'Test Note',
                embed: false,
                type: 'file' as const,
                toString: () => '[object Object]' // Simulates a broken toString
            }
            expect(literalToString(link, mockDataviewApi)).toBe('[[Test Note]]')
        })
    })

    describe('DateTime', () => {
        test('converts DateTime to ISO date when no time', () => {
            const dt = {
                hour: 0,
                minute: 0,
                second: 0,
                toISO: () => '2024-01-15T00:00:00.000Z',
                toISODate: () => '2024-01-15',
                toFormat: () => '2024-01-15'
            }
            expect(literalToString(dt, mockDataviewApi)).toBe('2024-01-15')
        })

        test('converts DateTime with time to full ISO', () => {
            const dt = {
                hour: 14,
                minute: 30,
                second: 0,
                toISO: () => '2024-01-15T14:30:00.000Z',
                toISODate: () => '2024-01-15',
                toFormat: () => '2024-01-15'
            }
            expect(literalToString(dt, mockDataviewApi)).toBe('2024-01-15T14:30:00.000Z')
        })

        test('handles invalid DateTime', () => {
            const dt = {
                hour: 0,
                minute: 0,
                second: 0,
                toISO: () => null,
                toISODate: () => null,
                toFormat: () => ''
            }
            expect(literalToString(dt, mockDataviewApi)).toBe('-')
        })
    })

    describe('Duration', () => {
        test('converts Duration to human-readable format', () => {
            const dur = {
                toHuman: () => '2 hours, 30 minutes',
                toISO: () => 'PT2H30M'
            }
            expect(literalToString(dur, mockDataviewApi)).toBe('2 hours, 30 minutes')
        })

        test('falls back to ISO when human format fails', () => {
            const dur = {
                toHuman: () => '',
                toISO: () => 'P1D'
            }
            expect(literalToString(dur, mockDataviewApi)).toBe('P1D')
        })

        test('handles invalid Duration', () => {
            const dur = {
                toHuman: () => null,
                toISO: () => null
            }
            expect(literalToString(dur, mockDataviewApi)).toBe('-')
        })
    })

    describe('Widget', () => {
        test('converts Widget using markdown method', () => {
            const widget = {
                $widget: 'test',
                markdown: () => '[External Link](https://example.com)'
            }
            expect(literalToString(widget, mockDataviewApi)).toBe(
                '[External Link](https://example.com)'
            )
        })
    })

    describe('HTMLElement', () => {
        test('converts HTMLElement using textContent', () => {
            const el = {
                tagName: 'DIV',
                innerHTML: '<span>Hello</span> World',
                textContent: 'Hello World'
            }
            expect(literalToString(el, mockDataviewApi)).toBe('Hello World')
        })

        test('handles empty HTMLElement', () => {
            const el = {
                tagName: 'SPAN',
                innerHTML: '',
                textContent: null
            }
            expect(literalToString(el, mockDataviewApi)).toBe('')
        })
    })
})

describe('escapeForTable', () => {
    test('escapes pipe characters', () => {
        expect(escapeForTable('a | b | c')).toBe('a \\| b \\| c')
    })

    test('preserves strings without pipes', () => {
        expect(escapeForTable('hello world')).toBe('hello world')
    })

    test('handles empty string', () => {
        expect(escapeForTable('')).toBe('')
    })

    test('escapes multiple consecutive pipes', () => {
        expect(escapeForTable('a||b')).toBe('a\\|\\|b')
    })
})
