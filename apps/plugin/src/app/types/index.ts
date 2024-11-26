export interface PluginSettings {
  foldersToScan: string[];
  ignoredFolders: string[];
  foldersToForceUpdate: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  foldersToScan: [],
  ignoredFolders: [],
  foldersToForceUpdate: [],
};
