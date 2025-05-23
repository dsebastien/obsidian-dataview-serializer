import { QUERY_FLAG_CLOSE, QUERY_FLAG_OPEN } from '../constants';
import { isSupportedQueryType } from './is-supported-query-type.fn';

/**
 * Interface to represent a query with its indentation context
 */
export interface QueryWithContext {
  query: string;
  indentation: string;
}

/**
 * Detect the queries in the given string with their indentation context.
 * Ignores duplicates and ignores unsupported query types
 * @param text
 */
export const findQueries = (text: string): QueryWithContext[] => {
  const retVal: QueryWithContext[] = [];

  const lines: string[] = text.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.includes(QUERY_FLAG_OPEN) &&
      trimmedLine.includes(QUERY_FLAG_CLOSE)
    ) {
      // Extract the indentation (everything before the QUERY_FLAG_OPEN)
      const indentation = trimmedLine.substring(
        0,
        trimmedLine.indexOf(QUERY_FLAG_OPEN)
      );
      let foundQuery = trimmedLine.replace(indentation, ''); // Remove indentation
      foundQuery = trimmedLine.replace(QUERY_FLAG_OPEN, ''); // Remove the opening flag
      foundQuery = foundQuery.replace(QUERY_FLAG_CLOSE, ''); // Remove the closing flag
      foundQuery = foundQuery.trim(); // Remove any leading/trailing whitespace

      // Ignore duplicates
      // Make sure it is a supported query
      if (
        !retVal.some((item) => item.query === foundQuery) &&
        isSupportedQueryType(foundQuery)
      ) {
        retVal.push({ query: foundQuery, indentation });
      }
    }
  }

  return retVal;
};
