import { describe, expect, test } from 'bun:test'
import { removeAllQueries } from './remove-all-queries.fn'

describe('removeAllQueries', () => {
    // -------------------------------------------------------------------------
    // Block queries (legacy syntax)
    // -------------------------------------------------------------------------
    describe('block queries - legacy syntax', () => {
        test('should remove a block query with result block', () => {
            const input = [
                '# My Note',
                '<!-- QueryToSerialize: LIST FROM #foo -->',
                '<!-- SerializedQuery: LIST FROM #foo -->',
                '- [[Note A]]',
                '- [[Note B]]',
                '<!-- SerializedQuery END -->',
                'Some other content',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('# My Note\nSome other content\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove a block query without result block', () => {
            const input = [
                '# My Note',
                '<!-- QueryToSerialize: LIST FROM #foo -->',
                'Some other content',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('# My Note\nSome other content\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove manual block query', () => {
            const input = [
                '<!-- QueryToSerializeManual: LIST FROM #archive -->',
                '<!-- SerializedQuery: LIST FROM #archive -->',
                '- [[Archived]]',
                '<!-- SerializedQuery END -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once block query', () => {
            const input = [
                '<!-- QueryToSerializeOnce: TABLE file.ctime FROM "Templates" -->',
                '<!-- SerializedQuery: TABLE file.ctime FROM "Templates" -->',
                '',
                '| File | ctime |',
                '| --- | --- |',
                '| Template A | 2024-01-01 |',
                '',
                '<!-- SerializedQuery END -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once-and-eject block query', () => {
            const input = [
                '<!-- QueryToSerializeOnceAndEject: LIST FROM #daily -->',
                'Some content after',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Some content after\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove multi-line block query definition', () => {
            const input = [
                '<!-- QueryToSerialize: LIST',
                'FROM #quotes',
                'WHERE public_note = true',
                'SORT file.name ASC -->',
                '<!-- SerializedQuery: LIST FROM #quotes WHERE public_note = true SORT file.name ASC -->',
                '- [[Quote 1]]',
                '<!-- SerializedQuery END -->',
                'Other content',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Other content\n')
            expect(result.removedCount).toBe(1)
        })
    })

    // -------------------------------------------------------------------------
    // Block queries (alternative syntax)
    // -------------------------------------------------------------------------
    describe('block queries - alternative syntax', () => {
        test('should remove a block query with result block', () => {
            const input = [
                '# My Note',
                '<!-- dataview-serializer-query: LIST FROM #project -->',
                '<!-- dataview-serializer-result: LIST FROM #project -->',
                '- [[Project A]]',
                '- [[Project B]]',
                '<!-- dataview-serializer-result-end -->',
                'Some other content',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('# My Note\nSome other content\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove manual alternative block query', () => {
            const input = [
                '<!-- dataview-serializer-query-manual: LIST FROM #archive -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once alternative block query', () => {
            const input = ['<!-- dataview-serializer-query-once: TABLE FROM "Setup" -->', ''].join(
                '\n'
            )

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once-and-eject alternative block query', () => {
            const input = [
                '<!-- dataview-serializer-query-once-and-eject: LIST FROM #daily -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })
    })

    // -------------------------------------------------------------------------
    // Inline queries (legacy syntax)
    // -------------------------------------------------------------------------
    describe('inline queries - legacy syntax', () => {
        test('should remove an inline query', () => {
            const input = 'Name: <!-- IQ: =this.name -->John Smith<!-- /IQ -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Name: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove manual inline query', () => {
            const input = 'Value: <!-- IQManual: =this.value -->42<!-- /IQ -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Value: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once inline query', () => {
            const input = 'Date: <!-- IQOnce: =this.file.ctime -->2024-01-15<!-- /IQ -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Date: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once-and-eject inline query', () => {
            const input =
                'Portrait: <!-- IQOnceAndEject: =embed(this.portrait) -->![[portrait.png]]<!-- /IQ -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Portrait: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove inline query with hyphenated expression', () => {
            const input = 'Start: <!-- IQ: =this.start-date -->2024-01-01<!-- /IQ -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Start: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove multiple inline queries on the same line', () => {
            const input =
                '| <!-- IQ: =this.name -->John<!-- /IQ --> | <!-- IQ: =this.age -->30<!-- /IQ --> |\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('|  |  |\n')
            expect(result.removedCount).toBe(2)
        })
    })

    // -------------------------------------------------------------------------
    // Inline queries (alternative syntax)
    // -------------------------------------------------------------------------
    describe('inline queries - alternative syntax', () => {
        test('should remove an alternative inline query', () => {
            const input =
                'Name: <!-- dataview-serializer-iq: =this.name -->John<!-- /dataview-serializer-iq -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Name: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove manual alternative inline query', () => {
            const input =
                'Value: <!-- dataview-serializer-iq-manual: =this.value -->42<!-- /dataview-serializer-iq -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Value: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once alternative inline query', () => {
            const input =
                'Date: <!-- dataview-serializer-iq-once: =this.date -->2024<!-- /dataview-serializer-iq -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Date: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once-and-eject alternative inline query', () => {
            const input =
                'X: <!-- dataview-serializer-iq-once-and-eject: =this.x -->val<!-- /dataview-serializer-iq -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('X: \n')
            expect(result.removedCount).toBe(1)
        })
    })

    // -------------------------------------------------------------------------
    // DataviewJS queries (legacy syntax)
    // -------------------------------------------------------------------------
    describe('DataviewJS queries - legacy syntax', () => {
        test('should remove a DataviewJS query with result block', () => {
            const input = [
                '# My Note',
                '<!-- DataviewJSToSerialize:',
                'dv.list(dv.pages("#project").file.link)',
                '-->',
                '<!-- SerializedDataviewJS -->',
                '- [[Project A]]',
                '- [[Project B]]',
                '<!-- SerializedDataviewJS END -->',
                'Other content',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('# My Note\nOther content\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove a DataviewJS query without result block', () => {
            const input = [
                '<!-- DataviewJSToSerialize:',
                'dv.list(dv.pages("#tag").file.link)',
                '-->',
                'Content after',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Content after\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove manual DataviewJS query', () => {
            const input = [
                '<!-- DataviewJSToSerializeManual:',
                'dv.table(["Name"], dv.pages("#note").map(p => [p.file.name]))',
                '-->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once DataviewJS query', () => {
            const input = [
                '<!-- DataviewJSToSerializeOnce:',
                'dv.paragraph("snapshot")',
                '-->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once-and-eject DataviewJS query', () => {
            const input = [
                '<!-- DataviewJSToSerializeOnceAndEject:',
                'dv.list(["a", "b"])',
                '-->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })
    })

    // -------------------------------------------------------------------------
    // DataviewJS queries (alternative syntax)
    // -------------------------------------------------------------------------
    describe('DataviewJS queries - alternative syntax', () => {
        test('should remove an alternative DataviewJS query with result block', () => {
            const input = [
                '# My Note',
                '<!-- dataview-serializer-js:',
                'dv.list(dv.pages("#project").file.link)',
                '-->',
                '<!-- dataview-serializer-js-result -->',
                '- [[Project A]]',
                '<!-- dataview-serializer-js-result-end -->',
                'Other content',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('# My Note\nOther content\n')
            expect(result.removedCount).toBe(1)
        })

        test('should remove manual alternative DataviewJS query', () => {
            const input = [
                '<!-- dataview-serializer-js-manual:',
                'dv.paragraph("hello")',
                '-->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once alternative DataviewJS query', () => {
            const input = [
                '<!-- dataview-serializer-js-once:',
                'dv.span("snapshot")',
                '-->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })

        test('should remove once-and-eject alternative DataviewJS query', () => {
            const input = [
                '<!-- dataview-serializer-js-once-and-eject:',
                'dv.header(2, "Title")',
                '-->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })
    })

    // -------------------------------------------------------------------------
    // Mixed content
    // -------------------------------------------------------------------------
    describe('mixed content', () => {
        test('should remove all queries while preserving regular markdown', () => {
            const input = [
                '# My Dashboard',
                '',
                '## Active Projects',
                '<!-- QueryToSerialize: LIST FROM #project -->',
                '<!-- SerializedQuery: LIST FROM #project -->',
                '- [[Project A]]',
                '<!-- SerializedQuery END -->',
                '',
                'Some regular text here.',
                '',
                'Name: <!-- IQ: =this.name -->John<!-- /IQ -->',
                '',
                '## DataviewJS Section',
                '<!-- DataviewJSToSerialize:',
                'dv.list(dv.pages("#tag").file.link)',
                '-->',
                '<!-- SerializedDataviewJS -->',
                '- [[Tag A]]',
                '<!-- SerializedDataviewJS END -->',
                '',
                '## Conclusion',
                'Final paragraph.',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            const expected = [
                '# My Dashboard',
                '',
                '## Active Projects',
                '',
                'Some regular text here.',
                '',
                'Name: ',
                '',
                '## DataviewJS Section',
                '',
                '## Conclusion',
                'Final paragraph.',
                ''
            ].join('\n')

            expect(result.newText).toBe(expected)
            expect(result.removedCount).toBe(3)
        })

        test('should handle mixed legacy and alternative syntax', () => {
            const input = [
                '<!-- QueryToSerialize: LIST FROM #legacy -->',
                '<!-- SerializedQuery: LIST FROM #legacy -->',
                '- [[Legacy]]',
                '<!-- SerializedQuery END -->',
                '<!-- dataview-serializer-query: LIST FROM #alt -->',
                '<!-- dataview-serializer-result: LIST FROM #alt -->',
                '- [[Alt]]',
                '<!-- dataview-serializer-result-end -->',
                'Name: <!-- IQ: =this.name -->A<!-- /IQ -->',
                'Value: <!-- dataview-serializer-iq: =this.value -->B<!-- /dataview-serializer-iq -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Name: \nValue: \n')
            expect(result.removedCount).toBe(4)
        })
    })

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------
    describe('edge cases', () => {
        test('should return unchanged text when no queries are present', () => {
            const input = '# My Note\n\nSome regular content.\n\n- Item 1\n- Item 2\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe(input)
            expect(result.removedCount).toBe(0)
        })

        test('should handle empty text', () => {
            const result = removeAllQueries('')

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(0)
        })

        test('should collapse 3+ consecutive blank lines into 2', () => {
            const input = [
                '# Title',
                '',
                '<!-- QueryToSerialize: LIST FROM #foo -->',
                '<!-- SerializedQuery: LIST FROM #foo -->',
                '- [[Note]]',
                '<!-- SerializedQuery END -->',
                '',
                '',
                'Content after',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            // After removing the query block, there would be multiple blank lines
            // They should be collapsed to at most one blank line (2 newlines)
            expect(result.newText).not.toContain('\n\n\n')
            expect(result.removedCount).toBe(1)
        })

        test('should handle indented block queries', () => {
            const input = [
                '- Item',
                '    <!-- QueryToSerialize: LIST FROM #indented -->',
                '    <!-- SerializedQuery: LIST FROM #indented -->',
                '    - [[Indented Note]]',
                '    <!-- SerializedQuery END -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('- Item\n')
            expect(result.removedCount).toBe(1)
        })

        test('should handle multiple queries in sequence', () => {
            const input = [
                '<!-- QueryToSerialize: LIST FROM #a -->',
                '<!-- SerializedQuery: LIST FROM #a -->',
                '- [[A]]',
                '<!-- SerializedQuery END -->',
                '<!-- QueryToSerialize: LIST FROM #b -->',
                '<!-- SerializedQuery: LIST FROM #b -->',
                '- [[B]]',
                '<!-- SerializedQuery END -->',
                '<!-- QueryToSerialize: LIST FROM #c -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(3)
        })

        test('should handle inline query with empty result', () => {
            const input = 'Value: <!-- IQ: =this.missing --><!-- /IQ -->\n'

            const result = removeAllQueries(input)

            expect(result.newText).toBe('Value: \n')
            expect(result.removedCount).toBe(1)
        })

        test('should handle result block with trailing newline before end marker', () => {
            const input = [
                '<!-- QueryToSerialize: TABLE FROM #foo -->',
                '<!-- SerializedQuery: TABLE FROM #foo -->',
                '',
                '| File |',
                '| --- |',
                '| A |',
                '',
                '<!-- SerializedQuery END -->',
                ''
            ].join('\n')

            const result = removeAllQueries(input)

            expect(result.newText).toBe('')
            expect(result.removedCount).toBe(1)
        })
    })
})
