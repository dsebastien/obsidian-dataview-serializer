import { describe, expect, test } from 'bun:test'
import { findDataviewJSQueries, buildSerializedDataviewJS } from './find-dataviewjs-queries.fn'

describe('findDataviewJSQueries', () => {
    describe('legacy syntax', () => {
        test('should find a basic DataviewJS query', () => {
            const text = `Some text
<!-- DataviewJSToSerialize:
dv.list(dv.pages("#project").file.link)
-->
More text`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.jsCode).toBe('dv.list(dv.pages("#project").file.link)')
            expect(queries[0]?.updateMode).toBe('auto')
            expect(queries[0]?.syntaxVariant).toBe('legacy')
        })

        test('should find manual update mode query', () => {
            const text = `<!-- DataviewJSToSerializeManual:
dv.table(["Name", "Date"], dv.pages().map(p => [p.file.name, p.file.ctime]))
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.updateMode).toBe('manual')
            expect(queries[0]?.syntaxVariant).toBe('legacy')
        })

        test('should find once update mode query', () => {
            const text = `<!-- DataviewJSToSerializeOnce:
dv.paragraph("Static content")
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.updateMode).toBe('once')
        })

        test('should find once-and-eject update mode query', () => {
            const text = `<!-- DataviewJSToSerializeOnceAndEject:
dv.header(2, "Generated Header")
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.updateMode).toBe('once-and-eject')
        })

        test('should handle multi-line JavaScript code', () => {
            const text = `<!-- DataviewJSToSerialize:
const pages = dv.pages("#project");
const sorted = pages.sort(p => p.file.name);
dv.list(sorted.file.link);
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.jsCode).toContain('const pages = dv.pages("#project")')
            expect(queries[0]?.jsCode).toContain('dv.list(sorted.file.link)')
        })

        test('should preserve indentation', () => {
            const text = `    <!-- DataviewJSToSerialize:
    dv.list([1, 2, 3])
    -->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.indentation).toBe('    ')
        })
    })

    describe('alternative syntax', () => {
        test('should find a basic DataviewJS query', () => {
            const text = `<!-- dataview-serializer-js:
dv.list(dv.pages("#project").file.link)
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.jsCode).toBe('dv.list(dv.pages("#project").file.link)')
            expect(queries[0]?.updateMode).toBe('auto')
            expect(queries[0]?.syntaxVariant).toBe('alternative')
        })

        test('should find manual update mode query', () => {
            const text = `<!-- dataview-serializer-js-manual:
dv.table(["Name"], dv.pages().map(p => [p.file.name]))
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.updateMode).toBe('manual')
            expect(queries[0]?.syntaxVariant).toBe('alternative')
        })

        test('should find once update mode query', () => {
            const text = `<!-- dataview-serializer-js-once:
dv.span("Static")
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.updateMode).toBe('once')
            expect(queries[0]?.syntaxVariant).toBe('alternative')
        })

        test('should find once-and-eject update mode query', () => {
            const text = `<!-- dataview-serializer-js-once-and-eject:
dv.header(1, "Title")
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.updateMode).toBe('once-and-eject')
            expect(queries[0]?.syntaxVariant).toBe('alternative')
        })
    })

    describe('edge cases', () => {
        test('should find multiple queries in same document', () => {
            const text = `<!-- DataviewJSToSerialize:
dv.list([1])
-->

<!-- dataview-serializer-js-manual:
dv.list([2])
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(2)
            expect(queries[0]?.jsCode).toBe('dv.list([1])')
            expect(queries[0]?.syntaxVariant).toBe('legacy')
            expect(queries[1]?.jsCode).toBe('dv.list([2])')
            expect(queries[1]?.syntaxVariant).toBe('alternative')
        })

        test('should ignore incomplete queries (no closing flag)', () => {
            const text = `<!-- DataviewJSToSerialize:
dv.list([1])
This query never ends`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(0)
        })

        test('should not find duplicates', () => {
            const text = `<!-- DataviewJSToSerialize:
dv.list([1])
-->

<!-- DataviewJSToSerialize:
dv.list([1])
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
        })

        test('should return empty array for text without queries', () => {
            const text = `Just some regular text without any queries`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(0)
        })

        test('should handle single-line query (rare)', () => {
            const text = `<!-- DataviewJSToSerialize: dv.list([1]) -->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.jsCode).toBe('dv.list([1])')
        })

        test('should handle closing flag without leading space', () => {
            const text = `<!-- DataviewJSToSerialize:
dv.list([1])
-->`

            const queries = findDataviewJSQueries(text)

            expect(queries).toHaveLength(1)
            expect(queries[0]?.jsCode).toBe('dv.list([1])')
        })
    })
})

describe('buildSerializedDataviewJS', () => {
    test('should build legacy syntax markers', () => {
        const result = buildSerializedDataviewJS('- Item 1\n- Item 2', 'legacy')

        expect(result).toContain('<!-- SerializedDataviewJS -->')
        expect(result).toContain('<!-- SerializedDataviewJS END -->')
        expect(result).toContain('- Item 1\n- Item 2')
    })

    test('should build alternative syntax markers', () => {
        const result = buildSerializedDataviewJS('- Item 1\n- Item 2', 'alternative')

        expect(result).toContain('<!-- dataview-serializer-js-result -->')
        expect(result).toContain('<!-- dataview-serializer-js-result-end -->')
        expect(result).toContain('- Item 1\n- Item 2')
    })
})
