import { describe, expect, it } from 'bun:test'
import {
    extractPositiveFromSources,
    findUnresolvedFromSources,
    type FromSourceResolver
} from './extract-from-sources.fn'

/** The raw text of each extracted source, for compact assertions */
const raws = (query: string): string[] => extractPositiveFromSources(query).map((s) => s.raw)

describe('extractPositiveFromSources', () => {
    describe('query types', () => {
        it('reads LIST queries', () => {
            expect(raws('LIST FROM [[Goal]]')).toEqual(['[[Goal]]'])
        })

        it('reads LIST WITHOUT ID queries', () => {
            expect(raws('LIST WITHOUT ID file.link FROM "Projects"')).toEqual(['"Projects"'])
        })

        it('reads TABLE queries with field expressions', () => {
            expect(
                raws('TABLE file.ctime AS "Created", status FROM "Notes" SORT file.name')
            ).toEqual(['"Notes"'])
        })

        it('reads TASK queries', () => {
            expect(raws('TASK FROM [[Project]] WHERE !completed')).toEqual(['[[Project]]'])
        })

        it('reads CALENDAR queries', () => {
            expect(raws('CALENDAR file.ctime FROM "Journal"')).toEqual(['"Journal"'])
        })

        it('is case-insensitive for keywords', () => {
            expect(raws('list from "A" where x')).toEqual(['"A"'])
            expect(raws('List From [[B]] Sort file.name')).toEqual(['[[B]]'])
        })

        it('handles multi-line queries', () => {
            expect(raws('TABLE x\nFROM "A"\n  AND [[B]]\nWHERE y')).toEqual(['"A"', '[[B]]'])
        })
    })

    describe('queries without checkable sources', () => {
        it('returns nothing without FROM', () => {
            expect(raws('LIST WHERE file.name = "x"')).toEqual([])
            expect(raws('TABLE file.name')).toEqual([])
        })

        it('returns nothing for tag-only sources', () => {
            expect(raws('LIST FROM #type/plan')).toEqual([])
            expect(raws('LIST FROM #a OR #b/c-d')).toEqual([])
        })

        it('never returns [[]] (this file)', () => {
            expect(raws('LIST FROM [[]]')).toEqual([])
            expect(raws('LIST FROM [[#Heading]]')).toEqual([])
            expect(raws('LIST FROM outgoing([[]])')).toEqual([])
        })

        it('never returns "" (whole vault)', () => {
            expect(raws('LIST FROM ""')).toEqual([])
            expect(raws('LIST FROM "/"')).toEqual([])
        })

        it('returns nothing for inline IQ expressions', () => {
            expect(raws('=this.file.name')).toEqual([])
            expect(raws('=length(filter(this.file.outlinks, (l) => true))')).toEqual([])
            expect(raws('=[[Some Note]].status')).toEqual([])
            expect(raws('="from [[X]]"')).toEqual([])
        })

        it('returns nothing for DataviewJS code', () => {
            expect(raws('dv.list(dv.pages("#tag").file.name)')).toEqual([])
        })
    })

    describe('links', () => {
        it('keeps the link path of aliased links', () => {
            expect(extractPositiveFromSources('LIST FROM [[Target|Alias]]')).toEqual([
                { kind: 'link', linkpath: 'Target', raw: '[[Target|Alias]]' }
            ])
        })

        it('drops headings and block references', () => {
            expect(extractPositiveFromSources('LIST FROM [[Target#Heading]]')[0]).toMatchObject({
                linkpath: 'Target'
            })
            expect(extractPositiveFromSources('LIST FROM [[Target#^abc]]')[0]).toMatchObject({
                linkpath: 'Target'
            })
            expect(
                extractPositiveFromSources('LIST FROM [[Folder/Target#Heading|alias]]')[0]
            ).toMatchObject({ linkpath: 'Folder/Target' })
        })

        it('reads links passed to outgoing()', () => {
            expect(raws('LIST FROM outgoing([[Hub]])')).toEqual(['[[Hub]]'])
        })

        it('does not treat keywords inside a link as boundaries', () => {
            expect(raws('LIST FROM [[Where we sort things]] WHERE x')).toEqual([
                '[[Where we sort things]]'
            ])
        })
    })

    describe('paths', () => {
        it('unescapes and trims slashes', () => {
            expect(extractPositiveFromSources('LIST FROM "Folder/Sub/"')).toEqual([
                { kind: 'path', path: 'Folder/Sub', raw: '"Folder/Sub/"' }
            ])
            expect(extractPositiveFromSources('LIST FROM "a \\"quoted\\" name"')[0]).toMatchObject({
                path: 'a "quoted" name'
            })
        })

        it('reads csv() paths', () => {
            expect(raws('TABLE x FROM csv("data/file.csv")')).toEqual(['"data/file.csv"'])
        })

        it('does not treat keywords inside a path as boundaries', () => {
            expect(raws('LIST FROM "Where/Sort/Limit" WHERE x')).toEqual(['"Where/Sort/Limit"'])
        })
    })

    describe('combinations', () => {
        it('reads AND/OR combinations with mixed quoting', () => {
            expect(raws('LIST FROM #type/plan AND [[Teach Organization (Goal)]]')).toEqual([
                '[[Teach Organization (Goal)]]'
            ])
            expect(raws('LIST FROM "A" OR [[B]] and #c or "D/E"')).toEqual([
                '"A"',
                '[[B]]',
                '"D/E"'
            ])
        })

        it('reads parenthesized groups', () => {
            expect(raws('LIST FROM (#a AND "A") OR ([[B]] AND ("C" OR [[D]]))')).toEqual([
                '"A"',
                '[[B]]',
                '"C"',
                '[[D]]'
            ])
        })

        it('reads sources without spaces around parentheses', () => {
            expect(raws('LIST FROM("A")AND([[B]])')).toEqual(['"A"', '[[B]]'])
        })
    })

    describe('negations', () => {
        it('ignores sources negated with ! or -', () => {
            expect(raws('LIST FROM "A" AND !"Archive"')).toEqual(['"A"'])
            expect(raws('LIST FROM "A" AND -"Archive"')).toEqual(['"A"'])
            expect(raws('LIST FROM #tag AND ![[Old]]')).toEqual([])
            expect(raws('LIST FROM #tag AND -[[Old]]')).toEqual([])
        })

        it('ignores sources inside negated groups', () => {
            expect(raws('LIST FROM "A" AND -("B" OR [[C]])')).toEqual(['"A"'])
            expect(raws('LIST FROM "A" AND !(("B") OR [[C]]) AND [[D]]')).toEqual(['"A"', '[[D]]'])
        })

        it('treats a double negation as positive', () => {
            expect(raws('LIST FROM !(!"A")')).toEqual(['"A"'])
        })

        it('does not carry a negation past a tag', () => {
            expect(raws('LIST FROM -#tag AND "A"')).toEqual(['"A"'])
        })

        it('ignores negated function sources', () => {
            expect(raws('LIST FROM "A" AND -outgoing([[B]])')).toEqual(['"A"'])
        })
    })

    describe('clause boundaries', () => {
        it('ignores strings and links in WHERE', () => {
            expect(raws('LIST FROM "A" WHERE contains(file.outlinks, [[B]]) AND x = "C"')).toEqual([
                '"A"'
            ])
        })

        it('ignores everything after SORT, GROUP BY, FLATTEN, LIMIT', () => {
            expect(raws('TABLE x FROM [[A]] SORT "B" desc')).toEqual(['[[A]]'])
            expect(raws('TABLE x FROM [[A]] GROUP BY [[B]]')).toEqual(['[[A]]'])
            expect(raws('TABLE x FROM [[A]] FLATTEN "B" AS y')).toEqual(['[[A]]'])
            expect(raws('LIST FROM [[A]] LIMIT 5')).toEqual(['[[A]]'])
        })

        it('ignores "from" inside header strings, links, and field names', () => {
            expect(raws('TABLE "from here" AS x FROM "A"')).toEqual(['"A"'])
            expect(raws('TABLE [[From Note]].x AS y FROM "A"')).toEqual(['"A"'])
            expect(raws('TABLE file.from FROM "A"')).toEqual(['"A"'])
            expect(raws('TABLE choice(x, "a", "b") FROM [[A]]')).toEqual(['[[A]]'])
        })

        it('ignores a FROM inside parentheses before the real one', () => {
            expect(raws('TABLE (from) AS x FROM "A"')).toEqual(['"A"'])
        })
    })

    describe('malformed input', () => {
        it('tolerates unterminated strings and links', () => {
            expect(raws('LIST FROM "Unterminated')).toEqual(['"Unterminated'])
            expect(raws('LIST FROM [[Unterminated')).toEqual(['[[Unterminated'])
        })

        it('tolerates unbalanced parentheses', () => {
            expect(raws('LIST FROM "A")) OR [[B]]')).toEqual(['"A"', '[[B]]'])
        })

        it('returns nothing for an empty query', () => {
            expect(raws('')).toEqual([])
        })
    })
})

