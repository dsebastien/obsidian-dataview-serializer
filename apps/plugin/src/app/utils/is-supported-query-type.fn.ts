import { SUPPORTED_QUERY_TYPES } from '../constants';

/**
 * Returns true if the query uses a supported type
 * @param query
 */
export const isSupportedQueryType = (query: string): boolean => {
  let retVal = false;

  const queryLower = query.trim().toLowerCase();

  for (const queryType of SUPPORTED_QUERY_TYPES) {
    if (queryLower.startsWith(queryType)) {
      retVal = true;
    }
  }

  return retVal;
};
