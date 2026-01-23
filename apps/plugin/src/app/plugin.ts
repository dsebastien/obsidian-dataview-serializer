import {
  debounce,
  EventRef,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
} from 'obsidian';
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
import { findQueries, QueryWithContext } from './utils/find-queries.fn';
import { escapeRegExp } from './utils/escape-reg-exp.fn';
import { isTableQuery } from './utils/is-table-query.fn';
import { refreshButtonExtension } from './refresh-button-extension';

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
   * Event handler references for create, modify, rename events
   * Stored to allow unregistering when automatic updates are disabled
   */
  private createEventRef: EventRef | null = null;
  private modifyEventRef: EventRef | null = null;
  private renameEventRef: EventRef | null = null;

  /**
   * Set of files to ignore during the next file event.
   * Used to prevent infinite loops or unwanted side effects when the plugin modifies a file.
   */
  private filesToIgnoreFileEvents: Set<string> = new Set();

  /**
   * Debounce file updates
   */
  scheduleUpdate = debounce(
    this.processRecentlyUpdatedFiles.bind(this),
    MINIMUM_MS_BETWEEN_EVENTS,
    true
  );

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

    // Only set up automatic event handlers if the user hasn't disabled them
    if (!this.settings.disableAutomaticUpdates) {
      this.setupEventHandlers();
    }

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

    // Add command to insert dataview serializer block
    this.addCommand({
      id: 'insert-dataview-serializer-block',
      name: 'Insert Dataview serializer block',
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const indentation = line.match(/^(\s*)/)?.[1] || '';

        // Insert the dataview serializer block template
        const template = `${indentation}${QUERY_FLAG_OPEN}LIST FROM #foo ${QUERY_FLAG_CLOSE}`;

        editor.replaceRange(template, cursor);

        // Position cursor after "LIST" so user can replace it with their query
        const listStartPos = template.indexOf('LIST FROM #foo');
        const newCursor = {
          line: cursor.line,
          ch: cursor.ch + listStartPos,
        };
        const newCursorEnd = {
          line: cursor.line,
          ch: cursor.ch + listStartPos + 14, // Length of "LIST FROM #foo"
        };

        editor.setSelection(newCursor, newCursorEnd);

        new Notice(
          'Dataview serializer block inserted. Replace "LIST FROM #foo" with your query.'
        );
      },
    });

    this.registerEditorExtension(
      refreshButtonExtension(
        this.app,
        () => this.settings,
        this.processFile.bind(this)
      )
    );
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

      if (
        loadedSettings.disableAutomaticUpdates !== undefined &&
        loadedSettings.disableAutomaticUpdates !== null &&
        typeof loadedSettings.disableAutomaticUpdates === 'boolean'
      ) {
        draft.disableAutomaticUpdates = loadedSettings.disableAutomaticUpdates;
      } else {
        log(
          'The loaded settings miss the [disableAutomaticUpdates] property',
          'debug'
        );
        needToSaveSettings = true;
      }

      if (
        loadedSettings.showRefreshButton !== undefined &&
        loadedSettings.showRefreshButton !== null &&
        typeof loadedSettings.showRefreshButton === 'boolean'
      ) {
        draft.showRefreshButton = loadedSettings.showRefreshButton;
      } else {
        log(
          'The loaded settings miss the [showRefreshButton] property',
          'debug'
        );
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
    // Only register if not already registered
    if (this.createEventRef || this.modifyEventRef || this.renameEventRef) {
      log('Event handlers already registered, skipping setup', 'debug');
      return;
    }

    // Register events after layout is built to avoid initial wave of 'create' events
    this.app.workspace.onLayoutReady(async () => {
      this.createEventRef = this.app.vault.on('create', (file) => {
        this.recentlyUpdatedFiles.add(file);
        this.scheduleUpdate();
      });
      this.registerEvent(this.createEventRef);

      this.renameEventRef = this.app.vault.on('rename', (file) => {
        this.recentlyUpdatedFiles.add(file);
        this.scheduleUpdate();
      });
      this.registerEvent(this.renameEventRef);

      this.modifyEventRef = this.app.vault.on('modify', (file) => {
        if (
          file instanceof TFile &&
          this.filesToIgnoreFileEvents.has(file.path)
        ) {
          log(
            `Ignoring modify event for ${file.path} as it was triggered by the plugin itself`,
            'debug'
          );
          this.filesToIgnoreFileEvents.delete(file.path);
          return;
        }

        this.recentlyUpdatedFiles.add(file);
        this.scheduleUpdate();
      });
      this.registerEvent(this.modifyEventRef);

      log('Event handlers registered for automatic updates', 'debug');
    });
  }

  /**
   * Remove the event handlers for automatic updates
   */
  unregisterEventHandlers() {
    if (this.createEventRef) {
      this.app.vault.offref(this.createEventRef);
      this.createEventRef = null;
    }
    if (this.modifyEventRef) {
      this.app.vault.offref(this.modifyEventRef);
      this.modifyEventRef = null;
    }
    if (this.renameEventRef) {
      this.app.vault.offref(this.renameEventRef);
      this.renameEventRef = null;
    }

    log('Event handlers unregistered for automatic updates', 'debug');
  }

  async processFile(
    _file: TAbstractFile,
    force = false,
    targetQuery?: string
  ): Promise<void> {
    if (!(_file instanceof TFile)) {
      return;
    }

    // Safe from here on
    const file = _file as TFile;

    const shouldBeIgnored = await this.shouldFileBeIgnored(file, force);
    if (shouldBeIgnored) {
      return;
    }

    try {
      //log(`Processing file: ${file.path}`, 'debug');

      const text = await this.app.vault.cachedRead(file);
      const foundQueries: QueryWithContext[] = findQueries(text);

      if (foundQueries.length === 0) {
        // No queries to serialize found in the file
        return;
      }

      // Process the modified file
      let updatedText = `${text}`; // To ensure we have access to replaceAll...

      // Remove existing serialized queries if any, ONLY if we are doing a full update
      if (!targetQuery) {
        updatedText = updatedText.replace(serializedQueriesRegex, '');
      }

      // Serialize the supported queries in memory
      for (const queryWithContext of foundQueries) {
        const foundQuery = queryWithContext.query;

        // If we are targeting a specific query, skip others
        if (targetQuery && foundQuery !== targetQuery) {
          continue;
        }

        const indentation = queryWithContext.indentation;
        //log(`Processing query: [${foundQuery}] in file [${file.path}]`, 'debug');
        // Reference: https://github.com/IdreesInc/Waypoint/blob/master/main.ts
        const serializedQuery = await serializeQuery({
          query: foundQuery,
          originFile: file.path,
          // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
          dataviewApi: this.dataviewApi!,
          app: this.app,
          indentation,
        });
        //log('Serialized query: ', 'debug', serializedQuery);

        if ('' !== serializedQuery) {
          const escapedQuery = escapeRegExp(foundQuery);
          const escapedIndentation = escapeRegExp(indentation);

          // Match the Query Definition Line, optionally followed by an existing Serialized Block
          const escapedSerializedStart = escapeRegExp(SERIALIZED_QUERY_START);
          const escapedSerializedEnd = escapeRegExp(SERIALIZED_QUERY_END);
          const escapedQueryClose = escapeRegExp(QUERY_FLAG_CLOSE);

          // Regex breakdown:
          // Group 1: The Query Definition line (preserved)
          // Non-capturing Group: The optional existing serialized block (replaced)
          const queryToSerializeRegex = new RegExp(
            `^(${escapedIndentation}${QUERY_FLAG_OPEN}${escapedQuery}.*${escapedQueryClose}\\n)(?:${escapedSerializedStart}${escapedQuery}${escapedQueryClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
            'gm'
          );

          let queryAndSerializedQuery = '';

          if (isTableQuery(foundQuery)) {
            queryAndSerializedQuery = `${indentation}${QUERY_FLAG_OPEN}${foundQuery}${QUERY_FLAG_CLOSE}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n\n${serializedQuery}\n${
              indentation.length > 0 ? '\n' : ''
            }${SERIALIZED_QUERY_END}\n`;
          } else {
            queryAndSerializedQuery = `${indentation}${QUERY_FLAG_OPEN}${foundQuery}${QUERY_FLAG_CLOSE}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n${serializedQuery}\n${
              indentation.length > 0 ? '\n' : ''
            }${SERIALIZED_QUERY_END}\n`;
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
        if (targetQuery) {
          this.filesToIgnoreFileEvents.add(file.path);
          // Safety net: ensure the file is eventually removed from the ignore list
          // even if the modify event doesn't fire or an error occurs.
          window.setTimeout(() => {
            if (this.filesToIgnoreFileEvents.has(file.path)) {
              this.filesToIgnoreFileEvents.delete(file.path);
            }
          }, 2000);
        }
        //log('The file content has changed. Saving the modifications', 'info');
        await this.app.vault.modify(file, updatedText);
      }
    } catch (e: unknown) {
      // Ensure cleanup on error
      if (this.filesToIgnoreFileEvents.has(file.path)) {
        this.filesToIgnoreFileEvents.delete(file.path);
      }
      log('Failed to process the file', 'warn', e);
    }
  }

  async shouldFileBeIgnored(file: TFile, force = false): Promise<boolean> {
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

    if (force) {
      return false;
    }

    // Make sure the file was not modified too recently (avoid update loops)
    if (this.nextPossibleUpdates.has(file.path)) {
      // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
      const nextPossibleUpdateForFile = this.nextPossibleUpdates.get(
        file.path
      )!;

      if (isBefore(file.stat.mtime, nextPossibleUpdateForFile)) {
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
