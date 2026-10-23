/**
 * Extraction of the sources a DQL query reads from (its `FROM` clause).
 *
 * Queries live in HTML comments, and Obsidian does not update links inside
 * comments when a note or folder is renamed. A `FROM [[Old name]]` or
 * `FROM "Old/folder"` then silently yields nothing. This module finds the
 * sources that MUST exist for the result to be meaningful, so the caller can
 * refuse to overwrite a good result with an empty one.
 *
 * Only *positive* sources are returned: a negated source (`!"x"`, `-[[x]]`,
 * `-("a" or "b")`) pointing at something missing excludes nothing, which is
 * harmless. Tags are never returned: an unused tag legitimately matches
 * nothing. `[[]]` (this file) and `""` (whole vault) always resolve.
 *
 * Pure: no Obsidian API, so it can be unit tested in isolation.
 */

/** A source of a `FROM` clause that must resolve to an existing vault entry */
export type FromSource =
    | {
          kind: 'link'
          /** Link path, without alias, heading, or block reference */
          linkpath: string
          /** The source as written, e.g. `[[Target|alias]]` */
          raw: string
      }
    | {
          kind: 'path'
          /** Unescaped path, without leading/trailing slashes */
          path: string
          /** The source as written, e.g. `"folder/sub"` */
          raw: string
      }

type Token =
    | { type: 'string'; value: string; raw: string }
    | { type: 'link'; inner: string; raw: string }
    | { type: 'tag' }
    | { type: 'word'; value: string }
    | { type: 'lparen' }
    | { type: 'rparen' }
    | { type: 'op'; value: string }

/** Keywords that end the FROM clause (`GROUP BY` ends at `GROUP`) */
const FROM_CLAUSE_TERMINATORS = new Set(['where', 'sort', 'group', 'flatten', 'limit'])

const WORD_CHAR = /[\p{L}\p{N}_.]/u
const WHITESPACE = /\s/

/**
 * Split a query into tokens. Strings (`"..."` with backslash escapes) and
 * links (`[[...]]`) are atomic, so keywords inside them are never mistaken
 * for clause boundaries. Unterminated strings/links run to the end.
 */
function tokenize(query: string): Token[] {
    const tokens: Token[] = []
    let i = 0

    while (i < query.length) {
        const char = query[i]!

        if (WHITESPACE.test(char)) {
            i++
            continue
        }

        if (char === '"') {
            let value = ''
            let j = i + 1
            while (j < query.length && query[j] !== '"') {
                if (query[j] === '\\' && j + 1 < query.length) {
                    value += query[j + 1]
                    j += 2
                    continue
                }
                value += query[j]
                j++
            }
            const end = Math.min(j + 1, query.length)
            tokens.push({ type: 'string', value, raw: query.slice(i, end) })
            i = end
            continue
        }

        if (char === '[' && query[i + 1] === '[') {
            const close = query.indexOf(']]', i + 2)
            const end = close === -1 ? query.length : close + 2
            const inner = query.slice(i + 2, close === -1 ? query.length : close)
            tokens.push({ type: 'link', inner, raw: query.slice(i, end) })
            i = end
            continue
        }

        if (char === '#') {
            let j = i + 1
            while (j < query.length && !WHITESPACE.test(query[j]!) && query[j] !== ')') {
                j++
            }
            tokens.push({ type: 'tag' })
            i = j
            continue
        }

        if (char === '(') {
            tokens.push({ type: 'lparen' })
            i++
            continue
        }

        if (char === ')') {
            tokens.push({ type: 'rparen' })
            i++
            continue
        }

        if (WORD_CHAR.test(char)) {
            let j = i + 1
            while (j < query.length && WORD_CHAR.test(query[j]!)) {
                j++
            }
            tokens.push({ type: 'word', value: query.slice(i, j) })
            i = j
            continue
        }

        tokens.push({ type: 'op', value: char })
        i++
    }

    return tokens
}

/**
 * Return the tokens of the FROM clause, or undefined when the query has none.
 * FROM is only recognized outside parentheses, strings and links.
 */
