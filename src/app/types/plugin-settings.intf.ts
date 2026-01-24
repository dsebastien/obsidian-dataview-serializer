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
}

export const DEFAULT_SETTINGS: PluginSettings = {
    foldersToScan: [],
    ignoredFolders: [],
    disableAutomaticUpdates: false,
    showRefreshButton: true,
    foldersToForceUpdate: [],
    showErrorNotifications: true,
    debugLogging: false,
    addTrailingNewline: false
}
