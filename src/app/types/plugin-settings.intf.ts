export interface PluginSettings {
    foldersToScan: string[]
    ignoredFolders: string[]
    disableAutomaticUpdates: boolean
    showRefreshButton: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
    foldersToScan: [],
    ignoredFolders: [],
    disableAutomaticUpdates: false,
    showRefreshButton: true
}
