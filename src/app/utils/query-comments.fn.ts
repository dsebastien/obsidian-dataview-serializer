import {
    INLINE_QUERY_FLAG_MANUAL_OPEN,
    INLINE_QUERY_FLAG_MANUAL_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    INLINE_QUERY_FLAG_ONCE_OPEN,
    INLINE_QUERY_FLAG_ONCE_OPEN_ALT,
    INLINE_QUERY_FLAG_OPEN,
    INLINE_QUERY_FLAG_OPEN_ALT,
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_MANUAL_OPEN,
    QUERY_FLAG_MANUAL_OPEN_ALT,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN,
    QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT,
    QUERY_FLAG_ONCE_OPEN,
    QUERY_FLAG_ONCE_OPEN_ALT,
    QUERY_FLAG_OPEN,
    QUERY_FLAG_OPEN_ALT,
    SERIALIZED_QUERY_START,
    SERIALIZED_QUERY_START_ALT
} from '../constants'
import { findQueryReferences, type QueryReference } from './extract-from-sources.fn'

/**
 * Location of the DQL query comments of a note, and in-place rewriting of
 * the references (links, FROM paths) they contain.
 *
 * Covered: block query definitions (every update mode, legacy and
 * `dataview-serializer-*` syntax, single- and multi-line), inline query
 * definitions (`<!-- IQ: … -->` and variants), and the result header
 * (`<!-- SerializedQuery: … -->` / `<!-- dataview-serializer-result: … -->`)
 * that repeats the query. DataviewJS is out of scope: its references live in
 * JavaScript strings that cannot be parsed reliably.
 *
 * Pure: no Obsidian API.
 */

/** What a query comment holds */
export type QueryCommentKind = 'definition' | 'inline-definition' | 'result-header'

/** A query comment of a note */
export interface QueryComment {
    kind: QueryCommentKind
    /** Offset of the comment opener (`<!--`) */
    start: number
    /** Offset of the first character after the opener (start of the query text) */
    bodyStart: number
    /** Offset of the closing `-->` (end of the query text) */
    bodyEnd: number
    /** The query text, as written (may span several lines) */
    body: string
}

const COMMENT_OPENER = '<!--'
const COMMENT_CLOSER = QUERY_FLAG_CLOSE.trim()

/**
 * Comment openers, without their trailing space. Each ends with a colon, so
 * none is a prefix of another.
 */
const OPENERS: ReadonlyArray<{ opener: string; kind: QueryCommentKind }> = [
    ...[
        QUERY_FLAG_OPEN,
        QUERY_FLAG_MANUAL_OPEN,
        QUERY_FLAG_ONCE_OPEN,
        QUERY_FLAG_ONCE_AND_EJECT_OPEN,
        QUERY_FLAG_OPEN_ALT,
        QUERY_FLAG_MANUAL_OPEN_ALT,
        QUERY_FLAG_ONCE_OPEN_ALT,
        QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT
    ].map((flag) => ({ opener: flag.trim(), kind: 'definition' as const })),
    ...[
        INLINE_QUERY_FLAG_OPEN,
        INLINE_QUERY_FLAG_MANUAL_OPEN,
        INLINE_QUERY_FLAG_ONCE_OPEN,
        INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN,
        INLINE_QUERY_FLAG_OPEN_ALT,
        INLINE_QUERY_FLAG_MANUAL_OPEN_ALT,
        INLINE_QUERY_FLAG_ONCE_OPEN_ALT,
        INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT
    ].map((flag) => ({ opener: flag.trim(), kind: 'inline-definition' as const })),
    ...[SERIALIZED_QUERY_START, SERIALIZED_QUERY_START_ALT].map((flag) => ({
        opener: flag.trim(),
        kind: 'result-header' as const
    }))
]

/**
 * Cheap test: may the content hold a query comment? An over-approximation
 * used to skip notes without reading their structure.
 */
export function mayContainQueryComment(content: string): boolean {
    return content.includes(COMMENT_OPENER)
}

/**
 * Every query comment of a note, in document order. An opener without a
 * closing `-->` is ignored, like the query parsers do.
 */
export function findQueryComments(content: string): QueryComment[] {
    const comments: QueryComment[] = []
    let position = content.indexOf(COMMENT_OPENER)

    while (position !== -1) {
        const match = OPENERS.find(({ opener }) => content.startsWith(opener, position))
        if (!match) {
            position = content.indexOf(COMMENT_OPENER, position + COMMENT_OPENER.length)
            continue
        }

        const bodyStart = position + match.opener.length
        const bodyEnd = content.indexOf(COMMENT_CLOSER, bodyStart)
        if (bodyEnd === -1) {
            break
        }

        comments.push({
            kind: match.kind,
            start: position,
            bodyStart,
            bodyEnd,
            body: content.slice(bodyStart, bodyEnd)
        })
        position = content.indexOf(COMMENT_OPENER, bodyEnd + COMMENT_CLOSER.length)
    }

    return comments
}

/**
 * Decides the new text of one reference. Returns the replacement for
 * `reference.raw`, or null to leave it as is.
 */
export type ReferenceRewriter = (reference: QueryReference, comment: QueryComment) => string | null

/** Outcome of rewriting the query comments of a note */
export interface QueryCommentsRewrite {
    content: string
    /** Query definitions (block or inline) whose text changed */
    queriesUpdated: number
    /**
     * Positions, in {@link findQueryComments} order, of the comments whose
     * text changed (result headers included)
     */
    changedComments: number[]
}

/**
 * Rewrite references inside the query comments of a note. Only the text of
 * the rewritten references changes: everything outside query comments,
 * including line endings (CRLF stays CRLF), is kept byte for byte.
 */
export function rewriteQueryComments(
    content: string,
    rewrite: ReferenceRewriter
): QueryCommentsRewrite {
    let output = ''
    let copiedUpTo = 0
    let queriesUpdated = 0
    const changedComments: number[] = []

    findQueryComments(content).forEach((comment, index) => {
        let newBody = ''
        let bodyCopiedUpTo = 0
        let changed = false

        for (const reference of findQueryReferences(comment.body)) {
            const replacement = rewrite(reference, comment)
            if (replacement === null || replacement === reference.raw) {
                continue
            }
            newBody += comment.body.slice(bodyCopiedUpTo, reference.start) + replacement
            bodyCopiedUpTo = reference.end
            changed = true
        }

        if (!changed) {
            return
        }

        newBody += comment.body.slice(bodyCopiedUpTo)
        output += content.slice(copiedUpTo, comment.bodyStart) + newBody
        copiedUpTo = comment.bodyEnd
        changedComments.push(index)
        if (comment.kind !== 'result-header') {
            queriesUpdated++
        }
    })

    if (changedComments.length === 0) {
        return { content, queriesUpdated: 0, changedComments }
    }

    output += content.slice(copiedUpTo)
    return { content: output, queriesUpdated, changedComments }
}
