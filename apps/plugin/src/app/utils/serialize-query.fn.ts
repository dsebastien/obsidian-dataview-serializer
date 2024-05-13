/**
 * Serialize the given query to Markdown
 * @param query
 */
import { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api';
import { log } from './log';

export const serializeQuery = async (
  query: string,
  dataviewApi: DataviewApi
): Promise<string> => {
  let serializedQuery = '';
  try {
    serializedQuery = await dataviewApi.tryQueryMarkdown(query);
  } catch (err: unknown) {
    log('Failed to serialize query', 'warn', err);
  }

  return serializedQuery;
};