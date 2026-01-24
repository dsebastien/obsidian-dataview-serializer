import { App, debounce, Notice, Plugin, TAbstractFile, TFile } from 'obsidian'
import type { EventRef } from 'obsidian'
import { DEFAULT_SETTINGS, type PluginSettings } from './types/plugin-settings.intf'
import { SettingsTab } from './settings/settings-tab'
import { log, setDebugMode } from '../utils/log'
import { produce } from 'immer'
import type { Draft } from 'immer'
import { isExcalidrawFile } from './utils/is-excalidraw-file.fn'
import {
    DEFAULT_CANVAS_FILE_NAME,
    MARKDOWN_FILE_EXTENSION,
    MINIMUM_MS_BETWEEN_EVENTS,
    MINIMUM_SECONDS_BETWEEN_UPDATES,
    NOTICE_TIMEOUT,
    QUERY_FLAG_CLOSE,
    QUERY_FLAG_OPEN,
    SERIALIZED_QUERY_END,
    SERIALIZED_QUERY_START
} from './constants'
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import type { QuerySerializationResult } from './types/query-result.intf'

/**
 * Get the Dataview API from the app object.
 * This avoids requiring obsidian-dataview at runtime.
 */
function getDataviewApi(app: App): DataviewApi | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (app as any).plugins?.plugins?.dataview?.api as DataviewApi | undefined
}
import { add, isBefore } from 'date-fns'
import { serializeQuery } from './utils/serialize-query.fn'
import { findQueries, type QueryWithContext } from './utils/find-queries.fn'
import { escapeRegExp } from './utils/escape-reg-exp.fn'
import { isTableQuery } from './utils/is-table-query.fn'
import { shouldSkipQuery } from './utils/should-skip-query.fn'
import { refreshButtonExtension } from './refresh-button-extension'
import {
    convertQueryAtCursor,
    convertAllQueries,
    convertSelectedQuery
} from './utils/convert-dataview-query.fn'
import {
    findInlineQueries,
    buildSerializedInlineQuery,
    type InlineQueryWithContext
} from './utils/find-inline-queries.fn'
import { serializeInlineQuery, isInsideTable } from './utils/serialize-inline-query.fn'

/**
 * Maximum number of error notifications to show during batch operations
 */
const MAX_ERROR_NOTIFICATIONS = 3

/**
 * Result of processing a file
 */
interface FileProcessingResult {
    filePath: string
    errors: Array<{
        message: string
        query: string
    }>
}

