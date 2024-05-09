import { App, PluginSettingTab, SearchComponent, Setting } from 'obsidian';
import { DataviewSerializerPlugin } from '../plugin';
import { Draft, produce } from 'immer';
import { PluginSettings } from '../types';
import { onlyUniqueArray } from '../utils/only-unique-array.tn';
import { FolderSuggest } from './folder-suggester';
import { ArgsSearchAndRemove } from './args-search-and-remove.intf';

export class SettingsTab extends PluginSettingTab {
  plugin: DataviewSerializerPlugin;

  constructor(app: App, plugin: DataviewSerializerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName('Enabled').addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
        this.plugin.settings = produce(
          this.plugin.settings,
          (draft: Draft<PluginSettings>) => {
            draft.enabled = value;
          }
        );
        await this.plugin.saveSettings();
      })
    );

    this.addExcludedFoldersSetting();
  }

  addExcludedFoldersSetting(): void {
    this.doSearchAndRemoveList({
      currentList: this.plugin.settings.ignoredFolders,
      setValue: async (newValue) => {
        this.plugin.settings = produce(
          this.plugin.settings,
          (draft: Draft<PluginSettings>) => {
            draft.ignoredFolders = newValue;
          }
        );
      },
      name: 'Folders to exclude',
      description:
        'Any file updated in this folder will not trigger an updated and created update.',
    });
  }

  doSearchAndRemoveList({
    currentList,
    setValue,
    description,
    name,
  }: ArgsSearchAndRemove) {
    let searchInput: SearchComponent | undefined;
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addSearch((cb) => {
        searchInput = cb;
        new FolderSuggest(this.app, cb.inputEl);
        cb.setPlaceholder('Example: folder1/folder2');
        // @ts-expect-error Actually exists
        cb.containerEl.addClass('time_search');
      })
      .addButton((cb) => {
        cb.setIcon('plus');
        cb.setTooltip('Add folder');
        cb.onClick(async () => {
          if (!searchInput) {
            return;
          }
          const newFolder = searchInput.getValue();

          await setValue([...currentList, newFolder].filter(onlyUniqueArray));
          await this.plugin.saveSettings();
          searchInput.setValue('');
          this.display();
        });
      });

    currentList.forEach((ignoreFolder) =>
      new Setting(this.containerEl).setName(ignoreFolder).addButton((button) =>
        button.setButtonText('Remove').onClick(async () => {
          await setValue(currentList.filter((value) => value !== ignoreFolder));
          await this.plugin.saveSettings();
          this.display();
        })
      )
    );
  }
}
