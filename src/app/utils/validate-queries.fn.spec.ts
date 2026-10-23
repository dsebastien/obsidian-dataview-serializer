import { describe, expect, it } from 'bun:test'
import {
    findValidatableQueries,
    fixSelfReferences,
    validateNoteQueries,
    validateQuery,
    type QueryValidationContext
} from './validate-queries.fn'

const files = ['People/Alice.md', 'Goals/Goal.md']
const folders = ['People', 'Goals']

const context = (notePath = 'People/Alice.md'): QueryValidationContext => ({
    notePath,
    resolveLink: (linkpath) => {
        const lower = linkpath.toLowerCase()
        return (
            files.find(
                (path) =>
                    path.toLowerCase() === `${lower}.md` ||
                    path.toLowerCase().endsWith(`/${lower}.md`)
            ) ?? null
        )
    },
    pathExists: (path) =>
        folders.includes(path) || files.includes(path) || files.includes(`${path}.md`)
})

describe('findValidatableQueries', () => {
    it('lists block and inline queries, normalized, without result headers', () => {
        const content = [
            '<!-- QueryToSerialize: LIST FROM [[Goal]] -->',
            '<!-- SerializedQuery: LIST FROM [[Goal]] -->',
            '<!-- SerializedQuery END -->',
            '> <!-- dataview-serializer-query: TABLE x',
            '>   FROM "Goals" -->',
            'Value: <!-- IQ: =[[Goal]].status -->x<!-- /IQ -->',
            '<!-- QueryToSerialize: CALENDAR file.day FROM "x" -->'
        ].join('\n')

        expect(
            findValidatableQueries(content).map(({ query, queryType }) => [query, queryType])
        ).toEqual([
            ['LIST FROM [[Goal]]', 'block'],
            ['TABLE x FROM "Goals"', 'block'],
            ['=[[Goal]].status', 'inline']
        ])
    })
})

describe('validateQuery', () => {
    it('reports unresolved links and paths in positive FROM sources', () => {
        expect(
            validateQuery('LIST FROM [[Old goal]] AND "Old folder" AND !"Gone"', context()).map(
                (problem) => [problem.type, 'reference' in problem ? problem.reference : '']
            )
        ).toEqual([
            ['unresolved-link', '[[Old goal]]'],
            ['unresolved-path', '"Old folder"']
        ])
    })

    it('reports self-references by name or path, anywhere in the query', () => {
        const problems = validateQuery(
            'LIST FROM [[Alice]] OR [[People/Alice|me]] WHERE contains(file.outlinks, [[Alice#Bio]])',
            context()
        )
        expect(
            problems.map((p) => [
                p.type,
                'reference' in p ? p.reference : '',
                'fixable' in p ? p.fixable : null
            ])
        ).toEqual([
            ['self-reference', '[[Alice]]', true],
            ['self-reference', '[[People/Alice|me]]', true],
            ['self-reference', '[[Alice#Bio]]', false]
        ])
    })

    it('accepts [[]], valid sources and links to other notes', () => {
        expect(
            validateQuery('LIST FROM [[]] AND [[Goal]] AND "People" AND #tag', context())
        ).toEqual([])
    })
})

describe('validateNoteQueries', () => {
    it('counts queries and reports each distinct query once', () => {
        const content = [
            '<!-- QueryToSerialize: LIST FROM [[Missing]] -->',
            '<!-- QueryToSerializeManual: LIST FROM [[Missing]] -->',
            '<!-- QueryToSerialize: LIST FROM [[Goal]] -->'
        ].join('\n')
        const result = validateNoteQueries(content, context())
        expect(result.queryCount).toBe(3)
        expect(result.results.map((r) => [r.query, r.problems.length])).toEqual([
            ['LIST FROM [[Missing]]', 1],
            ['LIST FROM [[Goal]]', 0]
        ])
    })

    it('skips notes without comments cheaply', () => {
        expect(validateNoteQueries('# Just text [[Missing]]', context())).toEqual({
            queryCount: 0,
            results: []
        })
    })
})

describe('fixSelfReferences', () => {
    const content = [
        '<!-- QueryToSerialize: LIST FROM [[Alice]] AND #person -->',
        '<!-- SerializedQuery: LIST FROM [[Alice]] AND #person -->',
        '- x',
        '<!-- SerializedQuery END -->',
        '<!-- QueryToSerialize: TABLE y FROM [[alice|me]] OR [[Alice#Bio]] -->',
        'Body link [[Alice]]'
    ].join('\n')

    it('replaces fixable self-references with [[]] in queries and headers', () => {
        const result = fixSelfReferences(content, context())
        expect(result.content).toBe(
            [
                '<!-- QueryToSerialize: LIST FROM [[]] AND #person -->',
                '<!-- SerializedQuery: LIST FROM [[]] AND #person -->',
                '- x',
                '<!-- SerializedQuery END -->',
                '<!-- QueryToSerialize: TABLE y FROM [[]] OR [[Alice#Bio]] -->',
                'Body link [[Alice]]'
            ].join('\n')
        )
        expect(result.queriesFixed).toBe(2)
    })

    it('can target a single query', () => {
        const result = fixSelfReferences(content, context(), 'LIST FROM [[Alice]] AND #person')
        expect(result.queriesFixed).toBe(1)
        expect(result.content).toContain('<!-- SerializedQuery: LIST FROM [[]] AND #person -->')
        expect(result.content).toContain('FROM [[alice|me]]')
    })

    it('leaves links to other notes alone', () => {
        const other = '<!-- QueryToSerialize: LIST FROM [[Goal]] -->'
        expect(fixSelfReferences(other, context())).toEqual({ content: other, queriesFixed: 0 })
    })
})
