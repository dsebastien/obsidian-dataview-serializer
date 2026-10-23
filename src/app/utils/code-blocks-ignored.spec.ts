import { describe, expect, it } from 'bun:test'
import { findQueries } from './find-queries.fn'
import { findInlineQueries, findRawInlineQueries } from './find-inline-queries.fn'
import { findDataviewJSQueries } from './find-dataviewjs-queries.fn'
import { convertAllQueries, findAllDataviewQueries } from './convert-dataview-query.fn'
import { findQueryComments } from './query-comments.fn'
import {
    findValidatableQueries,
    fixSelfReferences,
    validateNoteQueries
} from './validate-queries.fn'
import { rewriteQueryCommentsForRenames } from './rewrite-renamed-references.fn'
import { collectReferenceKeys } from './query-reference-index'
import { removeAllQueries } from './remove-all-queries.fn'
import { matchExistingSerializedBlock } from './serialized-block-regexes.fn'

/**
 * Queries inside fenced code blocks and inline code are examples, never live
 * queries: every parser and rewriter must ignore them.
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/91
 */

const LIVE = 'LIST FROM [[Live]]'
const EXAMPLE = 'LIST FROM [[Example]]'

/** A note documenting the plugin: one live query, examples in code */
const NOTE = [
    '# Docs',
    `<!-- QueryToSerialize: ${LIVE} -->`,
    '',
    '`````markdown',
    '````markdown',
    `<!-- QueryToSerialize: ${EXAMPLE} -->`,
    `<!-- SerializedQuery: ${EXAMPLE} -->`,
    '- [[Example]]',
    '<!-- SerializedQuery END -->',
    '```dataview',
    'LIST FROM #nested',
    '```',
    '````',
    '`````',
    '',
    `Inline: \`<!-- QueryToSerialize: ${EXAMPLE} WHERE inline -->\` and \`<!-- IQ: =[[Example]].x --><!-- /IQ -->\``,
    '',
    '~~~',
    '<!-- dataview-serializer-query: LIST FROM [[Example]] WHERE tilde -->',
    '<!-- IQ: =this.example --><!-- /IQ -->',
    '~~~',
    '',
    '> [!example]',
    '> ```',
    `> <!-- QueryToSerialize: ${EXAMPLE} WHERE callout -->`,
    '> ```',
    `> <!-- QueryToSerialize: ${LIVE} WHERE callout -->`,
    '',
    'Live inline: <!-- IQ: =this.file.name --><!-- /IQ -->',
    ''
].join('\n')

