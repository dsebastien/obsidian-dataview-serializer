import { describe, expect, it } from 'bun:test'
import {
    findQueryComments,
    mayContainQueryComment,
    rewriteQueryComments,
    type QueryCommentKind
} from './query-comments.fn'

describe('findQueryComments', () => {
    it('finds every block flag, legacy and alternative', () => {
        const content = [
            '<!-- QueryToSerialize: LIST FROM [[A]] -->',
            '<!-- QueryToSerializeManual: LIST FROM [[B]] -->',
            '<!-- QueryToSerializeOnce: LIST FROM [[C]] -->',
            '<!-- QueryToSerializeOnceAndEject: LIST FROM [[D]] -->',
            '<!-- dataview-serializer-query: LIST FROM [[E]] -->',
            '<!-- dataview-serializer-query-manual: LIST FROM [[F]] -->',
            '<!-- dataview-serializer-query-once: LIST FROM [[G]] -->',
            '<!-- dataview-serializer-query-once-and-eject: LIST FROM [[H]] -->'
        ].join('\n')

        const comments = findQueryComments(content)
        expect(comments.map((c) => c.kind)).toEqual(Array<QueryCommentKind>(8).fill('definition'))
        expect(comments.map((c) => c.body.trim())).toEqual(
            'ABCDEFGH'.split('').map((letter) => `LIST FROM [[${letter}]]`)
        )
    })

    it('finds inline flags and result headers', () => {
        const content = [
            'Value: <!-- IQ: =[[A]].x -->1<!-- /IQ -->',
            '<!-- IQManual: =[[B]].x -->2<!-- /IQ -->',
            '<!-- dataview-serializer-iq-once: =[[C]].x -->3<!-- /dataview-serializer-iq -->',
            '<!-- SerializedQuery: LIST FROM [[D]] -->',
            '<!-- SerializedQuery END -->',
            '<!-- dataview-serializer-result: LIST FROM [[E]] -->',
            '<!-- dataview-serializer-result-end -->'
        ].join('\n')

        expect(findQueryComments(content).map((c) => [c.kind, c.body.trim()])).toEqual([
            ['inline-definition', '=[[A]].x'],
            ['inline-definition', '=[[B]].x'],
            ['inline-definition', '=[[C]].x'],
            ['result-header', 'LIST FROM [[D]]'],
            ['result-header', 'LIST FROM [[E]]']
        ])
    })

    it('ignores DataviewJS, end markers, plain comments and unclosed openers', () => {
        const content = [
            '<!-- DataviewJSToSerialize: dv.list(dv.pages("[[A]]")) -->',
            '<!-- just a comment [[B]] -->',
            '<!-- /IQ -->',
            '<!-- QueryToSerialize: LIST FROM [[C]]'
        ].join('\n')

        expect(findQueryComments(content)).toEqual([])
    })

    it('spans multi-line definitions', () => {
        const content = '<!-- QueryToSerialize: LIST\nFROM [[A]]\nSORT file.name -->\nafter'
        const [comment] = findQueryComments(content)
        expect(comment?.body).toBe(' LIST\nFROM [[A]]\nSORT file.name ')
        expect(content.slice(comment!.bodyEnd)).toStartWith('-->')
    })

    it('has a cheap presence test', () => {
        expect(mayContainQueryComment('no comment')).toBe(false)
        expect(mayContainQueryComment('<!-- x -->')).toBe(true)
    })
})

describe('rewriteQueryComments', () => {
    const renameA = (content: string) =>
        rewriteQueryComments(content, (reference) =>
            reference.kind === 'link' && reference.target === 'A' ? '[[Z]]' : null
        )

    it('only rewrites inside query comments', () => {
        const content =
            '[[A]]\n<!-- QueryToSerialize: LIST FROM [[A]] -->\n- [[A]]\n<!-- note [[A]] -->'
        const result = renameA(content)
        expect(result.content).toBe(
            '[[A]]\n<!-- QueryToSerialize: LIST FROM [[Z]] -->\n- [[A]]\n<!-- note [[A]] -->'
        )
        expect(result.queriesUpdated).toBe(1)
        expect(result.changedComments).toEqual([0])
    })

    it('counts result headers as changed comments, not as queries', () => {
        const content =
            '<!-- QueryToSerialize: LIST FROM [[A]] -->\n<!-- SerializedQuery: LIST FROM [[A]] -->\n- x\n<!-- SerializedQuery END -->'
        const result = renameA(content)
        expect(result.content).toBe(
            '<!-- QueryToSerialize: LIST FROM [[Z]] -->\n<!-- SerializedQuery: LIST FROM [[Z]] -->\n- x\n<!-- SerializedQuery END -->'
        )
        expect(result.queriesUpdated).toBe(1)
        expect(result.changedComments).toEqual([0, 1])
    })

    it('rewrites several references in one comment', () => {
        const result = renameA(
            '<!-- QueryToSerialize: LIST FROM [[A]] OR [[B]] WHERE contains(file.outlinks, [[A]]) -->'
        )
        expect(result.content).toBe(
            '<!-- QueryToSerialize: LIST FROM [[Z]] OR [[B]] WHERE contains(file.outlinks, [[Z]]) -->'
        )
    })

    it('keeps CRLF line endings', () => {
        const content =
            'a\r\n<!-- QueryToSerialize: LIST\r\nFROM [[A]]\r\n-->\r\n<!-- SerializedQuery: LIST FROM [[A]] -->\r\nb\r\n'
        expect(renameA(content).content).toBe(
            'a\r\n<!-- QueryToSerialize: LIST\r\nFROM [[Z]]\r\n-->\r\n<!-- SerializedQuery: LIST FROM [[Z]] -->\r\nb\r\n'
        )
    })

    it('returns the same content when nothing changes', () => {
        const content = '<!-- QueryToSerialize: LIST FROM [[B]] -->'
        const result = renameA(content)
        expect(result.content).toBe(content)
        expect(result.changedComments).toEqual([])
        expect(result.queriesUpdated).toBe(0)
    })
})
