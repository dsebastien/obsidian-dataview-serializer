import { QUERY_TYPE_TABLE } from '../constants';

/**
 * Returns true if the query uses a supported type
 * @param query
 */
export const isTableQuery = (query: string): boolean => {
  let retVal = false;

  const queryLower = query.toLowerCase();

  if (queryLower.startsWith(QUERY_TYPE_TABLE)) {
    retVal = true;
  }

  return retVal;
};
