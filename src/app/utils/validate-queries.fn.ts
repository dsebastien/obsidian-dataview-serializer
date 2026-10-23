import { getBlockquotePrefix, stripBlockquoteMarkers } from './blockquote.fn'
import { findQueryReferences, findUnresolvedFromSources } from './extract-from-sources.fn'
import { isSupportedQueryType } from './is-supported-query-type.fn'
import {
    findQueryComments,
    mayContainQueryComment,
    rewriteQueryComments,
    type QueryComment
} from './query-comments.fn'

/**
 * Static validation of the queries of a note (#89), and the fix for
 * self-references written by name.
 *
 * Checks, without running Dataview:
 * - positive FROM sources that do not resolve (same rules as #88);
 * - links to the note itself written by name or path (`[[My note]]`), which
 *   break when the note is renamed and should be `[[]]`.
 *
 * Dataview errors need the query to run; the caller adds them (opt-in).
 *
 * Pure: link and path resolution are injected.
 */

/** A problem found in a query */
export type QueryProblem =
    | {
          type: 'unresolved-link' | 'unresolved-path'
          /** The source as written, e.g. `[[Old name]]` or `"Old/folder"` */
          reference: string
          message: string
      }
    | {
          type: 'self-reference'
          /** The link as written, e.g. `[[My note]]` */
          reference: string
          /** True when replacing it with `[[]]` is safe (no heading or block) */
          fixable: boolean
          message: string
      }
    | {
          type: 'dataview-error'
          message: string
      }

/** A validated query and its problems */
export interface QueryValidationIssue {
    /** The query text, whitespace-normalized (as the plugin serializes it) */
    query: string
    /** Block query (`LIST`, `TABLE`, `TASK`) or inline expression (`=…`) */
    queryType: 'block' | 'inline'
    problems: QueryProblem[]
}

/** A query of a note, as validated */
export interface ValidatedQuery {
    query: string
    queryType: 'block' | 'inline'
}

/** How the caller resolves references, from the note holding the queries */
export interface QueryValidationContext {
    /** Vault path of the note holding the queries */
    notePath: string
    /** Where a link path leads (vault path), or null when unresolved */
    resolveLink: (linkpath: string) => string | null
    /** True when the path is an existing folder or file (with or without `.md`) */
    pathExists: (path: string) => boolean
}

/** The whitespace-normalized query held by a definition comment */
function normalizedQueryOf(content: string, comment: QueryComment): string {
    const lineStart = content.lastIndexOf('\n', comment.start) + 1
    const inBlockquote = getBlockquotePrefix(content.slice(lineStart, comment.start)) !== ''
    return comment.body
        .split('\n')
        .map((line, index) =>
            inBlockquote && index > 0 ? stripBlockquoteMarkers(line).trim() : line.trim()
        )
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * The DQL queries of a note that the plugin serializes (block queries of a
 * supported type, inline expressions), in document order, with the comment
 * holding each. Result headers are not queries.
 */
export function findValidatableQueries(
    content: string
): Array<ValidatedQuery & { comment: QueryComment }> {
    if (!mayContainQueryComment(content)) {
        return []
    }

    const queries: Array<ValidatedQuery & { comment: QueryComment }> = []
    for (const comment of findQueryComments(content)) {
        if (comment.kind === 'result-header') {
            continue
        }
        const query = normalizedQueryOf(content, comment)
        if (comment.kind === 'definition' && isSupportedQueryType(query)) {
            queries.push({ query, queryType: 'block', comment })
        } else if (comment.kind === 'inline-definition' && query.startsWith('=')) {
            queries.push({ query, queryType: 'inline', comment })
        }
    }
    return queries
}

/** True when a link written as `[[inner]]` has a heading or block part */
const hasSubpath = (raw: string): boolean => (raw.split('|')[0] ?? '').includes('#')

/** The self-references of a query: links to the note itself, written by name or path */
function findSelfReferences(
    query: string,
    context: QueryValidationContext
): Array<{ raw: string; fixable: boolean }> {
    const found: Array<{ raw: string; fixable: boolean }> = []
    for (const reference of findQueryReferences(query)) {
        if (
            reference.kind === 'link' &&
            reference.target !== '' &&
            context.resolveLink(reference.target) === context.notePath &&
            !found.some((existing) => existing.raw === reference.raw)
        ) {
            found.push({ raw: reference.raw, fixable: !hasSubpath(reference.raw) })
        }
    }
    return found
}

/** Validate one query */
export function validateQuery(query: string, context: QueryValidationContext): QueryProblem[] {
    const problems: QueryProblem[] = []

    for (const raw of findUnresolvedFromSources(query, {
        linkExists: (linkpath) => context.resolveLink(linkpath) !== null,
        pathExists: context.pathExists
    })) {
        problems.push(
            raw.startsWith('[[')
                ? {
                      type: 'unresolved-link',
                      reference: raw,
                      message: `${raw} does not resolve to any note`
                  }
                : {
                      type: 'unresolved-path',
                      reference: raw,
                      message: `${raw} is not an existing folder or file`
                  }
        )
    }

    for (const { raw, fixable } of findSelfReferences(query, context)) {
        problems.push({
            type: 'self-reference',
            reference: raw,
            fixable,
            message: fixable
                ? `${raw} links to this note by name; use [[]] so it survives renames`
                : `${raw} links to this note by name; it breaks if the note is renamed`
        })
    }

    return problems
}

/**
 * Validate every distinct query of a note (the plugin treats repeated queries
 * as one). Every query is returned, with an empty `problems` list when it is
 * fine, so the caller can run further checks on it.
 */
export function validateNoteQueries(
    content: string,
    context: QueryValidationContext
): { queryCount: number; results: QueryValidationIssue[] } {
    const queries = findValidatableQueries(content)
    const results: QueryValidationIssue[] = []
    const seen = new Set<string>()

    for (const { query, queryType } of queries) {
        if (seen.has(query)) {
            continue
        }
        seen.add(query)
        results.push({ query, queryType, problems: validateQuery(query, context) })
    }

    return { queryCount: queries.length, results }
}

/**
 * Replace the fixable self-references of a note's queries with `[[]]`, in the
 * definitions and in their result headers (kept in sync).
 *
 * @param targetQuery only fix this query (normalized text, as reported)
 * @returns the new content and the number of queries changed
 */
export function fixSelfReferences(
    content: string,
    context: QueryValidationContext,
    targetQuery?: string
): { content: string; queriesFixed: number } {
    const result = rewriteQueryComments(content, (reference, comment) => {
        if (
            reference.kind !== 'link' ||
            reference.target === '' ||
            hasSubpath(reference.raw) ||
            context.resolveLink(reference.target) !== context.notePath
        ) {
            return null
        }
        if (targetQuery !== undefined && normalizedQueryOf(content, comment) !== targetQuery) {
            return null
        }
        return '[[]]'
    })
    return { content: result.content, queriesFixed: result.queriesUpdated }
}

/** True for a self-reference that {@link fixSelfReferences} can replace with `[[]]` */
export const isFixableSelfReference = (problem: QueryProblem): boolean =>
    problem.type === 'self-reference' && problem.fixable