describe('findUnresolvedFromSources', () => {
    const resolver = (links: string[], paths: string[]): FromSourceResolver => ({
        linkExists: (linkpath) => links.includes(linkpath),
        pathExists: (path) => paths.includes(path)
    })

    it('returns nothing when every source resolves', () => {
        expect(
            findUnresolvedFromSources('LIST FROM [[A|x]] AND "F"', resolver(['A'], ['F']))
        ).toEqual([])
    })

    it('returns the unresolved sources as written', () => {
        expect(
            findUnresolvedFromSources(
                'LIST FROM #type/plan AND [[Teach Organization (Goal)]] OR "Gone"',
                resolver([], [])
            )
        ).toEqual(['[[Teach Organization (Goal)]]', '"Gone"'])
    })

    it('deduplicates repeated sources', () => {
        expect(findUnresolvedFromSources('LIST FROM [[X]] OR [[X]]', resolver([], []))).toEqual([
            '[[X]]'
        ])
    })

    it('never asks about negated, tag, this-file, or whole-vault sources', () => {
        const linkExists = (): boolean => {
            throw new Error('should not be called')
        }
        expect(
            findUnresolvedFromSources('LIST FROM #t AND [[]] AND "" AND !"x" AND -[[y]]', {
                linkExists,
                pathExists: linkExists
            })
        ).toEqual([])
    })
})
