import { describe, expect, it } from 'bun:test'
import {
    QUERY_FLAG_CLOSE,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_END_ALT,
    SERIALIZED_QUERY_START,
    SERIALIZED_QUERY_START_ALT
} from '../constants'
import { applyIndentation, getBlockquotePrefix, stripLinePrefix } from './blockquote.fn'
import { buildSerializedBlock } from './build-serialized-block.fn'
import { findQueries } from './find-queries.fn'
import { isTableQuery } from './is-table-query.fn'
import {
    buildBlockQueryReplacementRegex,
    matchExistingSerializedBlock
} from './serialized-block-regexes.fn'

/**
 * End-to-end tests for serializing queries that live inside blockquotes/callouts.
 *
 * They drive the exact same functions as `plugin.ts#processFile`, with the
 * Dataview call replaced by a canned markdown result, so that the file-level
 * outcome (and its idempotency) is covered without a live vault.
 *
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 */

interface SerializeOptions {
    /** Mirrors the `addTrailingNewline` plugin setting */
    addTrailingNewline?: boolean
}

/**
 * Replay the plugin's block-query serialization over a document.
 *
 * @param text The document
 * @param dataviewOutput The markdown Dataview would return for every query
 * @param options Plugin settings that influence the output
 * @returns The updated document and the queries that were skipped as unchanged
 */
function serializeDocument(
    text: string,
    dataviewOutput: string,
    options: SerializeOptions = {}
): { updatedText: string; skipped: string[] } {
    let updatedText = text
    const skipped: string[] = []

    for (const queryWithContext of findQueries(text)) {
        const { query, indentation, flagOpen, flagClose, syntaxVariant, originalQueryDefinition } =
            queryWithContext
        const blockquotePrefix = getBlockquotePrefix(indentation)
        const regexParams = { query, flagOpen, flagClose, indentation }

        const serializedStart =
            syntaxVariant === 'alternative' ? SERIALIZED_QUERY_START_ALT : SERIALIZED_QUERY_START
        const serializedEnd =
            syntaxVariant === 'alternative' ? SERIALIZED_QUERY_END_ALT : SERIALIZED_QUERY_END

        // Stands in for serializeQuery(), which indents the Dataview output
        const serializedQuery = applyIndentation(dataviewOutput, indentation)

        // Idempotency check
        const existingBlock = matchExistingSerializedBlock(text, regexParams)
        if (existingBlock) {
            const existingContent = stripLinePrefix(existingBlock.content, blockquotePrefix).trim()
            const newContent = stripLinePrefix(serializedQuery, blockquotePrefix).trim()
            const markersAreUpToDate =
                existingBlock.startPrefix === blockquotePrefix &&
                existingBlock.endPrefix === blockquotePrefix
            if (markersAreUpToDate && existingContent === newContent) {
                skipped.push(query)
                continue
            }
        }

        const queryToSerializeRegex = buildBlockQueryReplacementRegex({
            ...regexParams,
            originalQueryDefinition
        })

        const replacement = buildSerializedBlock({
            queryDefinition:
                originalQueryDefinition ?? `${indentation}${flagOpen}${query}${flagClose}`,
            startMarker: `${serializedStart}${query}${QUERY_FLAG_CLOSE}`,
            endMarker: serializedEnd,
            content: serializedQuery,
            indentation,
            blankLineBeforeContent: isTableQuery(query),
            blankLineBeforeEnd: indentation.length > 0 || options.addTrailingNewline === true
        })

        updatedText = updatedText.replace(queryToSerializeRegex, () => replacement)
    }

    return { updatedText, skipped }
}

const TABLE_QUERY = 'TABLE file.name FROM "SomeFolder" SORT file.name ASC'
const TABLE_OUTPUT = '| File |\n| ---- |\n| Note A |\n| Note B |'
const LIST_QUERY = 'LIST FROM #project'
const LIST_OUTPUT = '- [[Note A]]\n- [[Note B]]'

