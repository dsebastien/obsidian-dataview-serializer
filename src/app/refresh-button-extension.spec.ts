import { describe, expect, it } from 'bun:test'
import {
    detectDataviewJSFlagInLine,
    detectInlineQueriesInLine,
    detectQueryFlagInLine
} from './refresh-button-extension'
import {
    DATAVIEWJS_FLAG_MANUAL_OPEN,
    DATAVIEWJS_FLAG_MANUAL_OPEN_ALT,
    DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN,
    DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    DATAVIEWJS_FLAG_ONCE_OPEN,
    DATAVIEWJS_FLAG_ONCE_OPEN_ALT,
    DATAVIEWJS_FLAG_OPEN,
    DATAVIEWJS_FLAG_OPEN_ALT,
    INLINE_QUERY_FLAG_MANUAL_OPEN,
    INLINE_QUERY_FLAG_MANUAL_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_OPEN,
    INLINE_QUERY_FLAG_ONCE_OPEN_ALT,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_FLAG_OPEN_ALT,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_MANUAL_OPEN_ALT,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_ONCE_OPEN_ALT,
    QUERY_FLAG_OPEN,
    QUERY_FLAG_OPEN_ALT
} from './constants'

const ALL_OPEN_FLAGS = [
    QUERY_FLAG_OPEN,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    QUERY_FLAG_OPEN_ALT,
    QUERY_FLAG_MANUAL_OPEN_ALT,
    QUERY_FLAG_ONCE_OPEN_ALT,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_FLAG_MANUAL_OPEN,
    INLINE_QUERY_FLAG_ONCE_OPEN,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    INLINE_QUERY_FLAG_OPEN_ALT,
    INLINE_QUERY_FLAG_MANUAL_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    DATAVIEWJS_FLAG_OPEN,
    DATAVIEWJS_FLAG_MANUAL_OPEN,
    DATAVIEWJS_FLAG_ONCE_OPEN,
    DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN,
    DATAVIEWJS_FLAG_OPEN_ALT,
    DATAVIEWJS_FLAG_MANUAL_OPEN_ALT,
    DATAVIEWJS_FLAG_ONCE_OPEN_ALT,
    DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN_ALT
]

describe('marker detection', () => {
    describe('comment-opener pre-filter safety', () => {
        it('should hold the invariant the pre-filter relies on: every open flag is an HTML comment', () => {
            // The detectors bail out early on lines without '<!--'. That is only
            // sound while every marker they look for starts with it.
            for (const flag of ALL_OPEN_FLAGS) {
                expect(flag.startsWith('<!--')).toBe(true)
            }
        })

        it('should find every block flag when it is present', () => {
            const blockFlags = [
                QUERY_FLAG_OPEN,
                QUERY_FLAG_MANUAL_OPEN,
                QUERY_FLAG_ONCE_OPEN,
                QUERY_FLAG_ONCE_AND_EJECT_OPEN,
                QUERY_FLAG_OPEN_ALT,
                QUERY_FLAG_MANUAL_OPEN_ALT,
                QUERY_FLAG_ONCE_OPEN_ALT,
                QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT
            ]

            for (const flag of blockFlags) {
                const detected = detectQueryFlagInLine(`${flag}LIST FROM #tag -->`)
                expect(detected).not.toBeNull()
                expect(detected?.flagOpen).toBe(flag)
            }
        })

        it('should find every DataviewJS flag when it is present', () => {
            const dvjsFlags = [
                DATAVIEWJS_FLAG_OPEN,
                DATAVIEWJS_FLAG_MANUAL_OPEN,
                DATAVIEWJS_FLAG_ONCE_OPEN,
                DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN,
                DATAVIEWJS_FLAG_OPEN_ALT,
                DATAVIEWJS_FLAG_MANUAL_OPEN_ALT,
                DATAVIEWJS_FLAG_ONCE_OPEN_ALT,
                DATAVIEWJS_FLAG_ONCE_AND_EJECT_OPEN_ALT
            ]

            for (const flag of dvjsFlags) {
                const detected = detectDataviewJSFlagInLine(`${flag}dv.list([]) -->`)
                expect(detected).not.toBeNull()
                expect(detected?.flagOpen).toBe(flag)
            }
        })
    })

    describe('detectQueryFlagInLine', () => {
        it('should return null for ordinary prose', () => {
            expect(
                detectQueryFlagInLine('Just a normal sentence about a LIST of things.')
            ).toBeNull()
        })

        it('should return null for an empty line', () => {
            expect(detectQueryFlagInLine('')).toBeNull()
        })

        it('should return null for an HTML comment that is not a query flag', () => {
            expect(detectQueryFlagInLine('<!-- just a note to self -->')).toBeNull()
        })

        it('should report the query type and offset', () => {
            const detected = detectQueryFlagInLine(`prefix ${QUERY_FLAG_OPEN}LIST -->`)

            expect(detected?.queryType).toBe('auto')
            expect(detected?.openIdx).toBe(7)
        })

        it('should prefer the more specific flag when prefixes overlap', () => {
            const detected = detectQueryFlagInLine(`${QUERY_FLAG_ONCE_AND_EJECT_OPEN}LIST -->`)

            expect(detected?.queryType).toBe('eject')
            expect(detected?.flagOpen).toBe(QUERY_FLAG_ONCE_AND_EJECT_OPEN)
        })
    })

    describe('detectDataviewJSFlagInLine', () => {
        it('should return null for ordinary prose', () => {
            expect(detectDataviewJSFlagInLine('some text mentioning dv.list()')).toBeNull()
        })

        it('should return null for an unrelated HTML comment', () => {
            expect(detectDataviewJSFlagInLine('<!-- unrelated -->')).toBeNull()
        })

        it('should not confuse a block query with a DataviewJS query', () => {
            expect(detectDataviewJSFlagInLine(`${QUERY_FLAG_OPEN}LIST -->`)).toBeNull()
        })
    })

    describe('detectInlineQueriesInLine', () => {
        it('should return an empty array for ordinary prose', () => {
            expect(detectInlineQueriesInLine('nothing inline here')).toEqual([])
        })

        it('should return an empty array for an unrelated HTML comment', () => {
            expect(detectInlineQueriesInLine('<!-- unrelated -->')).toEqual([])
        })

        it('should find a single inline query', () => {
            const found = detectInlineQueriesInLine('<!-- IQ: =this.field -->value<!-- /IQ -->')

            expect(found).toHaveLength(1)
            expect(found[0]?.expression).toBe('=this.field')
            expect(found[0]?.queryType).toBe('auto')
        })

        it('should find several inline queries on one line, in order', () => {
            const found = detectInlineQueriesInLine(
                '<!-- IQ: =this.a -->1<!-- /IQ --> and <!-- IQ: =this.b -->2<!-- /IQ -->'
            )

            expect(found).toHaveLength(2)
            expect(found.map((q) => q.expression)).toEqual(['=this.a', '=this.b'])
        })

        it('should ignore an inline query with no closing marker', () => {
            expect(detectInlineQueriesInLine('<!-- IQ: =this.field -->no end marker')).toEqual([])
        })
    })
})
