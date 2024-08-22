export interface PluginSettings {
  foldersToScan: string[];
  ignoredFolders: string[];
  enablePureLinks: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  foldersToScan: [],
  ignoredFolders: [],
  enablePureLinks: false,
};