function fromClauseTokens(tokens: Token[]): Token[] | undefined {
    let depth = 0
    let start = -1

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!
        if (token.type === 'lparen') {
            depth++
        } else if (token.type === 'rparen') {
            depth = Math.max(0, depth - 1)
        } else if (depth === 0 && token.type === 'word' && token.value.toLowerCase() === 'from') {
            start = i + 1
            break
        }
    }

    if (start === -1) {
        return undefined
    }

    depth = 0
    let end = tokens.length
    for (let i = start; i < tokens.length; i++) {
        const token = tokens[i]!
        if (token.type === 'lparen') {
            depth++
        } else if (token.type === 'rparen') {
            depth = Math.max(0, depth - 1)
        } else if (
            depth === 0 &&
            token.type === 'word' &&
            FROM_CLAUSE_TERMINATORS.has(token.value.toLowerCase())
        ) {
            end = i
            break
        }
    }

    return tokens.slice(start, end)
}

/** `Target|alias`, `Target#heading`, `Target#^block` → `Target` */
function linkpathOf(inner: string): string {
    const withoutAlias = inner.split('|')[0] ?? ''
    return (withoutAlias.split('#')[0] ?? '').trim()
}

/** Strip the slashes Dataview tolerates around folder paths */
function normalizeSourcePath(path: string): string {
    return path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

/**
 * Extract the positive link and path sources of a DQL query's FROM clause.
 *
 * Returns an empty array for queries without FROM (including inline
 * expressions and DataviewJS), for tag-only sources, and for sources that
 * always resolve (`[[]]`, `""`).
 */
export function extractPositiveFromSources(query: string): FromSource[] {
    const clause = fromClauseTokens(tokenize(query))
    if (!clause) {
        return []
    }

    const sources: FromSource[] = []
    // Negation of each enclosing group; a negated group flips its content
    const negationStack: boolean[] = [false]
    // A `!` / `-` waiting for the atom or group it applies to
    let pendingNegation = false
    const currentNegation = (): boolean => negationStack[negationStack.length - 1] ?? false

    for (const token of clause) {
        switch (token.type) {
            case 'op':
                if (token.value === '!' || token.value === '-') {
                    pendingNegation = !pendingNegation
                } else {
                    pendingNegation = false
                }
                break
            case 'lparen':
                negationStack.push(currentNegation() !== pendingNegation)
                pendingNegation = false
                break
            case 'rparen':
                if (negationStack.length > 1) {
                    negationStack.pop()
                }
                pendingNegation = false
                break
            case 'word': {
                // A function name (`outgoing`, `csv`) keeps the pending negation
                // for the group that follows; boolean operators reset it.
                const lower = token.value.toLowerCase()
                if (lower === 'and' || lower === 'or') {
                    pendingNegation = false
                }
                break
            }
            case 'tag':
                pendingNegation = false
                break
            case 'string': {
                const negated = currentNegation() !== pendingNegation
                pendingNegation = false
                const path = normalizeSourcePath(token.value)
                if (!negated && path !== '') {
                    sources.push({ kind: 'path', path, raw: token.raw })
                }
                break
            }
            case 'link': {
                const negated = currentNegation() !== pendingNegation
                pendingNegation = false
                const linkpath = linkpathOf(token.inner)
                if (!negated && linkpath !== '') {
                    sources.push({ kind: 'link', linkpath, raw: token.raw })
                }
                break
            }
        }
    }

    return sources
}

/** How the caller checks that a source exists in the vault */
export interface FromSourceResolver {
    /** True when the link path resolves to a file, from the query's note */
    linkExists: (linkpath: string) => boolean
    /** True when the path is an existing folder or file (with or without `.md`) */
    pathExists: (path: string) => boolean
}

/**
 * The positive FROM sources of a query that do not resolve, as written in the
 * query (deduplicated). Empty when everything resolves or nothing is checked.
 */
export function findUnresolvedFromSources(query: string, resolver: FromSourceResolver): string[] {
    const unresolved: string[] = []

    for (const source of extractPositiveFromSources(query)) {
        const exists =
            source.kind === 'link'
                ? resolver.linkExists(source.linkpath)
                : resolver.pathExists(source.path)
        if (!exists && !unresolved.includes(source.raw)) {
            unresolved.push(source.raw)
        }
    }

    return unresolved
}
