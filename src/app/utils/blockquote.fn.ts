/**
 * Helpers that keep serialized output inside Markdown blockquotes and callouts.
 *
 * A query written inside a callout carries the blockquote markers in its
 * indentation (e.g. `> ` for `> <!-- QueryToSerialize: ... -->`). Everything the
 * plugin writes underneath it must repeat that prefix, otherwise the callout is
 * terminated by the first unprefixed line.
 *
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 */

/**
 * Matches the leading blockquote structure of a line prefix: any mix of spaces,
 * tabs and `>` markers, as long as at least one `>` is present.
 * Examples: `> `, `>>`, `  > `, `> > `.
 */
const BLOCKQUOTE_PREFIX_REGEX = /^[ \t]*(?:>[ \t]*)+/

/**
 * Regex fragment that tolerates any blockquote prefix (including none).
 * Used to keep matching serialized blocks written by older plugin versions,
 * which did not prefix the result markers.
 */
const TOLERANT_BLOCKQUOTE_PREFIX_PATTERN = '[ \\t]*(?:>[ \\t]*)*'

/**
 * Extract the blockquote prefix from a query's indentation.
 *
 * @param indentation The text preceding the query marker on its line
 * @returns The blockquote prefix (e.g. `"> "`), or an empty string when the
 *          query is not inside a blockquote/callout
 */
export const getBlockquotePrefix = (indentation: string): string => {
    return BLOCKQUOTE_PREFIX_REGEX.exec(indentation)?.[0] ?? ''
}

/**
 * Remove the leading blockquote markers from a single line.
 * Used when reading a query definition that spans several quoted lines.
 *
 * @param line The line to clean up
 * @returns The line without its leading blockquote markers
 */
export const stripBlockquoteMarkers = (line: string): string => {
    return line.replace(BLOCKQUOTE_PREFIX_REGEX, '')
}

/**
 * Determine what an "empty" line must contain to stay inside the block.
 *
 * Inside a blockquote a truly empty line ends the quote, so the blockquote
 * marker has to be repeated. The trailing space is dropped to avoid emitting
 * trailing whitespace. Outside a blockquote, empty lines stay empty.
 *
 * @param indentation The query's indentation
 * @returns The content of a blank line (e.g. `">"`, or `""`)
 */
export const getBlankLinePrefix = (indentation: string): string => {
    return getBlockquotePrefix(indentation).trimEnd()
}

/**
 * Prefix every line of the serialized content with the query's indentation.
 * Lines that would end up containing only the indentation are reduced to the
 * blank-line prefix, so blockquotes do not accumulate trailing whitespace.
 *
 * @param content The serialized content
 * @param indentation The query's indentation
 * @returns The indented content
 */
export const applyIndentation = (content: string, indentation: string): string => {
    if (!indentation || !content) {
        return content
    }

    const blankLinePrefix = getBlankLinePrefix(indentation)
    // Outside blockquotes, keep the previous behavior byte for byte
    if (blankLinePrefix === '') {
        return content
            .split('\n')
            .map((line) => indentation + line)
            .join('\n')
    }

    return content
        .split('\n')
        .map((line) => (line.trim() === '' ? blankLinePrefix : indentation + line))
        .join('\n')
}

/**
 * Remove a blockquote prefix from the start of every line.
 * Used to compare serialized content that may or may not carry the prefix.
 *
 * @param content The content to normalize
 * @param prefix The blockquote prefix to remove (no-op when empty)
 * @returns The content without the prefix
 */
export const stripLinePrefix = (content: string, prefix: string): string => {
    if (!prefix) {
        return content
    }

    const trimmedPrefix = prefix.trimEnd()

    return content
        .split('\n')
        .map((line) => {
            if (line.startsWith(prefix)) {
                return line.substring(prefix.length)
            }
            if (trimmedPrefix && line.startsWith(trimmedPrefix)) {
                return line.substring(trimmedPrefix.length)
            }
            return line
        })
        .join('\n')
}

/**
 * Build the regex fragment used to match the blockquote prefix in front of a
 * result marker.
 *
 * Returns an empty fragment when the query is not inside a blockquote, so that
 * matching outside callouts stays exactly as strict as before. Inside a
 * blockquote the fragment is deliberately tolerant: it matches the prefix, a
 * different-but-equivalent prefix, or no prefix at all (blocks written by
 * earlier plugin versions).
 *
 * @param indentation The query's indentation
 * @returns A regex fragment (possibly empty)
 */
export const buildBlockquotePrefixPattern = (indentation: string): string => {
    return getBlockquotePrefix(indentation) === '' ? '' : TOLERANT_BLOCKQUOTE_PREFIX_PATTERN
}
