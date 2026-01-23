import { describe, expect, it } from 'bun:test'
import { escapeRegExp } from './escape-reg-exp.fn'

describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
        expect(escapeRegExp('[')).toBe('\\[')
        expect(escapeRegExp(']')).toBe('\\]')
        expect(escapeRegExp('{')).toBe('\\{')
        expect(escapeRegExp('}')).toBe('\\}')
        expect(escapeRegExp('(')).toBe('\\(')
        expect(escapeRegExp(')')).toBe('\\)')
        expect(escapeRegExp('*')).toBe('\\*')
        expect(escapeRegExp('+')).toBe('\\+')
        expect(escapeRegExp('?')).toBe('\\?')
        expect(escapeRegExp('.')).toBe('\\.')
        expect(escapeRegExp(',')).toBe('\\,')
        expect(escapeRegExp('\\')).toBe('\\\\')
        expect(escapeRegExp('^')).toBe('\\^')
        expect(escapeRegExp('$')).toBe('\\$')
        expect(escapeRegExp('|')).toBe('\\|')
        expect(escapeRegExp('#')).toBe('\\#')
        expect(escapeRegExp('-')).toBe('\\-')
    })

    it('should escape whitespace characters', () => {
        expect(escapeRegExp(' ')).toBe('\\ ')
        expect(escapeRegExp('\t')).toBe('\\\t')
        expect(escapeRegExp('\n')).toBe('\\\n')
    })

    it('should return the same string if no special characters', () => {
        expect(escapeRegExp('hello')).toBe('hello')
        expect(escapeRegExp('test123')).toBe('test123')
        expect(escapeRegExp('ABC')).toBe('ABC')
    })

    it('should handle empty string', () => {
        expect(escapeRegExp('')).toBe('')
    })

    it('should handle string with multiple special characters', () => {
        expect(escapeRegExp('[test]')).toBe('\\[test\\]')
        expect(escapeRegExp('foo.bar')).toBe('foo\\.bar')
        expect(escapeRegExp('a*b+c?')).toBe('a\\*b\\+c\\?')
        expect(escapeRegExp('(a|b)')).toBe('\\(a\\|b\\)')
    })

    it('should handle complex regex patterns', () => {
        expect(escapeRegExp('^start.*end$')).toBe('\\^start\\.\\*end\\$')
        expect(escapeRegExp('test[0-9]+')).toBe('test\\[0\\-9\\]\\+')
    })

    it('should produce strings safe for use in RegExp', () => {
        const unsafeString = 'file.name[1].txt'
        const escaped = escapeRegExp(unsafeString)
        const regex = new RegExp(escaped)
        expect(regex.test('file.name[1].txt')).toBe(true)
        expect(regex.test('fileXnameX1Xtxt')).toBe(false)
    })
})
