import { App, PluginSettingTab, SearchComponent, Setting } from 'obsidian'
import type DataviewSerializerPlugin from '../../main'
import { produce } from 'immer'
import type { Draft } from 'immer'
import type { LinkFormat, PluginSettings } from '../types/plugin-settings.intf'
import { onlyUniqueArray } from '../utils/only-unique-array.fn'
import { FolderSuggest } from '../utils/folder-suggest'
import type { ArgsSearchAndRemove } from './args-search-and-remove.intf'
import { setDebugMode } from '../../utils/log'

export class SettingsTab extends PluginSettingTab {
    plugin: DataviewSerializerPlugin

    constructor(app: App, plugin: DataviewSerializerPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this

        containerEl.empty()

        this.renderAutomaticUpdatesToggle()
        this.renderRefreshButtonToggle()
        this.renderErrorNotificationsToggle()
        this.renderTrailingNewlineToggle()
        this.renderLinkFormatDropdown()
        this.renderDebugLoggingToggle()
        this.renderFoldersToScan()
        this.renderFoldersToIgnore()
        this.renderFoldersToForceUpdate()
        this.renderSupportSection(containerEl)
    }

    renderAutomaticUpdatesToggle(): void {
        new Setting(this.containerEl)
            .setName('Disable automatic updates')
            .setDesc(
                'When enabled, the plugin will not automatically serialize queries when files are created, modified, or renamed. You can still manually serialize queries using the command palette.'
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.disableAutomaticUpdates)
                    .onChange(async (value) => {
                        this.plugin.settings = produce(
                            this.plugin.settings,
                            (draft: Draft<PluginSettings>) => {
                                draft.disableAutomaticUpdates = value
                            }
                        )
                        await this.plugin.saveSettings()

                        // Immediately register or unregister event handlers based on new value
                        if (value) {
                            // User enabled "disable automatic updates" - unregister handlers
                            this.plugin.unregisterEventHandlers()
                        } else {
                            // User disabled "disable automatic updates" - register handlers
                            this.plugin.setupEventHandlers()
                        }
                    })
            })
    }

    renderRefreshButtonToggle(): void {
        new Setting(this.containerEl)
            .setName('Show refresh button')
            .setDesc(
                'When enabled, a refresh button will be displayed next to each serialized Dataview query.'
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.showRefreshButton).onChange(async (value) => {
                    this.plugin.settings = produce(
                        this.plugin.settings,
                        (draft: Draft<PluginSettings>) => {
                            draft.showRefreshButton = value
                        }
                    )
                    await this.plugin.saveSettings()
                })
            })
    }

    renderErrorNotificationsToggle(): void {
        new Setting(this.containerEl)
            .setName('Show error notifications')
            .setDesc(
                'When enabled, a notification popup will be displayed when a query fails to serialize.'
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.showErrorNotifications)
                    .onChange(async (value) => {
                        this.plugin.settings = produce(
                            this.plugin.settings,
                            (draft: Draft<PluginSettings>) => {
                                draft.showErrorNotifications = value
                            }
                        )
                        await this.plugin.saveSettings()
                    })
            })
    }

    renderTrailingNewlineToggle(): void {
        new Setting(this.containerEl)
            .setName('Add trailing newline')
            .setDesc(
                'When enabled, an empty line will be added between the serialized content and the END marker. Useful for static site generators like Jekyll that require blank lines after tables or lists.'
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.addTrailingNewline).onChange(async (value) => {
                    this.plugin.settings = produce(
                        this.plugin.settings,
                        (draft: Draft<PluginSettings>) => {
                            draft.addTrailingNewline = value
                        }
                    )
                    await this.plugin.saveSettings()
                })
            })
    }

    renderLinkFormatDropdown(): void {
        new Setting(this.containerEl)
            .setName('Link format')
            .setDesc(
                'Format for internal links in serialized output. "Use Obsidian setting" respects your vault\'s "New link format" preference. "Shortest path" simplifies links when the filename is unique. "Absolute path" always uses the full path, which ensures consistency when syncing vaults across devices.'
            )
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('obsidian', 'Use Obsidian setting')
                    .addOption('shortest', 'Shortest path when possible')
                    .addOption('absolute', 'Absolute path')
                    .setValue(this.plugin.settings.linkFormat)
                    .onChange(async (value) => {
                        this.plugin.settings = produce(
                            this.plugin.settings,
                            (draft: Draft<PluginSettings>) => {
                                draft.linkFormat = value as LinkFormat
                            }
                        )
                        await this.plugin.saveSettings()
                    })
            })
    }

    renderDebugLoggingToggle(): void {
        new Setting(this.containerEl)
            .setName('Debug logging')
            .setDesc(
                'When enabled, verbose debug messages will be logged to the console. Useful for troubleshooting.'
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.debugLogging).onChange(async (value) => {
                    this.plugin.settings = produce(
                        this.plugin.settings,
                        (draft: Draft<PluginSettings>) => {
                            draft.debugLogging = value
                        }
                    )
                    setDebugMode(value)
                    await this.plugin.saveSettings()
                })
            })
    }

    renderSupportSection(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Support').setHeading()

        new Setting(containerEl)
            .setName('Follow me on X')
            .setDesc('Sébastien Dubois (@dSebastien)')
            .addButton((button) => {
                button.setCta()
                button.setButtonText('Follow me on X').onClick(() => {
                    window.open('https://x.com/dSebastien')
                })
            })

        const supportDesc = new DocumentFragment()
        supportDesc.createDiv({
            text: 'Buy me a coffee to support the development of this plugin'
        })

        new Setting(containerEl).setDesc(supportDesc)

        this.renderBuyMeACoffeeBadge(containerEl)
    }

    renderFoldersToScan(): void {
        this.doSearchAndRemoveList({
            currentList: this.plugin.settings.foldersToScan,
            setValue: async (newValue) => {
                this.plugin.settings = produce(
                    this.plugin.settings,
                    (draft: Draft<PluginSettings>) => {
                        draft.foldersToScan = newValue
                    }
                )
            },
            name: 'Folders to scan',
            description: 'Folders to scan when looking for queries to serialize.'
        })
    }

    renderFoldersToIgnore(): void {
        this.doSearchAndRemoveList({
            currentList: this.plugin.settings.ignoredFolders,
            setValue: async (newValue) => {
                this.plugin.settings = produce(
                    this.plugin.settings,
                    (draft: Draft<PluginSettings>) => {
                        draft.ignoredFolders = newValue
                    }
                )
            },
            name: 'Folders to ignore',
            description: 'Folders to ignore when processing added/modified files.'
        })
    }

    renderFoldersToForceUpdate(): void {
        this.doSearchAndRemoveList({
            currentList: this.plugin.settings.foldersToForceUpdate,
            setValue: async (newValue) => {
                this.plugin.settings = produce(
                    this.plugin.settings,
                    (draft: Draft<PluginSettings>) => {
                        draft.foldersToForceUpdate = newValue
                    }
                )
            },
            name: 'Folders to force update',
            description:
                'Folders containing files that should be updated when ANY file in the vault changes. Useful for index files with queries that aggregate data from elsewhere.'
        })
    }

    doSearchAndRemoveList({ currentList, setValue, description, name }: ArgsSearchAndRemove) {
        let searchInput: SearchComponent | undefined
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(description)
            .addSearch((cb) => {
                searchInput = cb
                new FolderSuggest(cb.inputEl, this.app)
                cb.setPlaceholder('Example: folder1/folder2')
            })
            .addButton((cb) => {
                cb.setIcon('plus')
                cb.setTooltip('Add folder')
                cb.onClick(async () => {
                    if (!searchInput) {
                        return
                    }
                    const newFolder = searchInput.getValue()

                    await setValue([...currentList, newFolder].filter(onlyUniqueArray))
                    await this.plugin.saveSettings()
                    searchInput.setValue('')
                    this.display()
                })
            })

        currentList.forEach((ignoreFolder) =>
            new Setting(this.containerEl).setName(ignoreFolder).addButton((button) =>
                button.setButtonText('Remove').onClick(async () => {
                    await setValue(currentList.filter((value) => value !== ignoreFolder))
                    await this.plugin.saveSettings()
                    this.display()
                })
            )
        )
    }

    renderBuyMeACoffeeBadge(contentEl: HTMLElement | DocumentFragment, width = 175): void {
        const linkEl = contentEl.createEl('a', {
            href: 'https://www.buymeacoffee.com/dsebastien'
        })
        const imgEl = linkEl.createEl('img')
        imgEl.src =
            'https://github.com/dsebastien/obsidian-plugin-template/blob/main/src/assets/buy-me-a-coffee.png?raw=true'
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}