describe('serializing queries inside callouts', () => {
    it('should keep the whole result block inside the callout', () => {
        const text = [
            '> [!tip]- My Query Results',
            `> <!-- QueryToSerialize: ${TABLE_QUERY} -->`,
            ''
        ].join('\n')

        const { updatedText } = serializeDocument(text, TABLE_OUTPUT)

        expect(updatedText).toBe(
            [
                '> [!tip]- My Query Results',
                `> <!-- QueryToSerialize: ${TABLE_QUERY} -->`,
                `> <!-- SerializedQuery: ${TABLE_QUERY} -->`,
                '>',
                '> | File |',
                '> | ---- |',
                '> | Note A |',
                '> | Note B |',
                '>',
                '> <!-- SerializedQuery END -->',
                ''
            ].join('\n')
        )
    })

    it('should never emit a line that breaks out of the callout', () => {
        const text = [
            '> [!tip]- My Query Results',
            `> <!-- QueryToSerialize: ${TABLE_QUERY} -->`,
            '',
            '> [!note] Another callout',
            '> Still fine'
        ].join('\n')

        const { updatedText } = serializeDocument(text, TABLE_OUTPUT)
        const blockLines = updatedText.split('\n').slice(0, 10)

        expect(blockLines.every((line) => line.startsWith('>'))).toBe(true)
        // The callout below must be untouched
        expect(updatedText).toContain('> [!note] Another callout\n> Still fine')
    })

    it('should not leave trailing whitespace on quoted blank lines', () => {
        const text = `> <!-- QueryToSerialize: ${TABLE_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, `\n${TABLE_OUTPUT}\n`)

        expect(updatedText).not.toMatch(/[ \t]+$/m)
    })

    it('should serialize list queries inside callouts', () => {
        const text = `> <!-- QueryToSerialize: ${LIST_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, LIST_OUTPUT)

        expect(updatedText).toBe(
            [
                `> <!-- QueryToSerialize: ${LIST_QUERY} -->`,
                `> <!-- SerializedQuery: ${LIST_QUERY} -->`,
                '> - [[Note A]]',
                '> - [[Note B]]',
                '>',
                '> <!-- SerializedQuery END -->',
                ''
            ].join('\n')
        )
    })

    it('should use matching result markers for the alternative syntax', () => {
        const text = `> <!-- dataview-serializer-query: ${LIST_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, LIST_OUTPUT)

        expect(updatedText).toContain(`> <!-- dataview-serializer-result: ${LIST_QUERY} -->`)
        expect(updatedText).toContain('> <!-- dataview-serializer-result-end -->')
    })

    it('should support nested blockquotes', () => {
        const text = `> > <!-- QueryToSerialize: ${LIST_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, LIST_OUTPUT)

        expect(updatedText).toContain(`> > <!-- SerializedQuery: ${LIST_QUERY} -->`)
        expect(updatedText).toContain('> > <!-- SerializedQuery END -->')
        expect(updatedText).toContain('> > - [[Note A]]')
    })

    it('should serialize multi-line queries written inside a callout', () => {
        const text = [
            '> [!tip]- Results',
            '> <!-- QueryToSerialize:',
            '> TABLE file.name',
            '> FROM "SomeFolder"',
            '> -->',
            ''
        ].join('\n')

        const found = findQueries(text)
        expect(found).toHaveLength(1)
        // The blockquote markers must not leak into the query itself
        expect(found[0]!.query).toBe('TABLE file.name FROM "SomeFolder"')

        const { updatedText } = serializeDocument(text, TABLE_OUTPUT)

        expect(updatedText).toContain(
            '> <!-- SerializedQuery: TABLE file.name FROM "SomeFolder" -->'
        )
        expect(updatedText).toContain('> <!-- SerializedQuery END -->')
        // The original multi-line definition is preserved
        expect(updatedText).toContain('> <!-- QueryToSerialize:\n> TABLE file.name')
    })
})

