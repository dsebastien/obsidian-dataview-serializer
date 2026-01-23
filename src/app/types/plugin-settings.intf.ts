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
}

export const DEFAULT_SETTINGS: PluginSettings = {
    foldersToScan: [],
    ignoredFolders: [],
    disableAutomaticUpdates: false,
    showRefreshButton: true,
    foldersToForceUpdate: []
}
