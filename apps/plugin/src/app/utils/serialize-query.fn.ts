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

    // Set up to match the pattern
    // [[path to note\|alias]] - we are only interested in the path and \| that follow it
    const linkExp = new RegExp(/\[\[(.+?\\\|).+?\]\]/g);

    if (params.query.toLocaleLowerCase().contains('table')) {
      serializedQuery = serializedQuery
        .replaceAll('\\\\', '\\')
        .replaceAll('\n<', '<');

      // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
      const matchedLinks = [...serializedQuery.matchAll(linkExp)];
      for (const match of matchedLinks) {
        // Matched array
        // 0: Full matched string
        // 1: Matched group 1 = filename
        serializedQuery = serializedQuery.replace(match[1], '');
      }
    }
  } catch (err: unknown) {
    log('Failed to serialize query', 'warn', err);
  }

  return serializedQuery;
};
