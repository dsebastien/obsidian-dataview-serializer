/**
 * Serialize the given query to Markdown
 * @param query
 */
import { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api';
import { log } from './log';
import { App, TFile } from 'obsidian';
import path from 'path';

interface SerializeQueryParams {
  query: string;
  originFile: string;
  dataviewApi: DataviewApi;
  app: App;
}

export const serializeQuery = async (
  params: SerializeQueryParams
): Promise<string> => {
  const allVaultFiles = app.vault.getFiles();

  // Check if the name is unique. If it is, we will be able to replace the long path with just the note name. Aids
  // readability.
  function isNameUnique(name: string): boolean {
    const occurrences = allVaultFiles.filter((x: TFile) => x.name == name);
    return occurrences.length <= 1;
  }

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

      // Set up to match the pattern
      // [[path to note\|alias]] - we are only interested in the path and \| that follow it
      const linkExp = new RegExp(/\[\[(.+?)\\\|.+?\]\]/g);

      // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
      const matchedLinks = [...serializedQuery.matchAll(linkExp)];
      for (const match of matchedLinks) {
        // Matched array
        // mathc[0]: Full matched string
        // match{1]: Matched group 1 = filepath
        if (isNameUnique(path.basename(match[1]))) {
          serializedQuery = serializedQuery.replace(match[1] + '\\|', '');
        }
      }
    } else {
      // Not a table. Assuming for now a list as that's all we're processing.
      // Set up to match the pattern
      // [[path to note\|alias]] - we are only interested in the path and \| that follow it
      const linkExp = new RegExp(/\[\[(.+?)\|.+?\]\]/g);

      // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
      const matchedLinks = [...serializedQuery.matchAll(linkExp)];
      for (const match of matchedLinks) {
        // Matched array
        // mathc[0]: Full matched string
        // match{1]: Matched group 1 = filepath
        if (isNameUnique(path.basename(match[1]))) {
          serializedQuery = serializedQuery.replace(match[1] + '|', '');
        }
      }
    }
  } catch (err: unknown) {
    log('Failed to serialize query', 'warn', err);
  }

  return serializedQuery;
};
