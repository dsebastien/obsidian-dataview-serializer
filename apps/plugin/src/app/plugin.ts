import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './types';
import { SettingsTab } from './settingTab';
import { log } from './utils/log';
import {produce} from "immer";

export class MyPlugin extends Plugin {
  /**
   * The plugin settings are immutable
   */
  settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);

  /**
   * Executed as soon as the plugin loads
   */
  async onload() {
    log('Initializing', 'debug');
    await this.loadSettings();

    // TODO add command

    // Add a settings screen for the plugin
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onunload() {}

  /**
   * Load the plugin settings
   */
  async loadSettings() {
    log('Loading settings', 'debug');
    let loadedSettings = (await this.loadData()) as PluginSettings;

    if (!loadedSettings) {
      log('Using default settings', 'debug');
      loadedSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS);;
    }

    this.settings = produce(this.settings, (draft => {
      draft.enabled = loadedSettings.enabled;
    }));
    log(`Settings loaded`, 'debug', loadedSettings);
  }

  /**
   * Save the plugin settings
   */
  async saveSettings() {
    log('Saving settings', 'debug');
    await this.saveData(this.settings);
  }
}
