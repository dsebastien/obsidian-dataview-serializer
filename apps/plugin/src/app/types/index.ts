export interface PluginSettings {
  foldersToScan: string[];
  ignoredFolders: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  foldersToScan: [],
  ignoredFolders: [],
};
