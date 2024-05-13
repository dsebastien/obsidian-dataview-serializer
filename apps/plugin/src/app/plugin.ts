import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './types';
import { SettingsTab } from './settingTab';
import { log } from './utils/log';
import { Draft, produce } from 'immer';
import { isExcalidrawFile } from './utils/is-excalidraw-file.fn';
import {
  DEFAULT_CANVAS_FILE_NAME,
  MARKDOWN_FILE_EXTENSION,
  MINIMUM_SECONDS_BETWEEN_UPDATES,
  NOTICE_TIMEOUT,
  QUERY_FLAG_CLOSE,
  QUERY_FLAG_OPEN,
  SERIALIZED_QUERY_END,
  SERIALIZED_QUERY_START,
  serializedQueriesRegex,
} from './constants';
import { isTFile } from './utils/is-tfile.fn';
import { getAPI } from 'obsidian-dataview';
import { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api';
import { add, isBefore } from 'date-fns';
import { serializeQuery } from './utils/serialize-query.fn';
import { findQueries } from './utils/find-queries.fn';

export class DataviewSerializerPlugin extends Plugin {
  /**
   * The plugin settings are immutable
   */
  settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);
  /**
   * The API of the Dataview plugin
   */
  dataviewApi: DataviewApi | undefined;

  nextPossibleUpdates: Map<string, Date> = new Map<string, Date>();

  /**
   * Executed as soon as the plugin loads
   */
  async onload() {
    log('Initializing', 'debug');

    // Retrieve the Dataview API
    this.dataviewApi = getAPI();

    if (!this.dataviewApi) {
      const errMessage =
        'The Dataview plugin is not installed or enabled. Please make sure it is installed and enabled, then restart Obsidian';
      log(errMessage, 'error');
      new Notice(errMessage, NOTICE_TIMEOUT);

      // DO NOTHING unless Dataview is installed and enabled
      return;
    }

    await this.loadSettings();

    this.setupEventHandlers();

    // Add a settings screen for the plugin
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onunload() {}

  /**
   * Load the plugin settings
   */
  async loadSettings() {
    log('Loading settings', 'debug');
    let loadedSettings = (await this.loadData()) as PluginSettings;

    if (!loadedSettings) {
      log('Using default settings', 'debug');
      loadedSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);
    }

    let needToSaveSettings = false;

    this.settings = produce(this.settings, (draft: Draft<PluginSettings>) => {
      if (
        loadedSettings.foldersToWatch !== undefined &&
        loadedSettings.foldersToWatch !== null &&
        Array.isArray(loadedSettings.foldersToWatch)
      ) {
        draft.foldersToWatch = loadedSettings.foldersToWatch;
      } else {
        log('The loaded settings miss the [ignoredFolders] property', 'debug');
        needToSaveSettings = true;
      }

      if (
        loadedSettings.filesWithQueriesToSerialize !== undefined &&
        loadedSettings.filesWithQueriesToSerialize !== null &&
        Array.isArray(loadedSettings.filesWithQueriesToSerialize)
      ) {
        draft.filesWithQueriesToSerialize =
          loadedSettings.filesWithQueriesToSerialize;
      } else {
        needToSaveSettings = true;
      }
    });

    log(`Settings loaded`, 'debug', loadedSettings);

    if (needToSaveSettings) {
      this.saveSettings();
    }
  }

  /**
   * Save the plugin settings
   */
  async saveSettings() {
    log('Saving settings', 'debug');
    await this.saveData(this.settings);
    log('Settings saved', 'debug', this.settings);
  }

  /**
   * Add the event handlers
   */
  setupEventHandlers() {
    log('Adding event handlers');

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        return this.processFile(file);
      })
    );

    /*
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.settings.enabled) {
          // FIXME handle plugin configuration cleanup (if deleted file was known to contain a query, then it should be removed)
          //return this.handleFileDelete(file);
        }
      })
    );
    */

    // TODO add command to force update of all known queries
  }

  async processFile(file: TAbstractFile): Promise<void> {
    if (!isTFile(file)) {
      return;
    }

    const shouldBeIgnored = await this.shouldFileBeIgnored(file);
    if (shouldBeIgnored) {
      return;
    }

    try {
      log(`Processing file: ${file.path}`);

      const text = await this.app.vault.cachedRead(file);
      const foundQueries: string[] = findQueries(text);

      if (foundQueries.length === 0) {
        log(`No queries to serialize found in file`, 'debug', file);
        // FIXME remove this once we handle side effects
        return;
      }

      // Process the modified file
      let updatedText = `${text}`; // To ensure we have access to replaceAll...

      // Remove existing serialized queries if any
      updatedText = updatedText.replace(serializedQueriesRegex, '');
      //log("Cleaned up: ", 'debug', updatedText);

      // Serialize the supported queries in memory
      for (const foundQuery of foundQueries) {
        log(
          `Processing query: [${foundQuery}] in file [${file.path}]`,
          'debug'
        );
        // Reference: https://github.com/IdreesInc/Waypoint/blob/master/main.ts
        const serializedQuery = await serializeQuery(
          foundQuery,
          this.dataviewApi!
        );
        log('Serialized query: ', 'debug', serializedQuery);

        if ('' !== serializedQuery) {
          const queryToSerializeRegex = new RegExp(
            `${QUERY_FLAG_OPEN}${foundQuery}.*${QUERY_FLAG_CLOSE}\\n`,
            'gm'
          );

          const queryAndSerializedQuery = `${QUERY_FLAG_OPEN}${foundQuery}${QUERY_FLAG_CLOSE}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n${serializedQuery}${SERIALIZED_QUERY_END}\n`;

          //log('Updated text before: ', 'debug', updatedText);
          updatedText = updatedText.replace(
            queryToSerializeRegex,
            queryAndSerializedQuery
          );
          //log("Updated text after: ", 'debug', updatedText);
        }
      }

      // Keep track of the last time this file was updated to avoid modification loops
      const nextPossibleUpdateTimeForFile = add(new Date(file.stat.mtime), {
        seconds: MINIMUM_SECONDS_BETWEEN_UPDATES,
      });
      this.nextPossibleUpdates.set(file.path, nextPossibleUpdateTimeForFile);

      // Save the updated version
      await this.app.vault.modify(file, updatedText);

      // FIXME process side-effects
      /*
      this.settings.ignoredFolders.some((ignoredFolder) => {
      if (file.path.startsWith(ignoredFolder)) {
        log(
          `Skipping because the file is part of an ignored folder: [${ignoredFolder}]`
        );
        return true;
      } else {
        return false;
      }
    });
       */
    } catch (e: unknown) {
      log('Failed to process the file', 'warn', e);
    }
  }

  async shouldFileBeIgnored(file: TFile): Promise<boolean> {
    log(`Checking if the file should be ignored: ${file.path}`, 'debug');
    if (!file.path) {
      return true;
    }

    if (MARKDOWN_FILE_EXTENSION !== file.extension) {
      return true;
    }

    // Ignored Canvas files
    if (DEFAULT_CANVAS_FILE_NAME === file.name) {
      return true;
    }

    const fileContent = (await this.app.vault.read(file)).trim();

    if (fileContent.length === 0) {
      return true;
    }

    if (isExcalidrawFile(file)) {
      return true;
    }

    // Make sure the file was not modified too recently (avoid update loops)
    if (this.nextPossibleUpdates.has(file.path)) {
      const nextPossibleUpdateForFile = this.nextPossibleUpdates.get(
        file.path
      )!;

      if (isBefore(file.stat.mtime, nextPossibleUpdateForFile)) {
        log('File has been updated recently. Ignoring', 'debug', file.path);
        return true;
      }
    }

    return false;
  }
}
