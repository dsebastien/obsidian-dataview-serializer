import { describe, expect, test } from 'bun:test'
import {
    findInlineQueries,
    findRawInlineQueries,
    isInlineQueryAlreadySerialized,
    buildSerializedInlineQuery,
    convertRawToSerializedFormat
} from './find-inline-queries.fn'

describe('findInlineQueries', () => {
    test('finds basic inline query with auto mode', () => {
        const text = '<!-- IQ: =this.field -->value<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.field')
        expect(results[0]?.updateMode).toBe('auto')
        expect(results[0]?.currentResult).toBe('value')
        expect(results[0]?.startOffset).toBe(0)
    })

    test('finds manual mode inline query', () => {
        const text = '<!-- IQManual: =this.ancestry -->John Smith<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.ancestry')
        expect(results[0]?.updateMode).toBe('manual')
        expect(results[0]?.currentResult).toBe('John Smith')
    })

    test('finds once mode inline query', () => {
        const text = '<!-- IQOnce: =this.created -->2024-01-15<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.created')
        expect(results[0]?.updateMode).toBe('once')
    })

    test('finds once-and-eject mode inline query', () => {
        const text = '<!-- IQOnceAndEject: =this.title -->My Title<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.title')
        expect(results[0]?.updateMode).toBe('once-and-eject')
    })

    test('finds multiple inline queries', () => {
        const text = `Name: <!-- IQ: =this.name -->John<!-- /IQ -->
Age: <!-- IQ: =this.age -->30<!-- /IQ -->`
        const results = findInlineQueries(text)

        expect(results).toHaveLength(2)
        expect(results[0]?.expression).toBe('=this.name')
        expect(results[1]?.expression).toBe('=this.age')
    })

    test('finds inline query with empty result', () => {
        const text = '<!-- IQ: =this.field --><!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.field')
        expect(results[0]?.currentResult).toBe('')
    })

    test('finds inline query with link result', () => {
        const text = '<!-- IQ: =this.portrait -->[[Portrait.png]]<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.currentResult).toBe('[[Portrait.png]]')
    })

    test('finds inline query with embedded link result', () => {
        const text = '<!-- IQ: =embed(this.portrait) -->![[Portrait.png]]<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=embed(this.portrait)')
        expect(results[0]?.currentResult).toBe('![[Portrait.png]]')
    })

    test('finds inline query with complex expression', () => {
        const text = '<!-- IQ: =this.file.ctime.year -->2024<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.file.ctime.year')
    })

    test('handles inline query in the middle of text', () => {
        const text =
            'The character is named <!-- IQ: =this.name -->Hero<!-- /IQ --> and is powerful.'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.startOffset).toBe(23)
        expect(results[0]?.expression).toBe('=this.name')
    })

    test('finds queries on multiple lines', () => {
        const text = `| Name | <!-- IQ: =this.name -->Test<!-- /IQ --> |
| Age | <!-- IQ: =this.age -->25<!-- /IQ --> |`
        const results = findInlineQueries(text)

        expect(results).toHaveLength(2)
    })

    test('returns empty array for text without inline queries', () => {
        const text = 'This is plain text without any inline queries.'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(0)
    })

    test('does not match block queries', () => {
        const text = '<!-- QueryToSerialize: LIST FROM #tag -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(0)
    })

    test('handles result with newlines', () => {
        const text = '<!-- IQ: =this.description -->Line 1\nLine 2<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.currentResult).toBe('Line 1\nLine 2')
    })

    test('orders results by position', () => {
        const text =
            'End: <!-- IQ: =this.b -->B<!-- /IQ --> Start: <!-- IQ: =this.a -->A<!-- /IQ -->'
        const results = findInlineQueries(text)

        expect(results).toHaveLength(2)
        expect(results[0]?.expression).toBe('=this.b')
        expect(results[1]?.expression).toBe('=this.a')
    })
})

describe('findRawInlineQueries', () => {
    test('finds basic raw inline query', () => {
        const text = 'Name: `=this.name`'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.name')
        expect(results[0]?.fullMatch).toBe('`=this.name`')
    })

    test('finds multiple raw inline queries', () => {
        const text = 'Name: `=this.name` Age: `=this.age`'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(2)
    })

    test('finds query with complex expression', () => {
        const text = '`=this.file.ctime.toFormat("yyyy-MM-dd")`'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.file.ctime.toFormat("yyyy-MM-dd")')
    })

    test('finds embed expression', () => {
        const text = '`=embed(this.portrait)`'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=embed(this.portrait)')
    })

    test('returns empty array for text without raw queries', () => {
        const text = 'This is plain text `without` any queries.'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(0)
    })

    test('does not match regular code blocks', () => {
        const text = '`const x = 5`'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(0)
    })

    test('finds query with spaces around expression', () => {
        const text = '`= this.name `'
        const results = findRawInlineQueries(text)

        expect(results).toHaveLength(1)
        expect(results[0]?.expression).toBe('=this.name')
    })
})

