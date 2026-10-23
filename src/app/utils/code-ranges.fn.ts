/**
 * Where a note holds code: fenced code blocks and inline code spans.
 *
 * Query comments written inside code are examples (documentation), never live
 * queries. Every query parser, the serializer's regex matching, the editor
 * decorations, validation and the rename rewriter consult these ranges, so the
 * fence rules live in this one place.
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/91
 *
 * Rules (CommonMark, simplified where noted):
 * - Opening fence: a line of 3+ backticks or 3+ tildes, optionally followed by
 *   an info string (a backtick fence's info string cannot hold a backtick).
 *   Any leading whitespace is accepted, not just 0–3 spaces: list containers
 *   are not parsed, and a fence nested in a list item sits deeper than that.
 * - Closing fence: same character, at least as long as the opener, nothing but
 *   whitespace around it. Shorter or different runs are content, so a ```` ```dataview ````
 *   inside a ```` ````markdown ```` block is part of the outer block.
 * - An unclosed fence runs to the end of the document.
 * - Blockquotes and callouts: `>` markers are stripped before detection. A fence
 *   opened inside a quote ends where the quote ends (a line with fewer `>`).
 * - Indented code blocks (4+ spaces) are NOT code here: without list parsing,
 *   list continuation lines would be false positives, silently hiding live
 *   queries.
 * - Inline code: a backtick run closed by a run of the same length on the same
 *   line (spans do not cross lines here). An unmatched run is literal text.
 *   `\`` is an escaped backtick. HTML comments are opaque, as in CommonMark
 *   (whichever of a code span or a comment starts first wins), so backticks
 *   inside a query comment (DataviewJS template literals) never open a span. A
 *   comment spanning lines suspends fence detection until its `-->`.
 *
 * Linear in the document length. Pure: no Obsidian API.
 */

/** What kind of code a range covers */
export type CodeRangeKind = 'fence' | 'inline'

/** A code region of a document, `[start, end)` in character offsets */
export interface CodeRange {
    kind: CodeRangeKind
    /** Fence: start of the opening fence line. Inline: the opening backtick. */
    start: number
    /** Fence: end of the closing fence line (newline excluded). Inline: after the closing backtick. */
    end: number
}

const COMMENT_OPENER = '<!--'
const COMMENT_CLOSER = '-->'
const FENCE_OPEN_REGEX = /^[ \t]*(`{3,}|~{3,})([^\n]*)$/
const FENCE_CLOSE_REGEX = /^[ \t]*(`{3,}|~{3,})[ \t\r]*$/
const QUOTE_MARKER_REGEX = /^[ \t]*>/

interface OpenFence {
    char: string
    length: number
    quoteDepth: number
    start: number
}

/**
 * Strip up to `max` blockquote markers from a line.
 * @returns the number stripped and the rest of the line
 */
function stripQuoteMarkers(line: string, max: number): { depth: number; rest: string } {
    let rest = line
    let depth = 0
    while (depth < max) {
        const marker = QUOTE_MARKER_REGEX.exec(rest)
        if (!marker) {
            break
        }
        rest = rest.slice(marker[0].length)
        depth++
    }
    return { depth, rest }
}

/** Length of the run of `char` starting at `index` */
function runLength(line: string, index: number, char: string): number {
    let end = index
    while (line[end] === char) {
        end++
    }
    return end - index
}

/**
 * Scan one line (outside fences) for inline code spans and comments.
 *
 * @param line The line text
 * @param from Where to start scanning in the line
 * @param lineStart Offset of the line in the document
 * @param ranges Receives the inline code ranges
 * @param commentCloserExistsAfter Whether a `-->` exists after the given document offset
 * @returns true when the line ends inside an HTML comment that continues on later lines
 */