describe('re-serializing queries inside callouts', () => {
    it('should detect unchanged content and leave the file alone', () => {
        const text = `> <!-- QueryToSerialize: ${TABLE_QUERY} -->\n`

        const first = serializeDocument(text, TABLE_OUTPUT)
        const second = serializeDocument(first.updatedText, TABLE_OUTPUT)

        expect(second.skipped).toEqual([TABLE_QUERY])
        expect(second.updatedText).toBe(first.updatedText)
    })

    it('should replace the previous block instead of appending a new one', () => {
        const text = `> <!-- QueryToSerialize: ${LIST_QUERY} -->\n`

        const first = serializeDocument(text, LIST_OUTPUT)
        const second = serializeDocument(first.updatedText, '- [[Note C]]')

        expect(second.skipped).toEqual([])
        expect(second.updatedText.match(/SerializedQuery END/g)).toHaveLength(1)
        expect(second.updatedText).toContain('> - [[Note C]]')
        expect(second.updatedText).not.toContain('Note A')
    })

    it('should reach a fixed point after the second pass', () => {
        const text = [
            '> [!tip]- Results',
            `> <!-- QueryToSerialize: ${TABLE_QUERY} -->`,
            '',
            'Some text after.'
        ].join('\n')

        const first = serializeDocument(text, TABLE_OUTPUT)
        const second = serializeDocument(first.updatedText, TABLE_OUTPUT)
        const third = serializeDocument(second.updatedText, TABLE_OUTPUT)

        expect(second.updatedText).toBe(first.updatedText)
        expect(third.updatedText).toBe(first.updatedText)
    })

    it('should upgrade a block written by an older version (unprefixed markers)', () => {
        // What the plugin produced before the fix: markers escaped the callout
        const legacyText = [
            '> [!tip]- Results',
            `> <!-- QueryToSerialize: ${LIST_QUERY} -->`,
            `<!-- SerializedQuery: ${LIST_QUERY} -->`,
            '> - [[Note A]]',
            '> - [[Note B]]',
            '',
            '<!-- SerializedQuery END -->',
            ''
        ].join('\n')

        const { updatedText } = serializeDocument(legacyText, LIST_OUTPUT)

        // The stale unprefixed markers are gone, replaced by quoted ones
        expect(updatedText).not.toContain(`\n<!-- SerializedQuery: ${LIST_QUERY} -->`)
        expect(updatedText).not.toContain('\n<!-- SerializedQuery END -->')
        expect(updatedText).toContain(`> <!-- SerializedQuery: ${LIST_QUERY} -->`)
        expect(updatedText).toContain('> <!-- SerializedQuery END -->')
        expect(updatedText.match(/SerializedQuery END/g)).toHaveLength(1)
    })
})

describe('serializing queries outside callouts (regression guard)', () => {
    it('should produce the historical output for a top-level list query', () => {
        const text = `<!-- QueryToSerialize: ${LIST_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, LIST_OUTPUT)

        expect(updatedText).toBe(
            [
                `<!-- QueryToSerialize: ${LIST_QUERY} -->`,
                `<!-- SerializedQuery: ${LIST_QUERY} -->`,
                '- [[Note A]]',
                '- [[Note B]]',
                '<!-- SerializedQuery END -->',
                ''
            ].join('\n')
        )
    })

    it('should produce the historical output for a top-level table query', () => {
        const text = `<!-- QueryToSerialize: ${TABLE_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, TABLE_OUTPUT)

        expect(updatedText).toBe(
            [
                `<!-- QueryToSerialize: ${TABLE_QUERY} -->`,
                `<!-- SerializedQuery: ${TABLE_QUERY} -->`,
                '',
                '| File |',
                '| ---- |',
                '| Note A |',
                '| Note B |',
                '<!-- SerializedQuery END -->',
                ''
            ].join('\n')
        )
    })

    it('should keep indenting the content but not the markers for whitespace indentation', () => {
        const text = `    <!-- QueryToSerialize: ${LIST_QUERY} -->\n`

        const { updatedText } = serializeDocument(text, LIST_OUTPUT)

        expect(updatedText).toBe(
            [
                `    <!-- QueryToSerialize: ${LIST_QUERY} -->`,
                `<!-- SerializedQuery: ${LIST_QUERY} -->`,
                '    - [[Note A]]',
                '    - [[Note B]]',
                '',
                '<!-- SerializedQuery END -->',
                ''
            ].join('\n')
        )
    })

    it('should stay idempotent at the top level', () => {
        const text = `<!-- QueryToSerialize: ${TABLE_QUERY} -->\n`

        const first = serializeDocument(text, TABLE_OUTPUT)
        const second = serializeDocument(first.updatedText, TABLE_OUTPUT)

        expect(second.skipped).toEqual([TABLE_QUERY])
        expect(second.updatedText).toBe(first.updatedText)
    })
})
