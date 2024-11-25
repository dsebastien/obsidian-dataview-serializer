import { debounce, Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './types';
import { SettingsTab } from './settingTab';
import { log } from './utils/log';
import { Draft, produce } from 'immer';
import { isExcalidrawFile } from './utils/is-excalidraw-file.fn';
import {
  DEFAULT_CANVAS_FILE_NAME,
  MARKDOWN_FILE_EXTENSION,
  MINIMUM_MS_BETWEEN_EVENTS,
  MINIMUM_SECONDS_BETWEEN_UPDATES,
  NOTICE_TIMEOUT,
  QUERY_FLAG_CLOSE,
  QUERY_FLAG_OPEN,
  SERIALIZED_QUERY_END,
  SERIALIZED_QUERY_START,
  serializedQueriesRegex,
} from './constants';
import { getAPI } from 'obsidian-dataview';
import { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api';
import { add, isBefore } from 'date-fns';
import { serializeQuery } from './utils/serialize-query.fn';
import { findQueries } from './utils/find-queries.fn';
import { escapeRegExp } from './utils/escape-reg-exp.fn';
import { isTableQuery } from './utils/is-table-query.fn';

export class DataviewSerializerPlugin extends Plugin {
  /**
   * The plugin settings are immutable
   */
  settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);
  /**
   * The API of the Dataview plugin
   */
  dataviewApi: DataviewApi | undefined;
  /**
   * When a recently updated file can be updated again
   */
  nextPossibleUpdates: Map<string, Date> = new Map<string, Date>();
  /**
   * List of recently updated files in the vault
   * Those will be processed by the next scheduled update
   */
  recentlyUpdatedFiles: Set<TAbstractFile> = new Set<TAbstractFile>();

  /**
   * Debounce file updates
   */
  scheduleUpdate = debounce(
    this.processRecentlyUpdatedFiles.bind(this),
    MINIMUM_MS_BETWEEN_EVENTS,
    true
  );

  scheduleFullUpdate = debounce(
    this.processAllFiles.bind(this),
    MINIMUM_MS_BETWEEN_EVENTS * 20,
    true
  );

  async processAllFiles(): Promise<void> {
    this.app.vault.getMarkdownFiles().forEach((file) => {
      this.processFile(file);
    });
  }
  /**
   * Process all the identified recently updated files
   */
  async processRecentlyUpdatedFiles(): Promise<void> {
    this.recentlyUpdatedFiles.forEach((file) => {
      this.processFile(file);
    });
    this.recentlyUpdatedFiles.clear();
  }

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

    // Add commands
    this.addCommand({
      id: 'serialize-all-dataview-queries',
      name: 'Scan and serialize all Dataview queries',
      callback: async () => {
        log('Scanning and serializing all Dataview queries', 'debug');
        const allVaultFiles = this.app.vault.getMarkdownFiles();

        for (const vaultFile of allVaultFiles) {
          await this.processFile(vaultFile);
        }
      },
    });
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
        loadedSettings.foldersToScan !== undefined &&
        loadedSettings.foldersToScan !== null &&
        Array.isArray(loadedSettings.foldersToScan)
      ) {
        draft.foldersToScan = loadedSettings.foldersToScan;
      } else {
        log('The loaded settings miss the [foldersToScan] property', 'debug');
        needToSaveSettings = true;
      }

      if (
        loadedSettings.ignoredFolders !== undefined &&
        loadedSettings.ignoredFolders !== null &&
        Array.isArray(loadedSettings.ignoredFolders)
      ) {
        draft.ignoredFolders = loadedSettings.ignoredFolders;
      } else {
        log('The loaded settings miss the [ignoredFolders] property', 'debug');
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
    // Register events after layout is built to avoid initial wave of 'create' events
    this.app.workspace.onLayoutReady(async () => {
      //log('Adding event handlers', 'debug');

      this.registerEvent(
        this.app.vault.on('create', (file) => {
          this.recentlyUpdatedFiles.add(file);
          this.scheduleUpdate();
          this.scheduleFullUpdate();
        })
      );

      this.registerEvent(
        this.app.vault.on('rename', (file) => {
          this.recentlyUpdatedFiles.add(file);
          this.scheduleUpdate();
          this.scheduleFullUpdate();
        })
      );

      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          this.recentlyUpdatedFiles.add(file);
          this.scheduleUpdate();
          this.scheduleFullUpdate();
        })
      );
    });
  }

  async processFile(_file: TAbstractFile): Promise<void> {
    if (!(_file instanceof TFile)) {
      return;
    }

    // Safe from here on
    const file = _file as TFile;

    const shouldBeIgnored = await this.shouldFileBeIgnored(file);
    if (shouldBeIgnored) {
      return;
    }

    try {
      //log(`Processing file: ${file.path}`, 'debug');

      const cachedText = await this.app.vault.cachedRead(file);
      const foundQueries: string[] = findQueries(cachedText);

      if (foundQueries.length === 0) {
        // No queries to serialize found in the file
        return;
      }

      const text = await this.app.vault.read(file);

      // Process the modified file
      let updatedText = `${text}`; // To ensure we have access to replaceAll...

      // Remove existing serialized queries if any
      updatedText = updatedText.replace(serializedQueriesRegex, '');
      //log('Cleaned up: ', 'debug', updatedText);

      // Serialize the supported queries in memory
      for (const foundQuery of foundQueries) {
        //log(`Processing query: [${foundQuery}] in file [${file.path}]`, 'debug');
        // Reference: https://github.com/IdreesInc/Waypoint/blob/master/main.ts
        const serializedQuery = await serializeQuery({
          query: foundQuery,
          originFile: file.path,
          // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
          dataviewApi: this.dataviewApi!,
          app: this.app,
        });
        //log('Serialized query: ', 'debug', serializedQuery);

        if ('' !== serializedQuery) {
          const escapedQuery = escapeRegExp(foundQuery);

          const queryToSerializeRegex = new RegExp(
            `${QUERY_FLAG_OPEN}${escapedQuery}.*${QUERY_FLAG_CLOSE}\\n`,
            'gm'
          );

          let queryAndSerializedQuery = '';
          if (isTableQuery(foundQuery)) {
            queryAndSerializedQuery = `${QUERY_FLAG_OPEN}${foundQuery}${QUERY_FLAG_CLOSE}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n\n${serializedQuery}${SERIALIZED_QUERY_END}\n`;
          } else {
            queryAndSerializedQuery = `${QUERY_FLAG_OPEN}${foundQuery}${QUERY_FLAG_CLOSE}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n${serializedQuery}${SERIALIZED_QUERY_END}\n`;
          }
          //log('Query to serialize regex: ', 'debug', queryToSerializeRegex);

          //log('Updated text before: ', 'debug', updatedText);
          updatedText = updatedText.replace(
            queryToSerializeRegex,
            queryAndSerializedQuery
          );
          //log('Updated text after: ', 'debug', updatedText);
        }
      }

      // Keep track of the last time this file was updated to avoid modification loops
      const nextPossibleUpdateTimeForFile = add(new Date(), {
        seconds: MINIMUM_SECONDS_BETWEEN_UPDATES,
      });
      this.nextPossibleUpdates.set(file.path, nextPossibleUpdateTimeForFile);

      // Save the updated version

      if (updatedText !== text) {
        //log('The file content has changed. Saving the modifications', 'info');
        await this.app.vault.modify(file, updatedText);
      }
    } catch (e: unknown) {
      log('Failed to process the file', 'warn', e);
    }
  }

  async shouldFileBeIgnored(file: TFile): Promise<boolean> {
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
      // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
      const nextPossibleUpdateForFile = this.nextPossibleUpdates.get(
        file.path
      )!;

      if (isBefore(new Date(), nextPossibleUpdateForFile)) {
        log('File has been updated recently. Ignoring', 'debug', file.path);
        return true;
      } else {
        log(
          'File has not been updated recently. Processing',
          'debug',
          file.path
        );
      }
    }

    return this.settings.ignoredFolders.some((ignoredFolder) => {
      if (file.path.startsWith(ignoredFolder)) {
        //log(`Skipping because the file is part of an ignored folder: [${ignoredFolder}]`, 'debug');
        return true;
      } else {
        return false;
      }
    });
  }
}
