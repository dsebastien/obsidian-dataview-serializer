import {
    QUERY_FLAG_CLOSE,
    SERIALIZED_DATAVIEWJS_END,
    SERIALIZED_DATAVIEWJS_END_ALT,
    SERIALIZED_DATAVIEWJS_START,
    SERIALIZED_DATAVIEWJS_START_ALT,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_END_ALT,
    SERIALIZED_QUERY_START,
    SERIALIZED_QUERY_START_ALT
} from '../constants'
import { buildBlockquotePrefixPattern } from './blockquote.fn'
import { escapeRegExp } from './escape-reg-exp.fn'

/**
 * Regexes used to locate an existing serialized block so it can be detected,
 * compared or replaced.
 *
 * They live here (rather than inline in the plugin) so that the exact patterns
 * the plugin runs are the ones covered by tests.
 *
 * All of them accept an optional blockquote prefix in front of the result
 * markers, but only when the query itself sits inside a blockquote/callout.
 * Outside of one, the patterns stay exactly as strict as they have always been.
 *
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/64
 */

/** Either result start marker (legacy or alternative syntax) */
const ANY_SERIALIZED_QUERY_START = `(?:${escapeRegExp(SERIALIZED_QUERY_START)}|${escapeRegExp(SERIALIZED_QUERY_START_ALT)})`
/** Either result end marker (legacy or alternative syntax) */
const ANY_SERIALIZED_QUERY_END = `(?:${escapeRegExp(SERIALIZED_QUERY_END)}|${escapeRegExp(SERIALIZED_QUERY_END_ALT)})`
/** Either DataviewJS result start marker (legacy or alternative syntax) */
const ANY_SERIALIZED_DATAVIEWJS_START = `(?:${escapeRegExp(SERIALIZED_DATAVIEWJS_START)}|${escapeRegExp(SERIALIZED_DATAVIEWJS_START_ALT)})`
/** Either DataviewJS result end marker (legacy or alternative syntax) */
const ANY_SERIALIZED_DATAVIEWJS_END = `(?:${escapeRegExp(SERIALIZED_DATAVIEWJS_END)}|${escapeRegExp(SERIALIZED_DATAVIEWJS_END_ALT)})`

export interface BlockQueryRegexParams {
    /** The query text, as written in the query definition */
    query: string
    /** The opening flag variant present in the file */
    flagOpen: string
    /** The closing flag variant present in the file */
    flagClose: string
    /** The query's indentation (used to allow a blockquote prefix) */
    indentation: string
}

/**
 * Match a query definition immediately followed by a result start marker.
 * Used to decide whether a query has already been serialized ('once' modes).
 *
 * Note: the marker may carry any query text, because the user may have edited
 * the query since it was last serialized.
 *
 * @param params The query context
 * @returns The regex
 */
export const buildAlreadySerializedRegex = (params: BlockQueryRegexParams): RegExp => {
    const prefix = buildBlockquotePrefixPattern(params.indentation)
    return new RegExp(
        `${escapeRegExp(params.flagOpen)}${escapeRegExp(params.query)}\\s*${escapeRegExp(params.flagClose)}(?:\\n|$)${prefix}${ANY_SERIALIZED_QUERY_START}[^\\n]*${escapeRegExp(QUERY_FLAG_CLOSE)}`,
        'm'
    )
}

/**
 * A result block already present in the document.
 */
export interface ExistingSerializedBlock {
    /** The serialized content sitting between the result markers */
    content: string
    /** The blockquote prefix carried by the result start marker */
    startPrefix: string
    /** The blockquote prefix carried by the result end marker */
    endPrefix: string
}

/**
 * Match a query definition together with its existing result block.
 * Used for the idempotency check.
 *
 * @param text The document text
 * @param params The query context
 * @returns The existing block, or null when there is none
 */
export const matchExistingSerializedBlock = (
    text: string,
    params: BlockQueryRegexParams
): ExistingSerializedBlock | null => {
    const prefix = buildBlockquotePrefixPattern(params.indentation)
    const regex = new RegExp(
        `${escapeRegExp(params.flagOpen)}${escapeRegExp(params.query)}\\s*${escapeRegExp(params.flagClose)}(?:\\n|$)(${prefix})${ANY_SERIALIZED_QUERY_START}[^\\n]*${escapeRegExp(QUERY_FLAG_CLOSE)}(?:\\n|$)([\\s\\S]*?)(${prefix})${ANY_SERIALIZED_QUERY_END}`,
        'm'
    )

    const match = text.match(regex)
    if (!match) {
        return null
    }

    return {
        startPrefix: match[1] ?? '',
        content: match[2] ?? '',
        endPrefix: match[3] ?? ''
    }
}

