export interface PluginSettings {
  foldersToScan: string[];
  ignoredFolders: string[];
  disableAutomaticUpdates: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  foldersToScan: [],
  ignoredFolders: [],
  disableAutomaticUpdates: false,
};
