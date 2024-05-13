export interface PluginSettings {
  foldersToWatch: string[]; // FIXME rename to foldersToKeepUpdatedAutomatically
  filesWithQueriesToSerialize: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  foldersToWatch: [],
  filesWithQueriesToSerialize: [],
};
