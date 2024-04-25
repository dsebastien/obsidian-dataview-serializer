export interface PluginSettings {
  /**
   * Enable
   */
  enabled: boolean;
  // TODO add excluded folders
}

export const DEFAULT_SETTINGS: PluginSettings = {
  enabled: false,
};
