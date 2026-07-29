import { describe, expect, it } from 'bun:test'
import {
    applyIndentation,
    buildBlockquotePrefixPattern,
    getBlankLinePrefix,
    getBlockquotePrefix,
    stripBlockquoteMarkers,
    stripLinePrefix
} from './blockquote.fn'

/**
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 */
describe('blockquote helpers', () => {
    describe('getBlockquotePrefix', () => {
        it('should return an empty string when there is no indentation', () => {
            expect(getBlockquotePrefix('')).toBe('')
        })

        it('should return an empty string for whitespace indentation', () => {
            expect(getBlockquotePrefix('    ')).toBe('')
            expect(getBlockquotePrefix('\t\t')).toBe('')
            expect(getBlockquotePrefix('  \t  ')).toBe('')
        })

        it('should return an empty string for plain text before the marker', () => {
            expect(getBlockquotePrefix('Some text before ')).toBe('')
        })

        it('should detect a simple callout prefix', () => {
            expect(getBlockquotePrefix('> ')).toBe('> ')
        })

        it('should detect a prefix without a trailing space', () => {
            expect(getBlockquotePrefix('>')).toBe('>')
        })

        it('should detect nested blockquotes', () => {
            expect(getBlockquotePrefix('>> ')).toBe('>> ')
            expect(getBlockquotePrefix('> > ')).toBe('> > ')
        })

        it('should keep leading whitespace before the markers', () => {
            expect(getBlockquotePrefix('  > ')).toBe('  > ')
            expect(getBlockquotePrefix('\t> ')).toBe('\t> ')
        })

        it('should only keep the leading blockquote structure', () => {
            expect(getBlockquotePrefix('> Some text ')).toBe('> ')
        })
    })

    describe('stripBlockquoteMarkers', () => {
        it('should remove the leading markers', () => {
            expect(stripBlockquoteMarkers('> TABLE file.name')).toBe('TABLE file.name')
            expect(stripBlockquoteMarkers('>> TABLE file.name')).toBe('TABLE file.name')
            expect(stripBlockquoteMarkers('  >  TABLE file.name')).toBe('TABLE file.name')
        })

        it('should leave lines without markers untouched', () => {
            expect(stripBlockquoteMarkers('TABLE file.name')).toBe('TABLE file.name')
            expect(stripBlockquoteMarkers('    TABLE file.name')).toBe('    TABLE file.name')
        })

        it('should not remove markers that are not leading', () => {
            expect(stripBlockquoteMarkers('WHERE a > b')).toBe('WHERE a > b')
        })
    })

    describe('getBlankLinePrefix', () => {
        it('should be empty outside blockquotes', () => {
            expect(getBlankLinePrefix('')).toBe('')
            expect(getBlankLinePrefix('    ')).toBe('')
        })

        it('should keep the quote open without trailing whitespace', () => {
            expect(getBlankLinePrefix('> ')).toBe('>')
            expect(getBlankLinePrefix('> > ')).toBe('> >')
            expect(getBlankLinePrefix('  > ')).toBe('  >')
        })
    })

    describe('applyIndentation', () => {
        it('should return the content untouched without indentation', () => {
            expect(applyIndentation('- a\n- b', '')).toBe('- a\n- b')
        })

        it('should return empty content untouched', () => {
            expect(applyIndentation('', '> ')).toBe('')
        })

        it('should prefix every line with whitespace indentation (unchanged behavior)', () => {
            expect(applyIndentation('- a\n- b', '    ')).toBe('    - a\n    - b')
        })

        it('should keep blank lines as bare indentation outside blockquotes', () => {
            // Historical behavior: blank lines receive the indentation as-is
            expect(applyIndentation('- a\n\n- b', '    ')).toBe('    - a\n    \n    - b')
        })

        it('should prefix every line with the blockquote marker', () => {
            expect(applyIndentation('- a\n- b', '> ')).toBe('> - a\n> - b')
        })

        it('should quote blank lines without leaving trailing whitespace', () => {
            expect(applyIndentation('| a |\n\n| b |', '> ')).toBe('> | a |\n>\n> | b |')
        })

        it('should quote whitespace-only lines', () => {
            expect(applyIndentation('| a |\n   \n| b |', '> ')).toBe('> | a |\n>\n> | b |')
        })

        it('should handle leading and trailing newlines from table output', () => {
            expect(applyIndentation('\n| a |\n| - |\n', '> ')).toBe('>\n> | a |\n> | - |\n>')
        })
    })

    describe('stripLinePrefix', () => {
        it('should be a no-op without a prefix', () => {
            expect(stripLinePrefix('> a\n> b', '')).toBe('> a\n> b')
        })

        it('should remove the prefix from every line', () => {
            expect(stripLinePrefix('> a\n> b', '> ')).toBe('a\nb')
        })

        it('should also remove the trimmed prefix (quoted blank lines)', () => {
            expect(stripLinePrefix('> a\n>\n> b', '> ')).toBe('a\n\nb')
        })

        it('should leave unprefixed lines untouched', () => {
            expect(stripLinePrefix('> a\nb', '> ')).toBe('a\nb')
        })

        it('should only remove the prefix once per line', () => {
            expect(stripLinePrefix('> > a', '> ')).toBe('> a')
        })
    })

    describe('buildBlockquotePrefixPattern', () => {
        it('should be empty outside blockquotes, keeping matching strict', () => {
            expect(buildBlockquotePrefixPattern('')).toBe('')
            expect(buildBlockquotePrefixPattern('    ')).toBe('')
        })

        it('should tolerate a present, absent or different prefix inside blockquotes', () => {
            const pattern = buildBlockquotePrefixPattern('> ')
            expect(pattern).not.toBe('')

            const regex = new RegExp(`^${pattern}X$`)
            expect(regex.test('> X')).toBe(true)
            expect(regex.test('>X')).toBe(true)
            expect(regex.test('>> X')).toBe(true)
            // Blocks written by earlier plugin versions carry no prefix
            expect(regex.test('X')).toBe(true)
        })
    })
})
