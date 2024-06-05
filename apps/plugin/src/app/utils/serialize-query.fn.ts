/**
 * Serialize the given query to Markdown
 * @param query
 */
import { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api';
import { log } from './log';

interface SerializeQueryParams {
  query: string;
  originFile: string;
  dataviewApi: DataviewApi;
}

export const serializeQuery = async (
  params: SerializeQueryParams
): Promise<string> => {
  let serializedQuery = '';
  try {
    serializedQuery = await params.dataviewApi.tryQueryMarkdown(
      params.query,
      params.originFile
    );
    // Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/3
    if (params.query.toLocaleLowerCase().contains('table')) {
      serializedQuery = serializedQuery
        .replaceAll('\\\\', '\\')
        .replaceAll('\n<', '<');
    }
  } catch (err: unknown) {
    log('Failed to serialize query', 'warn', err);
  }

  return serializedQuery;
};