export class DataviewSerializerPlugin extends Plugin {
    /**
     * The plugin settings are immutable
     */
    settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)
    /**
     * The API of the Dataview plugin
     */
    dataviewApi: DataviewApi | undefined
    /**
     * When a recently updated file can be updated again
     */
    nextPossibleUpdates: Map<string, Date> = new Map<string, Date>()
    /**
     * List of recently updated files in the vault
     * Those will be processed by the next scheduled update
     */
    recentlyUpdatedFiles: Set<TAbstractFile> = new Set<TAbstractFile>()
    /**
     * Event handler references for create, modify, rename events
     * Stored to allow unregistering when automatic updates are disabled
     */
    private createEventRef: EventRef | null = null
    private modifyEventRef: EventRef | null = null
    private renameEventRef: EventRef | null = null

    /**
     * Set of files to ignore during the next file event.
     * Used to prevent infinite loops or unwanted side effects when the plugin modifies a file.
     */
    private filesToIgnoreFileEvents: Set<string> = new Set()

    /**
     * Debounce file updates
     */
    scheduleUpdate = debounce(
        this.processRecentlyUpdatedFiles.bind(this),
        MINIMUM_MS_BETWEEN_EVENTS,
        true
    )

    /**
     * Debounce forced updates for configured folders.
     * Uses a longer delay to avoid overwhelming the system with updates.
     */
    scheduleForcedUpdate = debounce(
        this.processForceUpdateFiles.bind(this),
        MINIMUM_MS_BETWEEN_EVENTS * 20,
        true
    )

    /**
     * Create a Notice for a query error
     */
    private createQueryErrorNotice(
        error: { message: string; query: string },
        filePath: string
    ): void {
        const fileName = filePath.split('/').pop() || filePath
        const truncatedQuery =
            error.query.length > 50 ? error.query.substring(0, 50) + '...' : error.query
        const message = `Dataview Serializer: Query error in ${fileName}:\n"${truncatedQuery}"\n${error.message}`
        new Notice(message, NOTICE_TIMEOUT * 2)
    }

    /**
     * Process all the identified recently updated files
     */
    async processRecentlyUpdatedFiles(): Promise<void> {
        const allErrors: Array<{ filePath: string; error: { message: string; query: string } }> = []

        for (const file of this.recentlyUpdatedFiles) {
            const result = await this.processFile(file)
            for (const error of result.errors) {
                allErrors.push({ filePath: result.filePath, error })
            }
        }
        this.recentlyUpdatedFiles.clear()

        // Show error notifications if enabled for automatic updates
        if (this.settings.showErrorNotifications && allErrors.length > 0) {
            const errorsToShow = allErrors.slice(0, MAX_ERROR_NOTIFICATIONS)
            for (const { filePath, error } of errorsToShow) {
                this.createQueryErrorNotice(error, filePath)
            }

            if (allErrors.length > MAX_ERROR_NOTIFICATIONS) {
                new Notice(
                    `${allErrors.length - MAX_ERROR_NOTIFICATIONS} more query error(s) occurred. Check console for details.`,
                    NOTICE_TIMEOUT
                )
            }
        }
    }

    /**
     * Process updates for folders which are marked as forced updates.
     * These files are updated on any modification, useful for scenarios
     * where there's an index file that holds queries that could be impacted
     * by file updates elsewhere.
     */
    async processForceUpdateFiles(): Promise<void> {
        // Skip if no folders are configured for forced updates
        if (
            !this.settings.foldersToForceUpdate ||
            this.settings.foldersToForceUpdate.length === 0
        ) {
            return
        }

        const filesToUpdate = this.app.vault.getMarkdownFiles().filter((file) => {
            return this.settings.foldersToForceUpdate.some((folder) => file.path.startsWith(folder))
        })

        const allErrors: Array<{ filePath: string; error: { message: string; query: string } }> = []

        for (const file of filesToUpdate) {
            const result = await this.processFile(file)
            for (const error of result.errors) {
                allErrors.push({ filePath: result.filePath, error })
            }
        }

        // Show error notifications if enabled for automatic updates
        if (this.settings.showErrorNotifications && allErrors.length > 0) {
            const errorsToShow = allErrors.slice(0, MAX_ERROR_NOTIFICATIONS)
            for (const { filePath, error } of errorsToShow) {
                this.createQueryErrorNotice(error, filePath)
            }

            if (allErrors.length > MAX_ERROR_NOTIFICATIONS) {
                new Notice(
                    `${allErrors.length - MAX_ERROR_NOTIFICATIONS} more query error(s) occurred. Check console for details.`,
                    NOTICE_TIMEOUT
                )
            }
        }
    }

    /**
     * Executed as soon as the plugin loads
     */
    override async onload() {
        log('Initializing', 'debug')

        // Wait for layout to be ready before checking for Dataview
        // This ensures Dataview has had a chance to initialize first
        this.app.workspace.onLayoutReady(() => this.initializePlugin())
    }

    /**
     * Initialize the plugin after the workspace layout is ready.
     * This ensures that dependent plugins like Dataview have finished loading.
     */
    private async initializePlugin() {
        // Retrieve the Dataview API
        this.dataviewApi = getDataviewApi(this.app)

        if (!this.dataviewApi) {
            const errMessage =
                'The Dataview plugin is not installed or enabled. Please make sure it is installed and enabled, then restart Obsidian'
            log(errMessage, 'error')
            new Notice(errMessage, NOTICE_TIMEOUT)

            // DO NOTHING unless Dataview is installed and enabled
            return
        }

        await this.loadSettings()

        // Only set up automatic event handlers if the user hasn't disabled them
        if (!this.settings.disableAutomaticUpdates) {
            this.setupEventHandlers()
        }

        // Add a settings screen for the plugin
        this.addSettingTab(new SettingsTab(this.app, this))

        // Add commands
        this.addCommand({
            id: 'serialize-all-dataview-queries',
            name: 'Scan and serialize all Dataview queries',
            callback: async () => {
                log('Scanning and serializing all Dataview queries', 'debug')
                const allVaultFiles = this.app.vault.getMarkdownFiles()
                const allErrors: Array<{
                    filePath: string
                    error: { message: string; query: string }
                }> = []

                for (const vaultFile of allVaultFiles) {
                    const result = await this.processFile(vaultFile, false, undefined, true)
                    for (const error of result.errors) {
                        allErrors.push({ filePath: result.filePath, error })
                    }
                }

                // Show error notifications if enabled
                if (this.settings.showErrorNotifications && allErrors.length > 0) {
                    // Show up to MAX_ERROR_NOTIFICATIONS individual errors
                    const errorsToShow = allErrors.slice(0, MAX_ERROR_NOTIFICATIONS)
                    for (const { filePath, error } of errorsToShow) {
                        this.createQueryErrorNotice(error, filePath)
                    }

                    // Show summary if there are more errors
                    if (allErrors.length > MAX_ERROR_NOTIFICATIONS) {
                        new Notice(
                            `${allErrors.length - MAX_ERROR_NOTIFICATIONS} more query error(s) occurred. Check console for details.`,
                            NOTICE_TIMEOUT
                        )
                    }
                }
            }
        })

        this.addCommand({
            id: 'serialize-current-file-dataview-queries',
            name: 'Scan and serialize Dataview queries in current file',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile()

                if (!activeFile) {
                    new Notice('No active file')
                    return
                }

                if (activeFile.extension !== MARKDOWN_FILE_EXTENSION) {
                    new Notice('The active file is not a Markdown file')
                    return
                }

                log(`Scanning and serializing Dataview queries in: ${activeFile.path}`, 'debug')
                const result = await this.processFile(activeFile, true, undefined, true)

                // Show error notifications if enabled
                if (this.settings.showErrorNotifications && result.errors.length > 0) {
                    for (const error of result.errors) {
                        this.createQueryErrorNotice(error, result.filePath)
                    }
                } else {
                    new Notice(`Dataview queries serialized in: ${activeFile.name}`)
                }
            }
        })

        // Add command to insert dataview serializer block
        this.addCommand({
            id: 'insert-dataview-serializer-block',
            name: 'Insert Dataview serializer block',
            editorCallback: (editor) => {
                const cursor = editor.getCursor()
                const line = editor.getLine(cursor.line)
                const indentation = line.match(/^(\s*)/)?.[1] || ''

                // Insert the dataview serializer block template
                const template = `${indentation}${QUERY_FLAG_OPEN}LIST FROM #foo ${QUERY_FLAG_CLOSE}`

                editor.replaceRange(template, cursor)

                // Position cursor after "LIST" so user can replace it with their query
                const listStartPos = template.indexOf('LIST FROM #foo')
                const newCursor = {
                    line: cursor.line,
                    ch: cursor.ch + listStartPos
                }
                const newCursorEnd = {
                    line: cursor.line,
                    ch: cursor.ch + listStartPos + 14 // Length of "LIST FROM #foo"
                }

                editor.setSelection(newCursor, newCursorEnd)

                new Notice(
                    'Dataview serializer block inserted. Replace "LIST FROM #foo" with your query.'
                )
            }
        })

        // Add command to convert Dataview query at cursor to serialized format
        this.addCommand({
            id: 'convert-dataview-query-at-cursor',
            name: 'Convert Dataview query at cursor to serialized format',
            editorCallback: async (editor) => {
                const activeFile = this.app.workspace.getActiveFile()

                if (!activeFile) {
                    new Notice('No active file')
                    return
                }

                if (activeFile.extension !== MARKDOWN_FILE_EXTENSION) {
                    new Notice('The active file is not a Markdown file')
                    return
                }

                const text = editor.getValue()

                // Check if there's a selection
                const selection = editor.getSelection()
                if (selection && selection.length > 0) {
                    // Convert queries in the selection
                    const result = convertSelectedQuery(selection)

                    if (!result.converted) {
                        if (result.skipped.length > 0) {
                            new Notice(
                                `No supported Dataview queries found in selection. Skipped unsupported queries: ${result.skipped.join(', ')}`
                            )
                        } else {
                            new Notice('No Dataview queries found in selection')
                        }
                        return
                    }

                    editor.replaceSelection(result.newText)

                    if (result.skipped.length > 0) {
                        new Notice(
                            `Converted ${result.count} query(ies). Skipped unsupported: ${result.skipped.join(', ')}`
                        )
                    } else {
                        new Notice(
                            `Converted ${result.count} Dataview query(ies) to serialized format`
                        )
                    }
                } else {
                    // Convert query at cursor position
                    const cursor = editor.getCursor()

                    // Calculate cursor offset
                    let cursorOffset = 0
                    for (let i = 0; i < cursor.line; i++) {
                        cursorOffset += editor.getLine(i).length + 1 // +1 for newline
                    }
                    cursorOffset += cursor.ch

                    const result = convertQueryAtCursor(text, cursorOffset)

                    if (!result.converted) {
                        if (result.skipped.length > 0) {
                            new Notice(
                                `No supported Dataview query at cursor. Skipped unsupported query: ${result.skipped[0]}`
                            )
                        } else {
                            new Notice(
                                'No Dataview query found at cursor. Place cursor inside a ```dataview block or inline query.'
                            )
                        }
                        return
                    }

                    editor.setValue(result.newText)
                    new Notice('Converted Dataview query to serialized format')
                }
            }
        })

        // Add command to convert all Dataview queries in current file to serialized format
        this.addCommand({
            id: 'convert-all-dataview-queries-in-file',
            name: 'Convert all Dataview queries in current file to serialized format',
            editorCallback: async (editor) => {
                const activeFile = this.app.workspace.getActiveFile()

                if (!activeFile) {
                    new Notice('No active file')
                    return
                }

                if (activeFile.extension !== MARKDOWN_FILE_EXTENSION) {
                    new Notice('The active file is not a Markdown file')
                    return
                }

                const text = editor.getValue()
                const result = convertAllQueries(text)

                if (!result.converted) {
                    if (result.skipped.length > 0) {
                        new Notice(
                            `No supported Dataview queries found. Skipped unsupported queries: ${result.skipped.join(', ')}`
                        )
                    } else {
                        new Notice('No Dataview queries found in the current file')
                    }
                    return
                }

                editor.setValue(result.newText)

                if (result.skipped.length > 0) {
                    new Notice(
                        `Converted ${result.count} query(ies). Skipped unsupported: ${result.skipped.join(', ')}`
                    )
                } else {
                    new Notice(`Converted ${result.count} Dataview query(ies) to serialized format`)
                }
            }
        })

        this.registerEditorExtension(
            refreshButtonExtension(this.app, () => this.settings, this.processFile.bind(this))
        )
    }

    override onunload() {}

    /**
     * Load the plugin settings
     */
    async loadSettings() {
        log('Loading settings', 'debug')
        let loadedSettings = (await this.loadData()) as PluginSettings

        if (!loadedSettings) {
            log('Using default settings', 'debug')
            loadedSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)
        }

        let needToSaveSettings = false

        this.settings = produce(this.settings, (draft: Draft<PluginSettings>) => {
            if (
                loadedSettings.foldersToScan !== undefined &&
                loadedSettings.foldersToScan !== null &&
                Array.isArray(loadedSettings.foldersToScan)
            ) {
                draft.foldersToScan = loadedSettings.foldersToScan
            } else {
                log('The loaded settings miss the [foldersToScan] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.ignoredFolders !== undefined &&
                loadedSettings.ignoredFolders !== null &&
                Array.isArray(loadedSettings.ignoredFolders)
            ) {
                draft.ignoredFolders = loadedSettings.ignoredFolders
            } else {
                log('The loaded settings miss the [ignoredFolders] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.disableAutomaticUpdates !== undefined &&
                loadedSettings.disableAutomaticUpdates !== null &&
                typeof loadedSettings.disableAutomaticUpdates === 'boolean'
            ) {
                draft.disableAutomaticUpdates = loadedSettings.disableAutomaticUpdates
            } else {
                log('The loaded settings miss the [disableAutomaticUpdates] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.showRefreshButton !== undefined &&
                loadedSettings.showRefreshButton !== null &&
                typeof loadedSettings.showRefreshButton === 'boolean'
            ) {
                draft.showRefreshButton = loadedSettings.showRefreshButton
            } else {
                log('The loaded settings miss the [showRefreshButton] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.foldersToForceUpdate !== undefined &&
                loadedSettings.foldersToForceUpdate !== null &&
                Array.isArray(loadedSettings.foldersToForceUpdate)
            ) {
                draft.foldersToForceUpdate = loadedSettings.foldersToForceUpdate
            } else {
                log('The loaded settings miss the [foldersToForceUpdate] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.showErrorNotifications !== undefined &&
                loadedSettings.showErrorNotifications !== null &&
                typeof loadedSettings.showErrorNotifications === 'boolean'
            ) {
                draft.showErrorNotifications = loadedSettings.showErrorNotifications
            } else {
                log('The loaded settings miss the [showErrorNotifications] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.debugLogging !== undefined &&
                loadedSettings.debugLogging !== null &&
                typeof loadedSettings.debugLogging === 'boolean'
            ) {
                draft.debugLogging = loadedSettings.debugLogging
            } else {
                log('The loaded settings miss the [debugLogging] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.addTrailingNewline !== undefined &&
                loadedSettings.addTrailingNewline !== null &&
                typeof loadedSettings.addTrailingNewline === 'boolean'
            ) {
                draft.addTrailingNewline = loadedSettings.addTrailingNewline
            } else {
                log('The loaded settings miss the [addTrailingNewline] property', 'debug')
                needToSaveSettings = true
            }

            if (
                loadedSettings.linkFormat !== undefined &&
                loadedSettings.linkFormat !== null &&
                (loadedSettings.linkFormat === 'obsidian' ||
                    loadedSettings.linkFormat === 'shortest' ||
                    loadedSettings.linkFormat === 'absolute')
            ) {
                draft.linkFormat = loadedSettings.linkFormat
            } else {
                log('The loaded settings miss the [linkFormat] property', 'debug')
                needToSaveSettings = true
            }
        })

        // Initialize debug mode from settings
        setDebugMode(this.settings.debugLogging)

        log(`Settings loaded`, 'debug', loadedSettings)

        if (needToSaveSettings) {
            this.saveSettings()
        }
    }

    /**
     * Save the plugin settings
     */
    async saveSettings() {
        log('Saving settings', 'debug')
        await this.saveData(this.settings)
        log('Settings saved', 'debug', this.settings)
    }

    /**
     * Add the event handlers
     */
    setupEventHandlers() {
        // Only register if not already registered
        if (this.createEventRef || this.modifyEventRef || this.renameEventRef) {
            log('Event handlers already registered, skipping setup', 'debug')
            return
        }

        // Register events after layout is built to avoid initial wave of 'create' events
        this.app.workspace.onLayoutReady(async () => {
            this.createEventRef = this.app.vault.on('create', (file) => {
                this.recentlyUpdatedFiles.add(file)
                this.scheduleUpdate()
                this.scheduleForcedUpdate()
            })
            this.registerEvent(this.createEventRef)

            this.renameEventRef = this.app.vault.on('rename', (file) => {
                this.recentlyUpdatedFiles.add(file)
                this.scheduleUpdate()
                this.scheduleForcedUpdate()
            })
            this.registerEvent(this.renameEventRef)

            this.modifyEventRef = this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && this.filesToIgnoreFileEvents.has(file.path)) {
                    log(
                        `Ignoring modify event for ${file.path} as it was triggered by the plugin itself`,
                        'debug'
                    )
                    this.filesToIgnoreFileEvents.delete(file.path)
                    return
                }

                this.recentlyUpdatedFiles.add(file)
                this.scheduleUpdate()
                this.scheduleForcedUpdate()
            })
            this.registerEvent(this.modifyEventRef)

            log('Event handlers registered for automatic updates', 'debug')
        })
    }

    /**
     * Remove the event handlers for automatic updates
     */
    unregisterEventHandlers() {
        if (this.createEventRef) {
            this.app.vault.offref(this.createEventRef)
            this.createEventRef = null
        }
        if (this.modifyEventRef) {
            this.app.vault.offref(this.modifyEventRef)
            this.modifyEventRef = null
        }
        if (this.renameEventRef) {
            this.app.vault.offref(this.renameEventRef)
            this.renameEventRef = null
        }

        log('Event handlers unregistered for automatic updates', 'debug')
    }

    async processFile(
        _file: TAbstractFile,
        force = false,
        targetQuery?: string,
        isManualTrigger = false
    ): Promise<FileProcessingResult> {
        const emptyResult: FileProcessingResult = { filePath: '', errors: [] }

        if (!(_file instanceof TFile)) {
            return emptyResult
        }

        // Safe from here on
        const file = _file as TFile
        const result: FileProcessingResult = { filePath: file.path, errors: [] }

        const shouldBeIgnored = await this.shouldFileBeIgnored(file, force)
        if (shouldBeIgnored) {
            return result
        }

        try {
            //log(`Processing file: ${file.path}`, 'debug');

            const text = await this.app.vault.cachedRead(file)
            const foundQueries: QueryWithContext[] = findQueries(text)
            const foundInlineQueries: InlineQueryWithContext[] = findInlineQueries(text)

            if (foundQueries.length === 0 && foundInlineQueries.length === 0) {
                // No queries to serialize found in the file
                return result
            }

            // Process the modified file
            let updatedText = `${text}` // To ensure we have access to replaceAll...

            // NOTE: We no longer strip serialized content upfront because:
            // 1. The replacement regex already handles replacing existing serialized blocks
            // 2. Stripping upfront breaks idempotency - if content hasn't changed, we skip
            //    the replacement, but the stripped content is never added back
            // 3. Orphaned serialized blocks (where query was removed) are left as-is
            //    which is safer than accidentally removing user content

            // Serialize the supported queries in memory
            log(`[DEBUG] Processing ${foundQueries.length} queries in file [${file.path}]`, 'debug')
            for (const queryWithContext of foundQueries) {
                const foundQuery = queryWithContext.query
                const updateMode = queryWithContext.updateMode
                const flagOpen = queryWithContext.flagOpen
                const flagClose = queryWithContext.flagClose

                log(
                    `[DEBUG] Query: "${foundQuery}", mode: ${updateMode}, flagOpen: "${flagOpen}", flagClose: "${flagClose}"`,
                    'debug'
                )

                // If we are targeting a specific query, skip others
                if (targetQuery && foundQuery !== targetQuery) {
                    continue
                }

                // Check if query is already serialized (needed for 'once' mode check)
                const alreadySerializedRegex = new RegExp(
                    `${escapeRegExp(SERIALIZED_QUERY_START)}${escapeRegExp(foundQuery)}${escapeRegExp(QUERY_FLAG_CLOSE)}`,
                    'm'
                )
                const isAlreadySerialized = !!text.match(alreadySerializedRegex)
                log(`[DEBUG] isAlreadySerialized: ${isAlreadySerialized}`, 'debug')

                // Skip queries based on update mode during automatic updates
                if (shouldSkipQuery({ updateMode, isManualTrigger, isAlreadySerialized })) {
                    log(`[DEBUG] Skipping query due to shouldSkipQuery`, 'debug')
                    continue
                }

                const indentation = queryWithContext.indentation
                log(`Processing query: [${foundQuery}] in file [${file.path}]`, 'debug')
                // Reference: https://github.com/IdreesInc/Waypoint/blob/master/main.ts
                const serializationResult: QuerySerializationResult = await serializeQuery({
                    query: foundQuery,
                    originFile: file.path,
                    dataviewApi: this.dataviewApi!,
                    app: this.app,
                    indentation,
                    linkFormat: this.settings.linkFormat
                })

                // Check for errors
                if (!serializationResult.success && serializationResult.error) {
                    log(
                        `[DEBUG] Serialization error: ${serializationResult.error.message}`,
                        'debug'
                    )
                    result.errors.push(serializationResult.error)
                    continue
                }

                const serializedQuery = serializationResult.serializedContent

                log(
                    `[DEBUG] Serialized content length: ${serializedQuery.length}, content: "${serializedQuery.substring(0, 100)}..."`,
                    'debug'
                )

                // Idempotency check: compare new result with existing serialized content
                // If they're identical, skip this query to prevent unnecessary file modifications
                // This prevents infinite update loops for queries that always produce the same output
                const existingSerializedRegex = new RegExp(
                    `${escapeRegExp(SERIALIZED_QUERY_START)}${escapeRegExp(foundQuery)}${escapeRegExp(QUERY_FLAG_CLOSE)}\\n([\\s\\S]*?)${escapeRegExp(SERIALIZED_QUERY_END)}`,
                    'm'
                )
                const existingMatch = text.match(existingSerializedRegex)
                log(`[DEBUG] Idempotency check - existingMatch found: ${!!existingMatch}`, 'debug')
                if (existingMatch) {
                    // Extract the content between the markers (group 1)
                    // For tables, there's an extra newline at the start
                    const existingContent = existingMatch[1]?.trim() ?? ''
                    const newContent = serializedQuery.trim()

                    log(
                        `[DEBUG] Idempotency - existing length: ${existingContent.length}, new length: ${newContent.length}, match: ${existingContent === newContent}`,
                        'debug'
                    )

                    if (existingContent === newContent) {
                        log(
                            `Skipping query in [${file.path}] - content unchanged: "${foundQuery}"`,
                            'debug'
                        )
                        continue
                    }
                }

                if ('' !== serializedQuery) {
                    const escapedQuery = escapeRegExp(foundQuery)
                    const escapedIndentation = escapeRegExp(indentation)
                    const escapedFlagOpen = escapeRegExp(flagOpen)

                    // Match the Query Definition Line, optionally followed by an existing Serialized Block
                    const escapedSerializedStart = escapeRegExp(SERIALIZED_QUERY_START)
                    const escapedSerializedEnd = escapeRegExp(SERIALIZED_QUERY_END)
                    // Use flagClose for the query definition (preserves user's format)
                    const escapedQueryDefClose = escapeRegExp(flagClose)
                    // Always use QUERY_FLAG_CLOSE for SerializedQuery markers (plugin-generated, standard format)
                    const escapedSerializedClose = escapeRegExp(QUERY_FLAG_CLOSE)

                    let queryToSerializeRegex: RegExp

                    // Check if this is a multi-line query
                    const originalQueryDefinition = queryWithContext.originalQueryDefinition
                    log(
                        `[DEBUG] Is multi-line query: ${!!originalQueryDefinition}, indentation: "${indentation}"`,
                        'debug'
                    )
                    if (originalQueryDefinition) {
                        // Multi-line query: match the original multi-line definition
                        // Note: originalQueryDefinition already includes the closing flag
                        const escapedOriginalDefinition = escapeRegExp(originalQueryDefinition)
                        queryToSerializeRegex = new RegExp(
                            `(${escapedOriginalDefinition}\\n)(?:${escapedSerializedStart}${escapedQuery}${escapedSerializedClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
                            'gm'
                        )
                    } else {
                        // Single-line query (existing behavior)
                        // Regex breakdown:
                        // Group 1: The Query Definition line (preserved for normal modes)
                        // Non-capturing Group: The optional existing serialized block (replaced)
                        // Note: We match the exact query without .* to prevent similar queries from
                        // matching each other (e.g., "LIST FROM #project" should not match
                        // "LIST FROM #project and #done")
                        queryToSerializeRegex = new RegExp(
                            `^(${escapedIndentation}${escapedFlagOpen}${escapedQuery}${escapedQueryDefClose}\\n)(?:${escapedSerializedStart}${escapedQuery}${escapedSerializedClose}\\n[\\s\\S]*?${escapedSerializedEnd}\\n)?`,
                            'gm'
                        )
                    }

                    log(`[DEBUG] Replacement regex: ${queryToSerializeRegex.source}`, 'debug')

                    // Test if the regex matches and what it matches
                    const regexTestMatch = updatedText.match(queryToSerializeRegex)
                    log(
                        `[DEBUG] Regex test - matches: ${regexTestMatch ? regexTestMatch.length : 0}, matched text length: ${regexTestMatch?.[0]?.length ?? 0}`,
                        'debug'
                    )
                    if (regexTestMatch) {
                        log(
                            `[DEBUG] Matched text (first 200 chars): "${regexTestMatch[0]?.substring(0, 200)}"`,
                            'debug'
                        )
                    }

                    let queryAndSerializedQuery = ''

                    // Determine if we need a trailing newline before the END marker
                    // This is needed for indented content (to maintain structure) or
                    // when the setting is enabled (for static site generators like Jekyll)
                    const needsTrailingNewline =
                        indentation.length > 0 || this.settings.addTrailingNewline

                    if (updateMode === 'once-and-eject') {
                        // For 'once-and-eject', remove all tags and leave only the serialized content
                        // Add a trailing newline to maintain proper document structure
                        queryAndSerializedQuery = `${serializedQuery}\n`
                    } else if (originalQueryDefinition) {
                        // Multi-line query: preserve the original multi-line format
                        // The SerializedQuery marker uses the normalized query for matching
                        if (isTableQuery(foundQuery)) {
                            queryAndSerializedQuery = `${originalQueryDefinition}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n\n${serializedQuery}\n${
                                needsTrailingNewline ? '\n' : ''
                            }${SERIALIZED_QUERY_END}\n`
                        } else {
                            queryAndSerializedQuery = `${originalQueryDefinition}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n${serializedQuery}\n${
                                needsTrailingNewline ? '\n' : ''
                            }${SERIALIZED_QUERY_END}\n`
                        }
                    } else if (isTableQuery(foundQuery)) {
                        // Single-line table query
                        // Use flagClose for the query definition (preserves user's format)
                        // Use QUERY_FLAG_CLOSE for SerializedQuery markers (plugin-generated)
                        queryAndSerializedQuery = `${indentation}${flagOpen}${foundQuery}${flagClose}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n\n${serializedQuery}\n${
                            needsTrailingNewline ? '\n' : ''
                        }${SERIALIZED_QUERY_END}\n`
                    } else {
                        // Single-line list query
                        // Use flagClose for the query definition (preserves user's format)
                        // Use QUERY_FLAG_CLOSE for SerializedQuery markers (plugin-generated)
                        queryAndSerializedQuery = `${indentation}${flagOpen}${foundQuery}${flagClose}\n${SERIALIZED_QUERY_START}${foundQuery}${QUERY_FLAG_CLOSE}\n${serializedQuery}\n${
                            needsTrailingNewline ? '\n' : ''
                        }${SERIALIZED_QUERY_END}\n`
                    }
                    log(
                        `[DEBUG] Replacement string length: ${queryAndSerializedQuery.length}, first 200 chars: "${queryAndSerializedQuery.substring(0, 200)}"`,
                        'debug'
                    )

                    const textLengthBefore = updatedText.length
                    updatedText = updatedText.replace(
                        queryToSerializeRegex,
                        queryAndSerializedQuery
                    )
                    log(
                        `[DEBUG] After replacement - text length before: ${textLengthBefore}, after: ${updatedText.length}, diff: ${updatedText.length - textLengthBefore}`,
                        'debug'
                    )
                }
            }

            // Process inline queries
            updatedText = await this.processInlineQueries(
                updatedText,
                text,
                file.path,
                result,
                targetQuery,
                isManualTrigger
            )

            // Keep track of the last time this file was updated to avoid modification loops
            const nextPossibleUpdateTimeForFile = add(new Date(), {
                seconds: MINIMUM_SECONDS_BETWEEN_UPDATES
            })
            this.nextPossibleUpdates.set(file.path, nextPossibleUpdateTimeForFile)

            // Save the updated version
            log(
                `[DEBUG] Final check - original length: ${text.length}, updated length: ${updatedText.length}, will save: ${updatedText !== text}`,
                'debug'
            )

            if (updatedText !== text) {
                if (targetQuery) {
                    this.filesToIgnoreFileEvents.add(file.path)
                    // Safety net: ensure the file is eventually removed from the ignore list
                    // even if the modify event doesn't fire or an error occurs.
                    window.setTimeout(() => {
                        if (this.filesToIgnoreFileEvents.has(file.path)) {
                            this.filesToIgnoreFileEvents.delete(file.path)
                        }
                    }, 2000)
                }
                //log('The file content has changed. Saving the modifications', 'info');
                await this.app.vault.modify(file, updatedText)
            }
        } catch (e: unknown) {
            // Ensure cleanup on error
            if (this.filesToIgnoreFileEvents.has(file.path)) {
                this.filesToIgnoreFileEvents.delete(file.path)
            }
            log('Failed to process the file', 'warn', e)
        }

        return result
    }

    /**
     * Process inline queries in the given text.
     * This handles expressions like `<!-- IQ: =this.field -->value<!-- /IQ -->`.
     *
     * @param updatedText The current text content (may have been modified by block query processing)
     * @param originalText The original file text (for idempotency checks)
     * @param filePath The file path for evaluation context
     * @param result The file processing result to add errors to
     * @param targetQuery Optional specific query to process
     * @param isManualTrigger Whether this is a manual trigger (vs automatic)
     * @returns The updated text with serialized inline queries
     */
    private async processInlineQueries(
        updatedText: string,
        _originalText: string,
        filePath: string,
        result: FileProcessingResult,
        targetQuery?: string,
        isManualTrigger = false
    ): Promise<string> {
        const foundInlineQueries: InlineQueryWithContext[] = findInlineQueries(updatedText)

        if (foundInlineQueries.length === 0) {
            return updatedText
        }

        // Process inline queries in reverse order to preserve offsets
        const sortedQueries = [...foundInlineQueries].sort((a, b) => b.startOffset - a.startOffset)

        for (const inlineQuery of sortedQueries) {
            const { expression, updateMode, currentResult, fullMatch, startOffset } = inlineQuery

            // If we are targeting a specific query, skip others
            if (targetQuery && expression !== targetQuery) {
                continue
            }

            // Check if query is already serialized (for 'once' mode check)
            const isAlreadySerialized = currentResult !== undefined && currentResult !== ''

            // Skip queries based on update mode during automatic updates
            if (shouldSkipQuery({ updateMode, isManualTrigger, isAlreadySerialized })) {
                continue
            }

            // Determine if this is inside a table
            const inTable = isInsideTable(updatedText, startOffset)

            // Serialize the inline query
            const serializationResult = await serializeInlineQuery({
                expression,
                originFile: filePath,
                dataviewApi: this.dataviewApi!,
                isTableCell: inTable
            })

            // Check for errors
            if (!serializationResult.success && serializationResult.error) {
                result.errors.push({
                    message: serializationResult.error.message,
                    query: expression
                })
                continue
            }

            const serializedContent = serializationResult.serializedContent

            // Idempotency check: compare new result with existing serialized content
            if (currentResult !== undefined) {
                const existingContent = currentResult.trim()
                const newContent = serializedContent.trim()

                if (existingContent === newContent) {
                    log(
                        `Skipping inline query in [${filePath}] - content unchanged: "${expression}"`,
                        'debug'
                    )
                    continue
                }
            }

            // Build the replacement
            let replacement: string
            if (updateMode === 'once-and-eject') {
                // For 'once-and-eject', remove all tags and leave only the serialized content
                replacement = serializedContent
            } else {
                // Build the serialized inline query with markers
                replacement = buildSerializedInlineQuery(expression, serializedContent, updateMode)
            }

            // Replace the full match with the new content
            updatedText =
                updatedText.substring(0, startOffset) +
                replacement +
                updatedText.substring(startOffset + fullMatch.length)
        }

        return updatedText
    }

    async shouldFileBeIgnored(file: TFile, force = false): Promise<boolean> {
        if (!file.path) {
            return true
        }

        if (MARKDOWN_FILE_EXTENSION !== file.extension) {
            return true
        }

        // Ignored Canvas files
        if (DEFAULT_CANVAS_FILE_NAME === file.name) {
            return true
        }

        const fileContent = (await this.app.vault.read(file)).trim()

        if (fileContent.length === 0) {
            return true
        }

        if (isExcalidrawFile(file)) {
            return true
        }

        if (force) {
            return false
        }

        // Make sure the file was not modified too recently (avoid update loops)
        if (this.nextPossibleUpdates.has(file.path)) {
            const nextPossibleUpdateForFile = this.nextPossibleUpdates.get(file.path)!

            if (isBefore(file.stat.mtime, nextPossibleUpdateForFile)) {
                log('File has been updated recently. Ignoring', 'debug', file.path)
                return true
            } else {
                log('File has not been updated recently. Processing', 'debug', file.path)
            }
        }

        return this.settings.ignoredFolders.some((ignoredFolder) => {
            if (file.path.startsWith(ignoredFolder)) {
                //log(`Skipping because the file is part of an ignored folder: [${ignoredFolder}]`, 'debug');
                return true
            } else {
                return false
            }
        })
    }
}
