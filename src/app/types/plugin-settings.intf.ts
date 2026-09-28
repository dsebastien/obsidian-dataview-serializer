/**
 * Link format options for serialized query output.
 * - 'obsidian': Use Obsidian's "New link format" setting (default)
 * - 'shortest': Simplify links when filename is unique in vault
 * - 'absolute': Always use full path for consistency across devices
 */
export type LinkFormat = 'obsidian' | 'shortest' | 'absolute'

export interface PluginSettings {
    foldersToScan: string[]
    ignoredFolders: string[]
    disableAutomaticUpdates: boolean
    showRefreshButton: boolean
    /**
     * Folders containing files that should be updated when ANY file in the vault changes.
     * Useful for index files with queries that aggregate data from elsewhere in the vault.
     */
    foldersToForceUpdate: string[]
    /**
     * Show notification popups when queries fail to serialize.
     */
    showErrorNotifications: boolean
    /**
     * Enable verbose debug logging in the console.
     */
    debugLogging: boolean
    /**
     * Add an empty line between the serialized content and the END marker.
     * Useful for static site generators like Jekyll that need blank lines after tables/lists.
     */
    addTrailingNewline: boolean
    /**
     * Format for internal links in serialized output.
     * - 'obsidian': Use Obsidian's "New link format" setting
     * - 'shortest': Simplify links when filename is unique (default)
     * - 'absolute': Always use full path for consistency across devices
     */
    linkFormat: LinkFormat
    /**
     * Enable DataviewJS query serialization.
     * When enabled, JavaScript-based Dataview queries can be serialized to static markdown.
     * Default: true
     */
    enableDataviewJS: boolean
}

/**
 * A fresh default settings object, safe to hand to Immer.
 *
 * `produce` deep-freezes what it returns, including any subtree it shares
 * with its base. Producing from the shared DEFAULT_SETTINGS froze that
 * constant (nested values too) for the rest of the process, so any later code
 * or test touching it failed with "Attempted to assign to readonly
 * property". Produce from this instead, and keep it deep-fresh: build
 * nested arrays and objects as new values, never by spreading DEFAULT_SETTINGS.
 */
export function createDefaultSettings(): PluginSettings {
    return {
        foldersToScan: [],
        ignoredFolders: [],
        disableAutomaticUpdates: false,
        showRefreshButton: true,
        foldersToForceUpdate: [],
        showErrorNotifications: true,
        debugLogging: false,
        addTrailingNewline: false,
        linkFormat: 'shortest',
        enableDataviewJS: true
    }
}

/** The defaults, for reading and comparing. Never produce from it. */
export const DEFAULT_SETTINGS: PluginSettings = createDefaultSettings()