function scanInline(
    line: string,
    from: number,
    lineStart: number,
    ranges: CodeRange[],
    commentCloserExistsAfter: (offset: number) => boolean
): boolean {
    let index = from
    while (index < line.length) {
        const char = line[index]
        if (char === '\\') {
            index += 2
            continue
        }
        if (char === '`') {
            const length = runLength(line, index, '`')
            let search = index + length
            let closed = false
            while (search < line.length) {
                const next = line.indexOf('`', search)
                if (next === -1) {
                    break
                }
                const nextLength = runLength(line, next, '`')
                if (nextLength === length) {
                    ranges.push({
                        kind: 'inline',
                        start: lineStart + index,
                        end: lineStart + next + length
                    })
                    index = next + length
                    closed = true
                    break
                }
                search = next + nextLength
            }
            if (!closed) {
                index += length
            }
            continue
        }
        if (char === '<' && line.startsWith(COMMENT_OPENER, index)) {
            const closer = line.indexOf(COMMENT_CLOSER, index + COMMENT_OPENER.length)
            if (closer !== -1) {
                index = closer + COMMENT_CLOSER.length
                continue
            }
            // A comment left open: it spans the following lines when it is closed
            // somewhere later, otherwise the opener is literal text.
            if (commentCloserExistsAfter(lineStart + index + COMMENT_OPENER.length)) {
                return true
            }
            index += COMMENT_OPENER.length
            continue
        }
        index++
    }
    return false
}

/**
 * The code ranges of a document, sorted and non-overlapping.
 *
 * @param text The document text (LF or CRLF line endings)
 * @returns The fenced code blocks and inline code spans
 */
export function findCodeRanges(text: string): CodeRange[] {
    // Fast path: no backtick and no tilde fence, no code
    if (!text.includes('`') && !text.includes('~~~')) {
        return []
    }

    const ranges: CodeRange[] = []
    const lastCommentCloser = text.lastIndexOf(COMMENT_CLOSER)
    const commentCloserExistsAfter = (offset: number): boolean => lastCommentCloser >= offset

    let fence: OpenFence | null = null
    let inComment = false
    let lineStart = 0

    while (lineStart <= text.length) {
        const newline = text.indexOf('\n', lineStart)
        const lineEnd = newline === -1 ? text.length : newline
        const line = text.slice(lineStart, lineEnd)

        if (fence) {
            const { depth, rest } = stripQuoteMarkers(line, fence.quoteDepth)
            if (depth < fence.quoteDepth) {
                // The blockquote holding the fence ended: so did the fence
                ranges.push({
                    kind: 'fence',
                    start: fence.start,
                    end: Math.max(lineStart - 1, fence.start)
                })
                fence = null
                // Fall through: the line itself is outside the fence
            } else {
                const close = FENCE_CLOSE_REGEX.exec(rest)
                const run = close?.[1]
                if (run && run[0] === fence.char && run.length >= fence.length) {
                    ranges.push({ kind: 'fence', start: fence.start, end: lineEnd })
                    fence = null
                }
                if (newline === -1) {
                    break
                }
                lineStart = newline + 1
                continue
            }
        }

        let scanFrom = 0
        if (inComment) {
            const closer = line.indexOf(COMMENT_CLOSER)
            if (closer === -1) {
                if (newline === -1) {
                    break
                }
                lineStart = newline + 1
                continue
            }
            inComment = false
            scanFrom = closer + COMMENT_CLOSER.length
        }

        if (scanFrom === 0) {
            const { depth, rest } = stripQuoteMarkers(line, Number.POSITIVE_INFINITY)
            const open = FENCE_OPEN_REGEX.exec(rest)
            const run = open?.[1]
            if (run && !(run[0] === '`' && (open[2] ?? '').includes('`'))) {
                fence = { char: run[0]!, length: run.length, quoteDepth: depth, start: lineStart }
                if (newline === -1) {
                    break
                }
                lineStart = newline + 1
                continue
            }
        }

        inComment = scanInline(line, scanFrom, lineStart, ranges, commentCloserExistsAfter)

        if (newline === -1) {
            break
        }
        lineStart = newline + 1
    }

    if (fence) {
        ranges.push({ kind: 'fence', start: fence.start, end: text.length })
    }

    return ranges
}

