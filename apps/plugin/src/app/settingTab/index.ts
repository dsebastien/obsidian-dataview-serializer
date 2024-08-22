import { App, PluginSettingTab, SearchComponent, Setting } from 'obsidian';
import { DataviewSerializerPlugin } from '../plugin';
import { Draft, produce } from 'immer';
import { PluginSettings } from '../types';
import { onlyUniqueArray } from '../utils/only-unique-array.tn';
import { FolderSuggest } from '../utils/folder-suggest';
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

    this.renderFoldersToScan();
    this.renderFoldersToIgnore();
    this.renderPureLinks();
    this.renderFollowButton(containerEl);
    this.renderSupportHeader(containerEl);
  }

  renderFollowButton(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName('Follow me on X')
      .setDesc('@dSebastien')
      .addButton((button) => {
        button.setCta();
        button.setButtonText('Follow me on X').onClick(() => {
          window.open('https://x.com/dSebastien');
        });
      });
  }

  renderSupportHeader(containerEl: HTMLElement) {
    new Setting(containerEl).setName('Support').setHeading();

    const supportDesc = new DocumentFragment();
    supportDesc.createDiv({
      text: 'Buy me a coffee to support the development of this plugin ❤️',
    });

    new Setting(containerEl).setDesc(supportDesc);

    this.renderBuyMeACoffeeBadge(containerEl);
    const spacing = containerEl.createDiv();
    spacing.classList.add('support-header-margin');
  }

  renderFoldersToScan(): void {
    this.doSearchAndRemoveList({
      currentList: this.plugin.settings.foldersToScan,
      setValue: async (newValue) => {
        this.plugin.settings = produce(
          this.plugin.settings,
          (draft: Draft<PluginSettings>) => {
            draft.foldersToScan = newValue;
          }
        );
      },
      name: 'Folders to scan',
      description: 'Folders to scan when looking for queries to serialize.',
    });
  }

  renderFoldersToIgnore(): void {
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
      name: 'Folders to ignore',
      description: 'Folders to ignore when processing added/modified files.',
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
        new FolderSuggest(cb.inputEl, this.app);
        cb.setPlaceholder('Example: folder1/folder2');
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

  renderBuyMeACoffeeBadge(
    contentEl: HTMLElement | DocumentFragment,
    width = 175
  ) {
    const linkEl = contentEl.createEl('a', {
      href: 'https://www.buymeacoffee.com/dsebastien',
    });
    const imgEl = linkEl.createEl('img');
    imgEl.src =
      'https://github.com/dsebastien/obsidian-plugin-template/raw/main/apps/plugin/src/assets/buy-me-a-coffee.png';
    imgEl.alt = 'Buy me a coffee';
    imgEl.width = width;
  }

  renderPureLinks() {
    new Setting(this.containerEl)
      .setName('Use pure (short) links')
      .setDesc(
        'If set, only the note title will be output. Otherwise the full path name is used. If you have multiple notes with the same title, you name need to leave this disabled.'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enablePureLinks)
          .onChange(async () => {
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }
}
