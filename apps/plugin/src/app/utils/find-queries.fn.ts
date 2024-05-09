import { QUERY_FLAG_CLOSE, QUERY_FLAG_OPEN } from '../constants';
import { isSupportedQueryType } from './is-supported-query-type.fn';
import { log } from './log';

/**
 * Detect the queries in the given string. Ignores duplicates and ignores unsupported query types
 * @param text
 */
export const findQueries = (text: string): string[] => {
  const retVal: string[] = [];

  const lines: string[] = text.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.startsWith(QUERY_FLAG_OPEN) &&
      trimmedLine.endsWith(QUERY_FLAG_CLOSE)
    ) {
      let foundQuery = trimmedLine.replace(QUERY_FLAG_OPEN, '');
      foundQuery = foundQuery.replace(QUERY_FLAG_CLOSE, '');
      foundQuery = foundQuery.trim();

      // Ignore duplicates
      // Make sure it is a supported query
      if (!retVal.includes(foundQuery) && isSupportedQueryType(foundQuery)) {
        log('Found query: ', 'debug', foundQuery); // Example: "LIST FROM #one"
        retVal.push(foundQuery);
      }
    }
  }

  return retVal;
};
