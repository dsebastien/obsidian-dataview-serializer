import { describe, expect, it } from 'bun:test'
import {
    findCodeRangeAt,
    findCodeRanges,
    indexOfOutsideCode,
    isInsideCode,
    isNestedInCode,
    matchOutsideCode,
    replaceOutsideCode
} from './code-ranges.fn'

const QUERY = '<!-- QueryToSerialize: LIST FROM #x -->'

/** Whether the first occurrence of `marker` (or its n-th) lies in code */
const inCode = (text: string, marker: string, occurrence = 0): boolean => {
    let index = -1
    for (let i = 0; i <= occurrence; i++) {
        index = text.indexOf(marker, index + 1)
    }
    if (index === -1) {
        throw new Error(`marker not found: ${marker}`)
    }
    return isInsideCode(findCodeRanges(text), index)
}

describe('findCodeRanges', () => {
    describe('fast path', () => {
        it('returns nothing for text without backticks or tilde fences', () => {
            expect(findCodeRanges(`# Note\n${QUERY}\n~~ strike ~~\n`)).toEqual([])
        })

        it('returns nothing for empty text', () => {
            expect(findCodeRanges('')).toEqual([])
        })
    })

    describe('fenced code blocks', () => {
        it.each(['```', '````', '`````', '~~~', '~~~~'])('covers a %s fence', (fence) => {
            const text = `before\n${fence}\n${QUERY}\n${fence}\nafter ${QUERY}\n`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('covers the fence lines themselves, without the trailing newline', () => {
            const text = 'a\n```js\ncode\n```\nb'
            expect(findCodeRanges(text)).toEqual([{ kind: 'fence', start: 2, end: 16 }])
            expect(text.slice(2, 16)).toBe('```js\ncode\n```')
        })

        it('accepts info strings', () => {
            for (const info of ['markdown', 'dataview', ' js title="x"', '{.class}']) {
                const text = `\`\`\`${info}\n${QUERY}\n\`\`\`\n`
                expect(inCode(text, QUERY)).toBe(true)
            }
        })

        it('does not open a backtick fence whose info string holds a backtick', () => {
            const text = `\`\`\`a\`b\n${QUERY}\n`
            expect(inCode(text, QUERY)).toBe(false)
        })

        it('allows backticks in a tilde fence info string', () => {
            const text = `~~~a\`b\n${QUERY}\n~~~\n`
            expect(inCode(text, QUERY)).toBe(true)
        })

        it('does not close with a shorter fence', () => {
            const text = `\`\`\`\`\n\`\`\`\n${QUERY}\n\`\`\`\`\nafter ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('closes with a longer fence', () => {
            const text = `\`\`\`\n${QUERY}\n\`\`\`\`\`\nafter ${QUERY}`
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('does not close with the other fence character', () => {
            const text = `\`\`\`\n~~~\n${QUERY}\n\`\`\`\nafter ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('does not close with a fence followed by text', () => {
            const text = `\`\`\`\n\`\`\` js\n${QUERY}\n\`\`\`\n`
            expect(inCode(text, QUERY)).toBe(true)
        })

        it('closes with trailing whitespace after the fence', () => {
            const text = `\`\`\`\ncode\n\`\`\`   \n${QUERY}`
            expect(inCode(text, QUERY)).toBe(false)
        })

        it('treats a nested ```dataview block in a ````markdown fence as content', () => {
            const text = [
                '````markdown',
                '```dataview',
                'LIST FROM #x',
                '```',
                QUERY,
                '````',
                `live ${QUERY}`
            ].join('\n')
            expect(findCodeRanges(text)).toHaveLength(1)
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('runs an unclosed fence to the end of the document', () => {
            const text = `ok\n\`\`\`\n${QUERY}\n\nmore ${QUERY}`
            const ranges = findCodeRanges(text)
            expect(ranges).toEqual([{ kind: 'fence', start: 3, end: text.length }])
            expect(inCode(text, QUERY, 1)).toBe(true)
        })

        it('accepts up to 3 spaces of indentation', () => {
            for (const indent of ['', ' ', '  ', '   ']) {
                const text = `${indent}\`\`\`\n${QUERY}\n${indent}\`\`\`\nafter ${QUERY}`
                expect(inCode(text, QUERY, 0)).toBe(true)
                expect(inCode(text, QUERY, 1)).toBe(false)
            }
        })

        it('accepts deeper indentation (fences nested in list items)', () => {
            const text = `- item\n    \`\`\`md\n    ${QUERY}\n    \`\`\`\n- ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('accepts tab-indented fences', () => {
            const text = `- item\n\t\`\`\`\n\t${QUERY}\n\t\`\`\`\n`
            expect(inCode(text, QUERY)).toBe(true)
        })

        it('does not treat 4-space indented lines as code (no indented code blocks)', () => {
            const text = `Paragraph\n\n    ${QUERY}\n\n- list\n    ${QUERY}\n`
            expect(findCodeRanges(text)).toEqual([])
        })

        it('handles CRLF line endings', () => {
            const text = `\`\`\`markdown\r\n${QUERY}\r\n\`\`\`\r\nafter ${QUERY}\r\n`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('handles several fences in a row', () => {
            const text = `\`\`\`\n${QUERY}\n\`\`\`\n${QUERY}\n~~~\n${QUERY}\n~~~\n${QUERY}`
            expect([0, 1, 2, 3].map((n) => inCode(text, QUERY, n))).toEqual([
                true,
                false,
                true,
                false
            ])
        })

        it('treats a fence at the very end of the document', () => {
            expect(findCodeRanges('```')).toEqual([{ kind: 'fence', start: 0, end: 3 }])
        })
    })

    describe('blockquotes and callouts', () => {
        it('detects a fence inside a callout', () => {
            const text = [
                '> [!example]',
                '> ```markdown',
                `> ${QUERY}`,
                '> ```',
                `> ${QUERY}`
            ].join('\n')
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('detects a fence inside a nested quote', () => {
            const text = `> > \`\`\`\n> > ${QUERY}\n> > \`\`\`\n> > ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('ends a quoted fence where the quote ends', () => {
            const text = `> \`\`\`\n> ${QUERY}\n\n${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
            expect(findCodeRanges(text)[0]).toEqual({
                kind: 'fence',
                start: 0,
                end: text.indexOf('\n\n')
            })
        })

        it('keeps `>` lines as content of a top-level fence', () => {
            const text = `\`\`\`\n> \`\`\`\n${QUERY}\n\`\`\`\nafter ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('does not close a quoted fence with a deeper-quoted fence', () => {
            const text = `> \`\`\`\n> > \`\`\`\n> ${QUERY}\n> \`\`\``
            expect(inCode(text, QUERY)).toBe(true)
        })
    })

    describe('inline code', () => {
        it('covers a query comment wrapped in backticks', () => {
            const text = `Write \`${QUERY}\` to add a query.\n${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('matches double backtick runs', () => {
            const text = `\`\` \`${QUERY}\` \`\` and ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
            expect(findCodeRanges(text)).toHaveLength(1)
        })

        it('only closes a span with a run of the same length', () => {
            const text = `\`\`a \` ${QUERY} \`\` ${QUERY}`
            expect(inCode(text, QUERY, 0)).toBe(true)
            expect(inCode(text, QUERY, 1)).toBe(false)
        })

        it('treats an unmatched backtick as literal text', () => {
            const text = `a \` stray ${QUERY}`
            expect(inCode(text, QUERY)).toBe(false)
        })

        it('does not span lines', () => {
            const text = `a \`open\n${QUERY}\nclose\``
            expect(inCode(text, QUERY)).toBe(false)
        })

        it('ignores an escaped backtick', () => {
            const text = `a \\\` ${QUERY} \``
            expect(inCode(text, QUERY)).toBe(false)
        })

        it('reports the exact span offsets', () => {
            const text = 'x `code` y'
            expect(findCodeRanges(text)).toEqual([{ kind: 'inline', start: 2, end: 8 }])
        })

        it('treats backticks inside an HTML comment as comment text', () => {
            const text = '<!-- QueryToSerialize: LIST WHERE a = "`x" --> and `b`'
            const ranges = findCodeRanges(text)
            expect(ranges).toEqual([
                { kind: 'inline', start: text.indexOf('`b`'), end: text.length }
            ])
        })

        it('treats backticks and fences inside a multi-line comment as comment text', () => {
            const text = [
                '<!-- DataviewJSToSerialize:',
                'const s = `a',
                '```',
                'b`',
                '-->',
                `${QUERY}`
            ].join('\n')
            expect(findCodeRanges(text)).toEqual([])
        })

        it('treats an unclosed comment opener as literal text', () => {
            const text = 'a <!-- never closed `code` b'
            expect(findCodeRanges(text)).toHaveLength(1)
        })

        it('finds spans after a comment closed on a later line', () => {
            const text = '<!-- QueryToSerialize: LIST\nFROM "`" --> `c`'
            expect(findCodeRanges(text)).toEqual([
                { kind: 'inline', start: text.indexOf('`c`'), end: text.length }
            ])
        })

        it('does not look for spans inside fences', () => {
            const text = '```\n`a`\n```'
            expect(findCodeRanges(text)).toEqual([{ kind: 'fence', start: 0, end: text.length }])
        })
    })

    it('returns sorted, non-overlapping ranges', () => {
        const text = '`a` x\n```\nb\n```\n`c` `d`\n~~~\n~~~'
        const ranges = findCodeRanges(text)
        for (let i = 1; i < ranges.length; i++) {
            expect(ranges[i]!.start).toBeGreaterThanOrEqual(ranges[i - 1]!.end)
        }
        expect(ranges.map((r) => r.kind)).toEqual(['inline', 'fence', 'inline', 'inline', 'fence'])
    })

    it('stays fast on a large document', () => {
        const chunk = `# Title\nSome \`code\` here ${QUERY}\n\`\`\`js\nconst a = 1\n\`\`\`\n`
        const text = chunk.repeat(20000)
        const start = performance.now()
        const ranges = findCodeRanges(text)
        expect(performance.now() - start).toBeLessThan(1000)
        expect(ranges).toHaveLength(40000)
    })
})

describe('findCodeRangeAt / isInsideCode / isNestedInCode', () => {
    const text = 'a `b` c\n```\nd\n```\n'
    const ranges = findCodeRanges(text)

    it('finds the range holding an offset, end excluded', () => {
        expect(findCodeRangeAt(ranges, 2)?.kind).toBe('inline')
        expect(findCodeRangeAt(ranges, 4)?.kind).toBe('inline')
        expect(findCodeRangeAt(ranges, 5)).toBeUndefined()
        expect(findCodeRangeAt(ranges, text.indexOf('d'))?.kind).toBe('fence')
        expect(isInsideCode(ranges, 0)).toBe(false)
        expect(isInsideCode([], 3)).toBe(false)
    })

    it('tells a construct starting a range from one nested in code', () => {
        expect(isNestedInCode(ranges, 2)).toBe(false)
        expect(isNestedInCode(ranges, 8)).toBe(false)
        expect(isNestedInCode(ranges, 3)).toBe(true)
        expect(isNestedInCode(ranges, 0)).toBe(false)
    })
})

describe('regex helpers', () => {
    const text = `\`\`\`\n${QUERY}\n\`\`\`\n${QUERY}\n`
    const live = text.lastIndexOf(QUERY)

    it('matchOutsideCode skips matches starting in code', () => {
        expect(matchOutsideCode(text, /<!-- QueryToSerialize: (.*?) -->/)?.index).toBe(live)
        expect(matchOutsideCode('```\nx\n```', /x/)).toBeNull()
    })

    it('matchOutsideCode does not let a match in code hide a live one it overlaps', () => {
        // A lazy match starting in the fence runs over the live query
        const overlap = `\`\`\`\nSTART\n\`\`\`\nSTART END\n`
        const match = matchOutsideCode(overlap, /START[\s\S]*?END/)
        expect(match?.index).toBe(overlap.lastIndexOf('START'))
    })

    it('replaceOutsideCode replaces every live match for a global regex', () => {
        const doubled = `${text}${QUERY}\n`
        const result = replaceOutsideCode(doubled, /<!-- QueryToSerialize: [^>]*-->/g, () => 'X')
        expect(result).toBe(`\`\`\`\n${QUERY}\n\`\`\`\nX\nX\n`)
    })

    it('replaceOutsideCode replaces only the first live match without the global flag', () => {
        const doubled = `${text}${QUERY}\n`
        const result = replaceOutsideCode(doubled, /<!-- QueryToSerialize: [^>]*-->/, () => 'X')
        expect(result).toBe(`\`\`\`\n${QUERY}\n\`\`\`\nX\n${QUERY}\n`)
    })

    it('replaceOutsideCode returns the text unchanged when every match is in code', () => {
        expect(replaceOutsideCode('`a`', /a/g, () => 'b')).toBe('`a`')
    })

    it('replaceOutsideCode passes the match to the replacer', () => {
        expect(replaceOutsideCode('x1 `x2` x3', /x(\d)/g, (m) => `y${m[1]}`)).toBe('y1 `x2` y3')
    })

    it('indexOfOutsideCode skips occurrences in code', () => {
        expect(indexOfOutsideCode(text, QUERY)).toBe(live)
        expect(indexOfOutsideCode('`a`', 'a')).toBe(-1)
    })
})
