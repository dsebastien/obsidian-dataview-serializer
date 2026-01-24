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
