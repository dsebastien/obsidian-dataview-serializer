/**
 * How many milliseconds to wait before hiding notices
 */
export const NOTICE_TIMEOUT = 5000;

export const DEFAULT_CANVAS_FILE_NAME = 'Canvas.md';
export const MARKDOWN_FILE_EXTENSION = 'md';

export const QUERY_FLAG_OPEN = `<!-- QueryToSerialize: `;
export const QUERY_FLAG_CLOSE = ` -->`;

// Query and serialized query structure: <!-- SerializedQuery: QUERY -->\n<markdown>\n<!-- SerializedQuery END -->
export const SERIALIZED_QUERY_START = `<!-- SerializedQuery: `;
export const SERIALIZED_QUERY_END = '<!-- SerializedQuery END -->';

export const serializedQueriesRegex = new RegExp(
  `${SERIALIZED_QUERY_START}[^\\n]*${QUERY_FLAG_CLOSE}\\n([\\s\\S]*?)${SERIALIZED_QUERY_END}\\n`,
  'g'
);

export const MINIMUM_SECONDS_BETWEEN_UPDATES = 3;

export const MINIMUM_MS_BETWEEN_EVENTS = 500;

export const SUPPORTED_QUERY_TYPES = ['list', 'table'];
