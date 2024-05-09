export interface PluginSettings {
  enabled: boolean;
  ignoredFolders: string[]; // FIXME rename to foldersToKeepUpdatedAutomatically
  filesWithQueriesToSerialize: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  enabled: false,
  ignoredFolders: [],
  filesWithQueriesToSerialize: [],
};