describe('queries inside code are ignored (#91)', () => {
    it('findQueries returns only live block queries', () => {
        expect(findQueries(NOTE).map((q) => q.query)).toEqual([LIVE, `${LIVE} WHERE callout`])
    })

    it('findQueries keeps a live multi-line query whose text holds a backtick', () => {
        const text = '<!-- QueryToSerialize: LIST\nWHERE a = "`"\n-->\n`x`'
        expect(findQueries(text).map((q) => q.query)).toEqual(['LIST WHERE a = "`"'])
    })

    it('findInlineQueries returns only live inline queries', () => {
        expect(findInlineQueries(NOTE).map((q) => q.expression)).toEqual(['=this.file.name'])
    })

    it('findDataviewJSQueries ignores fenced examples but keeps template literals', () => {
        const text = [
            '```',
            '<!-- DataviewJSToSerialize:',
            'dv.list(["example"])',
            '-->',
            '```',
            '<!-- DataviewJSToSerialize:',
            'dv.paragraph(`live ${dv.current().file.name}`)',
            '```',
            '-->',
            '`<!-- DataviewJSToSerialize: dv.list([]) -->`'
        ].join('\n')
        expect(findDataviewJSQueries(text).map((q) => q.jsCode)).toEqual([
            'dv.paragraph(`live ${dv.current().file.name}`)\n```'
        ])
    })

    describe('Dataview conversion', () => {
        const text = [
            '```dataview',
            'LIST FROM #live',
            '```',
            '````markdown',
            '```dataview',
            'LIST FROM #example',
            '```',
            'Inline `=this.example`',
            '````',
            'Live `=this.live` and ``literal `=this.literal` ``'
        ].join('\n')

        it('finds only the live ```dataview blocks and `= spans', () => {
            expect(findAllDataviewQueries(text).map((q) => q.query)).toEqual([
                'LIST FROM #live',
                'this.live'
            ])
            expect(findRawInlineQueries(text).map((q) => q.expression)).toEqual(['=this.live'])
        })

        it('converts only the live ones', () => {
            const result = convertAllQueries(text)
            expect(result.count).toBe(2)
            expect(result.newText).toContain('````markdown\n```dataview\nLIST FROM #example\n```')
            expect(result.newText).toContain('Inline `=this.example`')
        })
    })

    describe('validation (#89)', () => {
        const context = {
            notePath: 'Docs.md',
            resolveLink: (linkpath: string): string | null =>
                linkpath === 'Live' ? 'Live.md' : linkpath === 'Docs' ? 'Docs.md' : null,
            pathExists: (): boolean => false
        }

        it('reports only live queries', () => {
            const { queryCount, results } = validateNoteQueries(NOTE, context)
            expect(queryCount).toBe(3)
            expect(results.every((r) => r.problems.length === 0)).toBe(true)
            expect(findValidatableQueries(NOTE).map((q) => q.query)).not.toContain(EXAMPLE)
        })

        it('fixes self-references in live queries only', () => {
            const text = [
                '<!-- QueryToSerialize: LIST FROM [[Docs]] -->',
                '```',
                '<!-- QueryToSerialize: LIST FROM [[Docs]] -->',
                '```'
            ].join('\n')
            const fixed = fixSelfReferences(text, context)
            expect(fixed.queriesFixed).toBe(1)
            expect(fixed.content).toBe(
                [
                    '<!-- QueryToSerialize: LIST FROM [[]] -->',
                    '```',
                    '<!-- QueryToSerialize: LIST FROM [[Docs]] -->',
                    '```'
                ].join('\n')
            )
        })
    })

    describe('rename rewriting (#87)', () => {
        it('rewrites live queries and leaves examples untouched', () => {
            const text = [
                '<!-- QueryToSerialize: LIST FROM [[Example]] -->',
                '```markdown',
                '<!-- QueryToSerialize: LIST FROM [[Example]] -->',
                '<!-- SerializedQuery: LIST FROM [[Example]] -->',
                '```',
                '`<!-- IQ: =[[Example]].x --><!-- /IQ -->`'
            ].join('\n')
            const result = rewriteQueryCommentsForRenames(
                text,
                [{ kind: 'file', oldPath: 'Example.md', newPath: 'Renamed.md' }],
                () => null
            )
            expect(result.queriesUpdated).toBe(1)
            expect(result.content).toBe(
                text.replace('LIST FROM [[Example]]', 'LIST FROM [[Renamed]]')
            )
        })

        it('does not index references held by examples', () => {
            const keys = collectReferenceKeys(NOTE)
            expect(keys.has('l:live')).toBe(true)
            expect(keys.has('l:example')).toBe(false)
        })

        it('findQueryComments skips comments in code', () => {
            expect(findQueryComments(NOTE).every((c) => !c.body.includes('Example'))).toBe(true)
        })
    })

    it('"Remove all queries" keeps examples', () => {
        const text = [
            `<!-- QueryToSerialize: ${LIVE} -->`,
            `<!-- SerializedQuery: ${LIVE} -->`,
            '- [[Live]]',
            '<!-- SerializedQuery END -->',
            '```markdown',
            `<!-- QueryToSerialize: ${EXAMPLE} -->`,
            `<!-- SerializedQuery: ${EXAMPLE} -->`,
            '- [[Example]]',
            '<!-- SerializedQuery END -->',
            '',
            '',
            '',
            '```',
            '`<!-- IQ: =this.x -->1<!-- /IQ -->`'
        ].join('\n')
        const result = removeAllQueries(text)
        expect(result.removedCount).toBe(1)
        expect(result.newText).toBe(text.split('\n').slice(4).join('\n'))
    })

    it('an existing result block inside a fence is not taken for the live one', () => {
        const text = [
            '```',
            `<!-- QueryToSerialize: ${LIVE} -->`,
            `<!-- SerializedQuery: ${LIVE} -->`,
            '- [[Old]]',
            '<!-- SerializedQuery END -->',
            '```',
            `<!-- QueryToSerialize: ${LIVE} -->`,
            `<!-- SerializedQuery: ${LIVE} -->`,
            '- [[Live]]',
            '<!-- SerializedQuery END -->'
        ].join('\n')
        const block = matchExistingSerializedBlock(text, {
            query: LIVE,
            flagOpen: '<!-- QueryToSerialize: ',
            flagClose: ' -->',
            indentation: ''
        })
        expect(block?.content).toBe('- [[Live]]\n')
    })
})