describe('isInlineQueryAlreadySerialized', () => {
    test('returns true when expression is serialized', () => {
        const text = '<!-- IQ: =this.name -->John<!-- /IQ -->'
        expect(isInlineQueryAlreadySerialized(text, '=this.name')).toBe(true)
    })

    test('returns false when expression is not serialized', () => {
        const text = '<!-- IQ: =this.age -->30<!-- /IQ -->'
        expect(isInlineQueryAlreadySerialized(text, '=this.name')).toBe(false)
    })

    test('returns false for empty text', () => {
        expect(isInlineQueryAlreadySerialized('', '=this.name')).toBe(false)
    })
})

describe('buildSerializedInlineQuery', () => {
    test('builds auto mode query', () => {
        const result = buildSerializedInlineQuery('=this.name', 'John', 'auto')
        expect(result).toBe('<!-- IQ: =this.name -->John<!-- /IQ -->')
    })

    test('builds manual mode query', () => {
        const result = buildSerializedInlineQuery('=this.name', 'John', 'manual')
        expect(result).toBe('<!-- IQManual: =this.name -->John<!-- /IQ -->')
    })

    test('builds once mode query', () => {
        const result = buildSerializedInlineQuery('=this.name', 'John', 'once')
        expect(result).toBe('<!-- IQOnce: =this.name -->John<!-- /IQ -->')
    })

    test('builds once-and-eject mode query', () => {
        const result = buildSerializedInlineQuery('=this.name', 'John', 'once-and-eject')
        expect(result).toBe('<!-- IQOnceAndEject: =this.name -->John<!-- /IQ -->')
    })

    test('defaults to auto mode', () => {
        const result = buildSerializedInlineQuery('=this.name', 'John')
        expect(result).toBe('<!-- IQ: =this.name -->John<!-- /IQ -->')
    })

    test('handles empty result', () => {
        const result = buildSerializedInlineQuery('=this.name', '')
        expect(result).toBe('<!-- IQ: =this.name --><!-- /IQ -->')
    })

    test('handles result with special characters', () => {
        const result = buildSerializedInlineQuery('=this.link', '[[Note|Display]]')
        expect(result).toBe('<!-- IQ: =this.link -->[[Note|Display]]<!-- /IQ -->')
    })
})

describe('convertRawToSerializedFormat', () => {
    test('converts to auto mode format', () => {
        const result = convertRawToSerializedFormat('=this.name', 'auto')
        expect(result).toBe('<!-- IQ: =this.name --><!-- /IQ -->')
    })

    test('converts to manual mode format', () => {
        const result = convertRawToSerializedFormat('=this.name', 'manual')
        expect(result).toBe('<!-- IQManual: =this.name --><!-- /IQ -->')
    })

    test('defaults to auto mode', () => {
        const result = convertRawToSerializedFormat('=this.name')
        expect(result).toBe('<!-- IQ: =this.name --><!-- /IQ -->')
    })
})