export interface BlockQueryReplacementRegexParams extends BlockQueryRegexParams {
    /**
     * For multi-line queries, the original text of the definition (from the
     * opening flag to the closing flag). Undefined for single-line queries.
     */
    originalQueryDefinition?: string | undefined
}

/**
 * Match the query definition plus any result block that follows it, so both can
 * be replaced in one go. The result block is optional (first serialization).
 *
 * @param params The query context
 * @returns The regex
 */
export const buildBlockQueryReplacementRegex = (
    params: BlockQueryReplacementRegexParams
): RegExp => {
    const prefix = buildBlockquotePrefixPattern(params.indentation)
    // Always use QUERY_FLAG_CLOSE for result markers (plugin-generated, standard format)
    const serializedClose = escapeRegExp(QUERY_FLAG_CLOSE)
    const existingBlock = `(?:${prefix}${ANY_SERIALIZED_QUERY_START}[^\\n]*${serializedClose}(?:\\n|$)[\\s\\S]*?${prefix}${ANY_SERIALIZED_QUERY_END}(?:\\n|$))?`

    if (params.originalQueryDefinition) {
        // Multi-line query: match the original multi-line definition verbatim.
        // Note: it already includes the closing flag.
        return new RegExp(
            `(${escapeRegExp(params.originalQueryDefinition)}(?:\\n|$))${existingBlock}`,
            'gm'
        )
    }

    // Single-line query.
    // The exact query is matched in the definition line to prevent similar queries
    // from matching each other (e.g. "LIST FROM #project" must not match
    // "LIST FROM #project and #done").
    // \s* before the closing flag allows trailing whitespace between the query and -->.
    return new RegExp(
        `^(${escapeRegExp(params.indentation)}${escapeRegExp(params.flagOpen)}${escapeRegExp(params.query)}\\s*${escapeRegExp(params.flagClose)}(?:\\n|$))${existingBlock}`,
        'gm'
    )
}

export interface DataviewJSRegexParams {
    /** The original text of the DataviewJS query definition */
    originalQueryDefinition: string
    /** The query's indentation (used to allow a blockquote prefix) */
    indentation: string
}

/**
 * Match a DataviewJS query definition together with its existing result block.
 * Used for the idempotency check.
 *
 * @param text The document text
 * @param params The query context
 * @returns The existing block, or null when there is none
 */
export const matchExistingDataviewJSBlock = (
    text: string,
    params: DataviewJSRegexParams
): ExistingSerializedBlock | null => {
    const prefix = buildBlockquotePrefixPattern(params.indentation)
    const regex = new RegExp(
        `${escapeRegExp(params.originalQueryDefinition)}(?:\\n|$)(${prefix})${ANY_SERIALIZED_DATAVIEWJS_START}${escapeRegExp(QUERY_FLAG_CLOSE)}(?:\\n|$)([\\s\\S]*?)(${prefix})${ANY_SERIALIZED_DATAVIEWJS_END}`,
        'm'
    )

    const match = text.match(regex)
    if (!match) {
        return null
    }

    return {
        startPrefix: match[1] ?? '',
        content: match[2] ?? '',
        endPrefix: match[3] ?? ''
    }
}

/**
 * Match a DataviewJS query definition plus any result block that follows it.
 *
 * @param params The query context
 * @returns The regex
 */
export const buildDataviewJSReplacementRegex = (params: DataviewJSRegexParams): RegExp => {
    const prefix = buildBlockquotePrefixPattern(params.indentation)
    return new RegExp(
        `(${escapeRegExp(params.originalQueryDefinition)}(?:\\n|$))(?:${prefix}${ANY_SERIALIZED_DATAVIEWJS_START}${escapeRegExp(QUERY_FLAG_CLOSE)}(?:\\n|$)[\\s\\S]*?${prefix}${ANY_SERIALIZED_DATAVIEWJS_END}(?:\\n|$))?`,
        'gm'
    )
}