/**
 * The code range holding the given offset, if any.
 *
 * @param ranges Ranges from {@link findCodeRanges}
 * @param offset A document offset
 */
export function findCodeRangeAt(
    ranges: readonly CodeRange[],
    offset: number
): CodeRange | undefined {
    let low = 0
    let high = ranges.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        const range = ranges[middle]!
        if (offset < range.start) {
            high = middle - 1
        } else if (offset >= range.end) {
            low = middle + 1
        } else {
            return range
        }
    }
    return undefined
}

/**
 * True when the offset sits inside code.
 *
 * @param ranges Ranges from {@link findCodeRanges}
 * @param offset A document offset
 */
export function isInsideCode(ranges: readonly CodeRange[], offset: number): boolean {
    return findCodeRangeAt(ranges, offset) !== undefined
}

/**
 * True when a construct that is itself code (a ```` ```dataview ```` block, a
 * `` `=expr` `` span) starting at `start` sits inside other code: a fence
 * nested in an outer fence, a span inside a fence or a longer span.
 *
 * @param ranges Ranges from {@link findCodeRanges}
 * @param start Offset of the construct (fence line start, opening backtick)
 */
export function isNestedInCode(ranges: readonly CodeRange[], start: number): boolean {
    const range = findCodeRangeAt(ranges, start)
    return range !== undefined && range.start !== start
}

/** A copy of the regex with the global flag, so it can be iterated */
const toGlobal = (regex: RegExp): RegExp =>
    new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)

/**
 * The first match of the regex that does not start inside code (the regex's
 * own `g` flag and `lastIndex` are ignored).
 *
 * @param text The document text
 * @param regex The regex
 * @param ranges Ranges of `text`, computed when omitted
 */
export function matchOutsideCode(
    text: string,
    regex: RegExp,
    ranges: readonly CodeRange[] = findCodeRanges(text)
): RegExpExecArray | null {
    const iterator = toGlobal(regex)
    let match: RegExpExecArray | null
    while ((match = iterator.exec(text)) !== null) {
        if (!isInsideCode(ranges, match.index)) {
            return match
        }
        // Restart right after the skipped start: a lazy match beginning in code
        // may run past the end of the code and over a live match.
        iterator.lastIndex = match.index + 1
    }
    return null
}

/**
 * `String.prototype.replace` restricted to matches that do not start inside
 * code: every such match for a global regex, the first one otherwise.
 *
 * @param text The document text
 * @param regex The regex
 * @param replacer Builds the replacement of a match
 * @param ranges Ranges of `text`, computed when omitted
 */
export function replaceOutsideCode(
    text: string,
    regex: RegExp,
    replacer: (match: RegExpExecArray) => string,
    ranges: readonly CodeRange[] = findCodeRanges(text)
): string {
    const replaceAll = regex.flags.includes('g')
    const iterator = toGlobal(regex)
    let output = ''
    let copiedUpTo = 0
    let replaced = false
    let match: RegExpExecArray | null
    while ((match = iterator.exec(text)) !== null) {
        if (isInsideCode(ranges, match.index)) {
            iterator.lastIndex = match.index + 1
            continue
        }
        replaced = true
        output += text.slice(copiedUpTo, match.index) + replacer(match)
        copiedUpTo = match.index + match[0].length
        if (!replaceAll) {
            break
        }
        iterator.lastIndex = match[0].length === 0 ? copiedUpTo + 1 : copiedUpTo
    }
    return replaced ? output + text.slice(copiedUpTo) : text
}

/**
 * `String.prototype.indexOf` restricted to occurrences that do not start inside code.
 *
 * @param text The document text
 * @param search The string to find
 * @param ranges Ranges of `text`, computed when omitted
 */
export function indexOfOutsideCode(
    text: string,
    search: string,
    ranges: readonly CodeRange[] = findCodeRanges(text)
): number {
    let index = text.indexOf(search)
    while (index !== -1 && isInsideCode(ranges, index)) {
        index = text.indexOf(search, index + 1)
    }
    return index
}
