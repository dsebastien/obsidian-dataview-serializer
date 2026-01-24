/**
 * How many milliseconds to wait before hiding notices
 */
export const NOTICE_TIMEOUT = 5000

export const DEFAULT_CANVAS_FILE_NAME = 'Canvas.md'
export const MARKDOWN_FILE_EXTENSION = 'md'

// Legacy syntax (original)
export const QUERY_FLAG_OPEN = `<!-- QueryToSerialize: `
export const QUERY_FLAG_MANUAL_OPEN = `<!-- QueryToSerializeManual: `
export const QUERY_FLAG_ONCE_OPEN = `<!-- QueryToSerializeOnce: `
export const QUERY_FLAG_ONCE_AND_EJECT_OPEN = `<!-- QueryToSerializeOnceAndEject: `
export const QUERY_FLAG_CLOSE = ` -->`

// Alternative syntax (more descriptive)
export const QUERY_FLAG_OPEN_ALT = `<!-- dataview-serializer-query: `
export const QUERY_FLAG_MANUAL_OPEN_ALT = `<!-- dataview-serializer-query-manual: `
export const QUERY_FLAG_ONCE_OPEN_ALT = `<!-- dataview-serializer-query-once: `
export const QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT = `<!-- dataview-serializer-query-once-and-eject: `
// Closing flag is the same for both syntaxes: ` -->`

// Query and serialized query structure: <!-- SerializedQuery: QUERY -->\n<markdown>\n<!-- SerializedQuery END -->
// Legacy result markers
export const SERIALIZED_QUERY_START = `<!-- SerializedQuery: `
export const SERIALIZED_QUERY_END = '<!-- SerializedQuery END -->'
// Alternative result markers
export const SERIALIZED_QUERY_START_ALT = `<!-- dataview-serializer-result: `
export const SERIALIZED_QUERY_END_ALT = '<!-- dataview-serializer-result-end -->'

// Regex to match serialized query blocks (legacy syntax)
export const serializedQueriesRegex = new RegExp(
    `${SERIALIZED_QUERY_START}[^\\n]*${QUERY_FLAG_CLOSE}\\n([\\s\\S]*?)${SERIALIZED_QUERY_END}\\n`,
    'g'
)

// Regex to match serialized query blocks (alternative syntax)
export const serializedQueriesRegexAlt = new RegExp(
    `${SERIALIZED_QUERY_START_ALT}[^\\n]*${QUERY_FLAG_CLOSE}\\n([\\s\\S]*?)${SERIALIZED_QUERY_END_ALT}\\n`,
    'g'
)

export const MINIMUM_SECONDS_BETWEEN_UPDATES = 5

export const MINIMUM_MS_BETWEEN_EVENTS = 500

// Legacy inline query markers (for expressions like =this.field)
export const INLINE_QUERY_FLAG_OPEN = `<!-- IQ: `
export const INLINE_QUERY_FLAG_MANUAL_OPEN = `<!-- IQManual: `
export const INLINE_QUERY_FLAG_ONCE_OPEN = `<!-- IQOnce: `
export const INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN = `<!-- IQOnceAndEject: `
export const INLINE_QUERY_FLAG_CLOSE = ` -->`
export const INLINE_QUERY_END = `<!-- /IQ -->`

// Alternative inline query markers
export const INLINE_QUERY_FLAG_OPEN_ALT = `<!-- dataview-serializer-iq: `
export const INLINE_QUERY_FLAG_MANUAL_OPEN_ALT = `<!-- dataview-serializer-iq-manual: `
export const INLINE_QUERY_FLAG_ONCE_OPEN_ALT = `<!-- dataview-serializer-iq-once: `
export const INLINE_QUERY_FLAG_ONCE_AND_EJECT_OPEN_ALT = `<!-- dataview-serializer-iq-once-and-eject: `
// Closing flag is the same for both syntaxes: ` -->`
export const INLINE_QUERY_END_ALT = `<!-- /dataview-serializer-iq -->`

export const QUERY_TYPE_LIST = 'list'
export const QUERY_TYPE_TABLE = 'table'
export const QUERY_TYPE_TASK = 'task'

export const SUPPORTED_QUERY_TYPES = [QUERY_TYPE_LIST, QUERY_TYPE_TABLE, QUERY_TYPE_TASK]
