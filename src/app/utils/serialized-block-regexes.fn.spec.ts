import { describe, expect, it } from 'bun:test'
import {
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_OPEN,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_START
} from '../constants'
import {
    buildAlreadySerializedRegex,
    buildBlockQueryReplacementRegex,
    buildDataviewJSReplacementRegex,
    matchExistingDataviewJSBlock,
    matchExistingSerializedBlock
} from './serialized-block-regexes.fn'

/**
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 */
describe('serialized block regexes', () => {
    const query = 'LIST FROM #project'
    const params = {
        query,
        flagOpen: QUERY_FLAG_OPEN,
        flagClose: QUERY_FLAG_CLOSE,
        indentation: ''
    }
    const quotedParams = { ...params, indentation: '> ' }

    const buildBlock = (prefix: string): string =>
        [
            `${prefix}${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`,
            `${prefix}${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}`,
            `${prefix}- [[A]]`,
            `${prefix}${SERIALIZED_QUERY_END}`,
            ''
        ].join('\n')

    describe('buildAlreadySerializedRegex', () => {
        it('should detect a top-level serialized block', () => {
            expect(buildBlock('').match(buildAlreadySerializedRegex(params))).not.toBeNull()
        })

        it('should not fire when the query has no result block', () => {
            const text = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`
            expect(text.match(buildAlreadySerializedRegex(params))).toBeNull()
        })

        it('should detect a quoted serialized block', () => {
            expect(buildBlock('> ').match(buildAlreadySerializedRegex(quotedParams))).not.toBeNull()
        })

        it('should still detect blocks written before the fix (unquoted markers)', () => {
            const text = [
                `> ${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`,
                `${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}`,
                '> - [[A]]',
                SERIALIZED_QUERY_END,
                ''
            ].join('\n')

            expect(text.match(buildAlreadySerializedRegex(quotedParams))).not.toBeNull()
        })

        it('should stay strict outside blockquotes', () => {
            // A quoted result block does not belong to an unquoted query definition
            const text = [
                `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`,
                `> ${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}`,
                ''
            ].join('\n')

            expect(text.match(buildAlreadySerializedRegex(params))).toBeNull()
        })
    })

    describe('matchExistingSerializedBlock', () => {
        it('should report an empty prefix at the top level', () => {
            const result = matchExistingSerializedBlock(buildBlock(''), params)

            expect(result).not.toBeNull()
            expect(result?.startPrefix).toBe('')
            expect(result?.endPrefix).toBe('')
            expect(result?.content).toBe('- [[A]]\n')
        })

        it('should report the blockquote prefix of both markers', () => {
            const result = matchExistingSerializedBlock(buildBlock('> '), quotedParams)

            expect(result).not.toBeNull()
            expect(result?.startPrefix).toBe('> ')
            expect(result?.endPrefix).toBe('> ')
            expect(result?.content).toBe('> - [[A]]\n')
        })

        it('should report a missing prefix, so stale blocks can be repaired', () => {
            const text = [
                `> ${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}`,
                `${SERIALIZED_QUERY_START}${query}${QUERY_FLAG_CLOSE}`,
                '> - [[A]]',
                SERIALIZED_QUERY_END,
                ''
            ].join('\n')

            const result = matchExistingSerializedBlock(text, quotedParams)

            expect(result).not.toBeNull()
            expect(result?.startPrefix).toBe('')
            expect(result?.endPrefix).toBe('')
        })

        it('should return null when there is no block', () => {
            const text = `${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`
            expect(matchExistingSerializedBlock(text, params)).toBeNull()
        })
    })

    describe('buildBlockQueryReplacementRegex', () => {
        it('should match a quoted definition without a result block', () => {
            const text = `> ${QUERY_FLAG_OPEN}${query}${QUERY_FLAG_CLOSE}\n`
            const matches = text.match(buildBlockQueryReplacementRegex(quotedParams))

            expect(matches).toHaveLength(1)
            expect(matches?.[0]).toBe(text)
        })

        it('should match a quoted definition together with its result block', () => {
            const text = buildBlock('> ')
            const matches = text.match(buildBlockQueryReplacementRegex(quotedParams))

            expect(matches).toHaveLength(1)
            expect(matches?.[0]).toBe(text)
        })

        it('should not swallow content that follows the block', () => {
            const text = `${buildBlock('> ')}\nSome text after.`
            const matches = text.match(buildBlockQueryReplacementRegex(quotedParams))

            expect(matches?.[0]).toBe(buildBlock('> '))
        })

        it('should not match a similar but different query', () => {
            const text = `> ${QUERY_FLAG_OPEN}${query} and #done${QUERY_FLAG_CLOSE}\n`
            expect(text.match(buildBlockQueryReplacementRegex(quotedParams))).toBeNull()
        })

        it('should match a quoted multi-line definition', () => {
            const definition = ['> <!-- QueryToSerialize:', '> LIST FROM #project', '> -->'].join(
                '\n'
            )
            const text = `${definition}\n`

            const matches = text.match(
                buildBlockQueryReplacementRegex({
                    ...quotedParams,
                    originalQueryDefinition: definition
                })
            )

            expect(matches).toHaveLength(1)
            expect(matches?.[0]).toBe(text)
        })
    })

    describe('DataviewJS regexes', () => {
        const definition = ['> <!-- DataviewJSToSerialize:', '> dv.list([1])', '> -->'].join('\n')
        const dvjsParams = { originalQueryDefinition: definition, indentation: '> ' }
        const block = [
            definition,
            '> <!-- SerializedDataviewJS -->',
            '> - 1',
            '> <!-- SerializedDataviewJS END -->',
            ''
        ].join('\n')

        it('should match the quoted definition and its result block', () => {
            const matches = block.match(buildDataviewJSReplacementRegex(dvjsParams))

            expect(matches).toHaveLength(1)
            expect(matches?.[0]).toBe(block)
        })

        it('should report the prefixes of the result markers', () => {
            const result = matchExistingDataviewJSBlock(block, dvjsParams)

            expect(result).not.toBeNull()
            expect(result?.startPrefix).toBe('> ')
            expect(result?.endPrefix).toBe('> ')
            expect(result?.content).toBe('> - 1\n')
        })

        it('should report a missing prefix for blocks written before the fix', () => {
            const staleBlock = [
                definition,
                '<!-- SerializedDataviewJS -->',
                '> - 1',
                '<!-- SerializedDataviewJS END -->',
                ''
            ].join('\n')

            const result = matchExistingDataviewJSBlock(staleBlock, dvjsParams)

            expect(result).not.toBeNull()
            expect(result?.startPrefix).toBe('')
            expect(result?.endPrefix).toBe('')
        })
    })
})
