import { getBlankLinePrefix, getBlockquotePrefix } from './blockquote.fn'

export interface BuildSerializedBlockParams {
    /**
     * The query definition as it must appear in the file, including its
     * indentation and its opening/closing flags.
     */
    queryDefinition: string
    /**
     * The result start marker line, without indentation
     * (e.g. `<!-- SerializedQuery: LIST FROM #foo -->`).
     */
    startMarker: string
    /**
     * The result end marker line, without indentation
     * (e.g. `<!-- SerializedQuery END -->`).
     */
    endMarker: string
    /**
     * The serialized content, already indented (see `applyIndentation`).
     */
    content: string
    /**
     * The query's indentation. Only its blockquote part is applied to the
     * markers; plain whitespace indentation is left off the markers to preserve
     * the historical output format.
     */
    indentation: string
    /**
     * Whether to insert a blank line between the start marker and the content.
     * Required for tables so that they render.
     */
    blankLineBeforeContent: boolean
    /**
     * Whether to insert a blank line between the content and the end marker.
     */
    blankLineBeforeEnd: boolean
}

/**
 * Assemble the query definition and its serialized result block.
 *
 * Inside a blockquote/callout, the result markers and the blank lines carry the
 * blockquote prefix so that the block stays part of the quote. Outside a
 * blockquote the output is unchanged from previous versions.
 *
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 *
 * @param params The block components
 * @returns The full replacement text, terminated by a newline
 */
export const buildSerializedBlock = (params: BuildSerializedBlockParams): string => {
    const markerPrefix = getBlockquotePrefix(params.indentation)
    const blankLine = getBlankLinePrefix(params.indentation)

    const lines: string[] = [params.queryDefinition, `${markerPrefix}${params.startMarker}`]

    if (params.blankLineBeforeContent) {
        lines.push(blankLine)
    }

    lines.push(params.content)

    if (params.blankLineBeforeEnd) {
        lines.push(blankLine)
    }

    lines.push(`${markerPrefix}${params.endMarker}`)

    return `${lines.join('\n')}\n`
}