describe('alternative syntax support', () => {
    describe('findInlineQueries with alternative syntax', () => {
        test('finds alternative auto mode inline query', () => {
            const text =
                '<!-- dataview-serializer-iq: =this.field -->value<!-- /dataview-serializer-iq -->'
            const results = findInlineQueries(text)

            expect(results).toHaveLength(1)
            expect(results[0]?.expression).toBe('=this.field')
            expect(results[0]?.updateMode).toBe('auto')
            expect(results[0]?.syntaxVariant).toBe('alternative')
            expect(results[0]?.currentResult).toBe('value')
        })

        test('finds alternative manual mode inline query', () => {
            const text =
                '<!-- dataview-serializer-iq-manual: =this.ancestry -->John Smith<!-- /dataview-serializer-iq -->'
            const results = findInlineQueries(text)

            expect(results).toHaveLength(1)
            expect(results[0]?.expression).toBe('=this.ancestry')
            expect(results[0]?.updateMode).toBe('manual')
            expect(results[0]?.syntaxVariant).toBe('alternative')
        })

        test('finds alternative once mode inline query', () => {
            const text =
                '<!-- dataview-serializer-iq-once: =this.created -->2024-01-15<!-- /dataview-serializer-iq -->'
            const results = findInlineQueries(text)

            expect(results).toHaveLength(1)
            expect(results[0]?.expression).toBe('=this.created')
            expect(results[0]?.updateMode).toBe('once')
            expect(results[0]?.syntaxVariant).toBe('alternative')
        })

        test('finds alternative once-and-eject mode inline query', () => {
            const text =
                '<!-- dataview-serializer-iq-once-and-eject: =this.title -->My Title<!-- /dataview-serializer-iq -->'
            const results = findInlineQueries(text)

            expect(results).toHaveLength(1)
            expect(results[0]?.expression).toBe('=this.title')
            expect(results[0]?.updateMode).toBe('once-and-eject')
            expect(results[0]?.syntaxVariant).toBe('alternative')
        })

        test('finds mixed legacy and alternative inline queries', () => {
            const text = `Name: <!-- IQ: =this.name -->John<!-- /IQ -->
Age: <!-- dataview-serializer-iq: =this.age -->30<!-- /dataview-serializer-iq -->`
            const results = findInlineQueries(text)

            expect(results).toHaveLength(2)
            expect(results[0]?.syntaxVariant).toBe('legacy')
            expect(results[1]?.syntaxVariant).toBe('alternative')
        })

        test('sets legacy syntax variant for standard queries', () => {
            const text = '<!-- IQ: =this.field -->value<!-- /IQ -->'
            const results = findInlineQueries(text)

            expect(results).toHaveLength(1)
            expect(results[0]?.syntaxVariant).toBe('legacy')
        })
    })

    describe('buildSerializedInlineQuery with alternative syntax', () => {
        test('builds alternative auto mode query', () => {
            const result = buildSerializedInlineQuery('=this.name', 'John', 'auto', 'alternative')
            expect(result).toBe(
                '<!-- dataview-serializer-iq: =this.name -->John<!-- /dataview-serializer-iq -->'
            )
        })

        test('builds alternative manual mode query', () => {
            const result = buildSerializedInlineQuery('=this.name', 'John', 'manual', 'alternative')
            expect(result).toBe(
                '<!-- dataview-serializer-iq-manual: =this.name -->John<!-- /dataview-serializer-iq -->'
            )
        })

        test('builds alternative once mode query', () => {
            const result = buildSerializedInlineQuery('=this.name', 'John', 'once', 'alternative')
            expect(result).toBe(
                '<!-- dataview-serializer-iq-once: =this.name -->John<!-- /dataview-serializer-iq -->'
            )
        })

        test('builds alternative once-and-eject mode query', () => {
            const result = buildSerializedInlineQuery(
                '=this.name',
                'John',
                'once-and-eject',
                'alternative'
            )
            expect(result).toBe(
                '<!-- dataview-serializer-iq-once-and-eject: =this.name -->John<!-- /dataview-serializer-iq -->'
            )
        })

        test('defaults to legacy syntax when not specified', () => {
            const result = buildSerializedInlineQuery('=this.name', 'John', 'auto')
            expect(result).toBe('<!-- IQ: =this.name -->John<!-- /IQ -->')
        })
    })

    /**
     * Regression tests for pre-compiled regex safety.
     * These tests verify that sequential calls work correctly with shared regex objects.
     * The global flag causes regexes to maintain state via lastIndex, which must be reset.
     */
    describe('pre-compiled regex sequential calls', () => {
        test('findInlineQueries returns consistent results on sequential calls', () => {
            const text1 = '<!-- IQ: =this.field1 -->value1<!-- /IQ -->'
            const text2 = '<!-- IQ: =this.field2 -->value2<!-- /IQ -->'

            // First call
            const results1 = findInlineQueries(text1)
            expect(results1).toHaveLength(1)
            expect(results1[0]?.expression).toBe('=this.field1')

            // Second call - should work identically (lastIndex must be reset)
            const results2 = findInlineQueries(text2)
            expect(results2).toHaveLength(1)
            expect(results2[0]?.expression).toBe('=this.field2')

            // Third call with same text as first - verify no state leakage
            const results3 = findInlineQueries(text1)
            expect(results3).toHaveLength(1)
            expect(results3[0]?.expression).toBe('=this.field1')
        })

        test('findRawInlineQueries returns consistent results on sequential calls', () => {
            const text1 = 'Some text `=this.field1` more text'
            const text2 = 'Other text `=this.field2` end'

            // First call
            const results1 = findRawInlineQueries(text1)
            expect(results1).toHaveLength(1)
            expect(results1[0]?.expression).toBe('=this.field1')

            // Second call - should work identically
            const results2 = findRawInlineQueries(text2)
            expect(results2).toHaveLength(1)
            expect(results2[0]?.expression).toBe('=this.field2')

            // Third call with same text as first
            const results3 = findRawInlineQueries(text1)
            expect(results3).toHaveLength(1)
            expect(results3[0]?.expression).toBe('=this.field1')
        })

        test('findInlineQueries handles multiple patterns across sequential calls', () => {
            const textLegacy = '<!-- IQManual: =this.legacy -->legacy<!-- /IQ -->'
            const textAlt =
                '<!-- dataview-serializer-iq-manual: =this.alt -->alt<!-- /dataview-serializer-iq -->'

            // Alternate between different patterns
            const r1 = findInlineQueries(textLegacy)
            const r2 = findInlineQueries(textAlt)
            const r3 = findInlineQueries(textLegacy)
            const r4 = findInlineQueries(textAlt)

            expect(r1[0]?.expression).toBe('=this.legacy')
            expect(r1[0]?.syntaxVariant).toBe('legacy')
            expect(r2[0]?.expression).toBe('=this.alt')
            expect(r2[0]?.syntaxVariant).toBe('alternative')
            expect(r3[0]?.expression).toBe('=this.legacy')
            expect(r4[0]?.expression).toBe('=this.alt')
        })
    })
})
