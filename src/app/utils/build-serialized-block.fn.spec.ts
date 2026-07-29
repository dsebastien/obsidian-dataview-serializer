import { describe, expect, it } from 'bun:test'
import { buildSerializedBlock } from './build-serialized-block.fn'
import {
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_OPEN,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_START
} from '../constants'

/**
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 */
describe('buildSerializedBlock', () => {
    const query = 'LIST FROM #project'
    const definition = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`
    const startMarker = `${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}`

    describe('outside blockquotes (must stay byte-identical to previous versions)', () => {
        it('should build a list block', () => {
            const result = buildSerializedBlock({
                queryDefinition: definition,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '- [[A]]\n- [[B]]',
                indentation: '',
                blankLineBeforeContent: false,
                blankLineBeforeEnd: false
            })

            // Historical format: definition, marker, content, end marker
            expect(result).toBe(
                `${definition}\n${startMarker}\n- [[A]]\n- [[B]]\n${SERIALIZED_QUERY_END}\n`
            )
        })

        it('should build a table block with the blank line before the content', () => {
            const result = buildSerializedBlock({
                queryDefinition: definition,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '| A |',
                indentation: '',
                blankLineBeforeContent: true,
                blankLineBeforeEnd: false
            })

            expect(result).toBe(`${definition}\n${startMarker}\n\n| A |\n${SERIALIZED_QUERY_END}\n`)
        })

        it('should add a trailing blank line when requested', () => {
            const result = buildSerializedBlock({
                queryDefinition: definition,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '- [[A]]',
                indentation: '',
                blankLineBeforeContent: false,
                blankLineBeforeEnd: true
            })

            expect(result).toBe(
                `${definition}\n${startMarker}\n- [[A]]\n\n${SERIALIZED_QUERY_END}\n`
            )
        })

        it('should not indent the markers for whitespace indentation', () => {
            const indentedDefinition = `    ${definition}`
            const result = buildSerializedBlock({
                queryDefinition: indentedDefinition,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '    - [[A]]',
                indentation: '    ',
                blankLineBeforeContent: false,
                blankLineBeforeEnd: true
            })

            expect(result).toBe(
                `${indentedDefinition}\n${startMarker}\n    - [[A]]\n\n${SERIALIZED_QUERY_END}\n`
            )
        })
    })

    describe('inside blockquotes and callouts', () => {
        it('should prefix the markers and the blank lines', () => {
            const quotedDefinition = `> ${definition}`
            const result = buildSerializedBlock({
                queryDefinition: quotedDefinition,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '> | File |\n> | ---- |\n> | Note A |',
                indentation: '> ',
                blankLineBeforeContent: true,
                blankLineBeforeEnd: true
            })

            expect(result).toBe(
                [
                    `> ${definition}`,
                    `> ${startMarker}`,
                    '>',
                    '> | File |',
                    '> | ---- |',
                    '> | Note A |',
                    '>',
                    `> ${SERIALIZED_QUERY_END}`,
                    ''
                ].join('\n')
            )
        })

        it('should never emit a line that leaves the quote', () => {
            const result = buildSerializedBlock({
                queryDefinition: `> ${definition}`,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '> - [[A]]\n>\n> - [[B]]',
                indentation: '> ',
                blankLineBeforeContent: true,
                blankLineBeforeEnd: true
            })

            const lines = result.split('\n').slice(0, -1) // drop the trailing newline
            expect(lines.every((line) => line.startsWith('>'))).toBe(true)
        })

        it('should preserve nested blockquote prefixes', () => {
            const result = buildSerializedBlock({
                queryDefinition: `> > ${definition}`,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '> > - [[A]]',
                indentation: '> > ',
                blankLineBeforeContent: false,
                blankLineBeforeEnd: true
            })

            expect(result).toBe(
                `> > ${definition}\n> > ${startMarker}\n> > - [[A]]\n> >\n> > ${SERIALIZED_QUERY_END}\n`
            )
        })

        it('should preserve indentation in front of the blockquote markers', () => {
            const result = buildSerializedBlock({
                queryDefinition: `  > ${definition}`,
                startMarker,
                endMarker: SERIALIZED_QUERY_END,
                content: '  > - [[A]]',
                indentation: '  > ',
                blankLineBeforeContent: false,
                blankLineBeforeEnd: false
            })

            expect(result).toBe(
                `  > ${definition}\n  > ${startMarker}\n  > - [[A]]\n  > ${SERIALIZED_QUERY_END}\n`
            )
        })
    })
})
