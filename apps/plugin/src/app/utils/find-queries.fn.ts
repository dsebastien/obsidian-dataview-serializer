import { QUERY_FLAG_CLOSE, QUERY_FLAG_OPEN } from '../constants';
import { isSupportedQueryType } from './is-supported-query-type.fn';

/**
 * Detect the queries in the given string. Ignores duplicates and ignores unsupported query types
 * @param text
 */
export const findQueries = (text: string): string[] => {
  const retVal: string[] = [];
  let isCapturing = false;
  let foundQuery = '';

  const lines: string[] = text.split('\n');
  for (const line of lines) {
    if (isCapturing) {
      if (line.includes(QUERY_FLAG_CLOSE)) {
        const endIndex = line.indexOf(QUERY_FLAG_CLOSE);
        foundQuery += `${line.substring(0, endIndex)}`;

        if (!retVal.includes(foundQuery) && isSupportedQueryType(foundQuery)) {
          retVal.push(foundQuery);
          isCapturing = false;
          foundQuery = '';
        }
      } else {
        // Accumulate the current line if capturing multi-line query
        foundQuery += `${line}\n`;
      }
    }
    // Detect QUERY FLAG OPEN and single line comments
    if (!isCapturing && line.includes(QUERY_FLAG_OPEN)) {
      isCapturing = true;
      const startIndex = line.indexOf(QUERY_FLAG_OPEN) + QUERY_FLAG_OPEN.length;
      foundQuery = line.substring(startIndex) + '\n';
      if (line.includes(QUERY_FLAG_CLOSE)) {
        const endIndex = line.indexOf(QUERY_FLAG_CLOSE);
        foundQuery = line.substring(startIndex, endIndex);

        // Ignore duplicates
        // Make sure it is a supported query
        if (!retVal.includes(foundQuery) && isSupportedQueryType(foundQuery)) {
          retVal.push(foundQuery);
          isCapturing = false;
          foundQuery = '';
        }
      }
    }
  }
  return retVal;
};
