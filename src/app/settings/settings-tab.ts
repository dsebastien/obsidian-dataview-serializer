import { Notice, PluginSettingTab, SearchComponent } from 'obsidian'
import type { App, SettingDefinitionItem } from 'obsidian'
import type DataviewSerializerPlugin from '../../main'
import type { LinkFormat, PluginSettings } from '../types/plugin-settings.intf'
import { onlyUniqueArray } from '../utils/only-unique-array.fn'
import { FolderSuggest } from '../utils/folder-suggest'
import {
    containsPathPlaceholders,
    resolvePathPlaceholders
} from '../utils/resolve-path-placeholders.fn'
import { setDebugMode } from '../../utils/log'
import { BUY_ME_A_COFFEE_BADGE_DATA_URL } from '../assets/buy-me-a-coffee'
import { renderSupportSection } from '../ui/support-links'

/** The three folder lists, keyed by the settings field each one edits. */
type FolderListKey = 'foldersToScan' | 'ignoredFolders' | 'foldersToForceUpdate'

/**
 * Settings tab, declared rather than rendered (Obsidian 1.13+).
 *
 * `getSettingDefinitions()` REPLACES `display()`: when it returns a non-empty
 * array, `display()` is never called. There is no partial adoption — the whole
 * settings UI is declarative, or none of it. In exchange, Obsidian owns
 * navigation, focus and ARIA, and every declared `name`/`desc` is indexed by
 * the settings search.
 *
 * Rules that each cost a shipped bug somewhere in the plugin collection the
 * first time they were broken (see AGENTS.md "Declarative settings"):
 *
 * - A `render:` hook renders the ROW. Write into `setting.settingEl` only;
 *   anything written outside it (e.g. `group.listEl`) is the framework's to
 *   discard, and the control simply does not appear.
 * - `onDelete(index)` indexes the LIVE list. Resolve the entry from the live
 *   array at call time, never from a render-time snapshot.
 * - `setControlValue` MUST reject on failure, and validate before writing.
 * - Side effects run only AFTER the write lands.
 */
export class SettingsTab extends PluginSettingTab {
    plugin: DataviewSerializerPlugin

    constructor(app: App, plugin: DataviewSerializerPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: 'Disabled on this device',
                // Only rendered while the plugin is actually off here. The
                // banner explains why nothing in the pane appears to work.
                visible: (): boolean => this.plugin.isDisabledOnDevice(),
                searchable: false,
                render: (setting): void => {
                    setting.infoEl.remove()
                    setting.settingEl.addClass('dvs-settings-embed')
                    const banner = setting.settingEl.createDiv({
                        cls: 'dvs-device-disabled-banner'
                    })
                    banner.createEl('strong', { text: 'Disabled on this device.' })
                    banner.createSpan({
                        text: ' The plugin is inert here: no automatic serialization, file events, refresh buttons, or commands. This choice is device-local and is not synced to your other devices.'
                    })
                }
            },
            {
                name: 'Disable on this device',
                desc: 'When enabled, the plugin is fully disabled on this device only: it performs no automatic or manual serialization and its commands do nothing. This setting is stored locally and is never synced to your other devices.',
                control: { type: 'toggle', key: 'disabledOnDevice' }
            },
            {
                name: 'Disable automatic updates',
                desc: 'When enabled, the plugin will not automatically serialize queries when files are created, modified, or renamed. You can still manually serialize queries using the command palette.',
                control: { type: 'toggle', key: 'disableAutomaticUpdates' }
            },
            {
                name: 'Show refresh button',
                desc: 'When enabled, a refresh button will be displayed next to each serialized Dataview query.',
                control: { type: 'toggle', key: 'showRefreshButton' }
            },
            {
                name: 'Enable DataviewJS serialization',
                desc: 'When enabled, JavaScript-based Dataview queries can be serialized to static Markdown. Note: JavaScript code cannot contain "--" due to HTML comment limitations.',
                control: { type: 'toggle', key: 'enableDataviewJS' }
            },
            {
                name: 'Show error notifications',
                desc: 'When enabled, a notification popup will be displayed when a query fails to serialize.',
                control: { type: 'toggle', key: 'showErrorNotifications' }
            },
            {
                name: 'Add trailing newline',
                desc: 'When enabled, an empty line will be added between the serialized content and the END marker. Useful for static site generators like Jekyll that require blank lines after tables or lists.',
                control: { type: 'toggle', key: 'addTrailingNewline' }
            },
            {
                name: 'Link format',
                desc: 'Format for internal links in serialized output. "Use Obsidian setting" respects your vault\'s "New link format" and "Use [[Wikilinks]]" preferences. "Shortest path" simplifies links when the filename is unique. "Absolute path" always uses the full path, which ensures consistency when syncing vaults across devices.',
                control: {
                    type: 'dropdown',
                    key: 'linkFormat',
                    options: {
                        obsidian: 'Use Obsidian setting',
                        shortest: 'Shortest path when possible',
                        absolute: 'Absolute path'
                    }
                }
            },
            {
                name: 'Debug logging',
                desc: 'When enabled, verbose debug messages will be logged to the console. Useful for troubleshooting.',
                control: { type: 'toggle', key: 'debugLogging' }
            },
            ...this.folderListDefinitions(
                'foldersToScan',
                'Folders to scan',
                'Folders to scan when looking for queries to serialize.'
            ),
            ...this.folderListDefinitions(
                'ignoredFolders',
                'Folders to ignore',
                'Folders to ignore when processing added/modified files.'
            ),
            ...this.folderListDefinitions(
                'foldersToForceUpdate',
                'Folders to force update',
                this.buildFoldersToForceUpdateDescription(),
                true
            ),
            {
                type: 'group',
                // No heading: renderSupportSection draws its own.
                items: [
                    {
                        name: 'Support',
                        searchable: false,
                        render: (setting): void => {
                            setting.infoEl.remove()
                            // `.setting-item` is a flex ROW. The support block
                            // is a stack of full-width rows, so without this it
                            // would lay heading, buttons and badge side by side.
                            setting.settingEl.addClass('dvs-settings-embed')
                            renderSupportSection(setting.settingEl, (el) => {
                                this.renderBuyMeACoffeeBadge(el)
                            })
                        }
                    }
                ]
            }
        ]
    }

    /**
     * One folder list: a header row carrying the description and the
     * add-a-folder control, then the entries as a native list.
     *
     * The add control stays an inline search box with folder autocomplete
     * rather than the framework's `addItem` affordance, because `addItem` hands
     * back a bare element and the whole point here is the `FolderSuggest`
     * completion the old tab had.
     */
    private folderListDefinitions(
        key: FolderListKey,
        name: string,
        desc: string | DocumentFragment,
        supportsPlaceholders = false
    ): SettingDefinitionItem[] {
        return [
            {
                name,
                desc,
                render: (setting): void => {
                    let searchInput: SearchComponent | undefined
                    setting.addSearch((cb) => {
                        searchInput = cb
                        new FolderSuggest(cb.inputEl, this.app)
                        cb.setPlaceholder(
                            supportsPlaceholders
                                ? 'Example: Daily/{{year}}/{{month}}'
                                : 'Example: folder1/folder2'
                        )
                    })
                    setting.addButton((cb) => {
                        cb.setIcon('plus')
                        cb.setTooltip('Add folder')
                        cb.onClick(() => {
                            const folder = searchInput?.getValue().trim()
                            if (!folder) {
                                return
                            }
                            void (async () => {
                                // Read the live list at click time, not at
                                // render time: another row may have written
                                // since this row was drawn.
                                const next = [...this.plugin.settings[key], folder].filter(
                                    onlyUniqueArray
                                )
                                await this.plugin.updateSettings((draft) => {
                                    draft[key] = next
                                })
                                searchInput?.setValue('')
                                this.update()
                            })()
                        })
                    })
                }
            },
            {
                type: 'list',
                emptyState: 'No folders configured.',
                // Index into the LIVE array. The framework hands back a
                // position, and the list may have changed since it was drawn.
                onDelete: (index: number): void => {
                    const current = this.plugin.settings[key]
                    const target = current[index]
                    if (target === undefined) {
                        return
                    }
                    void (async () => {
                        await this.plugin.updateSettings((draft) => {
                            draft[key] = current.filter((value) => value !== target)
                        })
                        this.update()
                    })()
                },
                items: this.plugin.settings[key].map((folder) => ({
                    name: folder,
                    // Entries are data, not settings: keep them out of search.
                    searchable: false,
                    ...(supportsPlaceholders && containsPathPlaceholders(folder)
                        ? { desc: `Currently resolves to: ${resolvePathPlaceholders(folder)}` }
                        : {})
                }))
            }
        ]
    }

    /**
     * Description of the "Folders to force update" setting, including the date
     * placeholder syntax and a couple of examples resolved against today's date.
     */
    buildFoldersToForceUpdateDescription(): DocumentFragment {
        const fragment = new DocumentFragment()

        fragment.createSpan({
            text: 'Folders containing files that should be updated when ANY file in the vault changes. Useful for index files with queries that aggregate data from elsewhere.'
        })

        fragment.createEl('br')
        fragment.createEl('br')

        fragment.createSpan({
            text: 'Paths support date placeholders, resolved every time the force update runs: '
        })
        fragment.createEl('code', { text: '{{year}}' })
        fragment.createSpan({ text: ', ' })
        fragment.createEl('code', { text: '{{quarter}}' })
        fragment.createSpan({ text: ', ' })
        fragment.createEl('code', { text: '{{month}}' })
        fragment.createSpan({ text: ', ' })
        fragment.createEl('code', { text: '{{monthName}}' })
        fragment.createSpan({ text: ', ' })
        fragment.createEl('code', { text: '{{week}}' })
        fragment.createSpan({ text: ', ' })
        fragment.createEl('code', { text: '{{date}}' })
        fragment.createSpan({ text: ', ' })
        fragment.createEl('code', { text: '{{day}}' })
        fragment.createSpan({
            text: '. Add an offset in the placeholder unit to cover neighbouring periods ('
        })
        fragment.createEl('code', { text: '{{month-1}}' })
        fragment.createSpan({ text: '), or a custom date format after a colon (' })
        fragment.createEl('code', { text: '{{date:MM-MMM}}' })
        fragment.createSpan({ text: ').' })

        fragment.createEl('br')

        const example = 'Daily/{{year}}/{{month}}-{{monthName}}'
        fragment.createSpan({ text: 'Example: ' })
        fragment.createEl('code', { text: example })
        fragment.createSpan({ text: ' → ' })
        fragment.createEl('code', { text: resolvePathPlaceholders(example) })

        return fragment
    }

    /**
     * Reads the value behind a control `key`.
     *
     * `disabledOnDevice` is deliberately not a settings field: it lives in
     * device-local storage and is never synced, so it is read and written
     * through the plugin rather than through `updateSettings`.
     */
    override getControlValue(key: string): unknown {
        switch (key) {
            case 'disabledOnDevice':
                return this.plugin.isDisabledOnDevice()
            case 'disableAutomaticUpdates':
                return this.plugin.settings.disableAutomaticUpdates
            case 'showRefreshButton':
                return this.plugin.settings.showRefreshButton
            case 'enableDataviewJS':
                return this.plugin.settings.enableDataviewJS
            case 'showErrorNotifications':
                return this.plugin.settings.showErrorNotifications
            case 'addTrailingNewline':
                return this.plugin.settings.addTrailingNewline
            case 'linkFormat':
                return this.plugin.settings.linkFormat
            case 'debugLogging':
                return this.plugin.settings.debugLogging
            default:
                return undefined
        }
    }

    /**
     * Persists a control edit. Rejecting (not resolving) on failure is what
     * lets the framework roll the control back to the stored truth.
     *
     * Side effects run only AFTER the write lands: registering file handlers or
     * flipping debug logging on the strength of a value that was never
     * persisted would leave the plugin and its settings disagreeing.
     */
    override async setControlValue(key: string, value: unknown): Promise<void> {
        switch (key) {
            case 'disabledOnDevice': {
                const next = this.expectBoolean(key, value)
                // Device-local storage, not the synced settings file. Applied
                // immediately; setDisabledOnDevice owns the handler churn.
                this.plugin.setDisabledOnDevice(next)
                // Re-render so the banner appears or disappears with it.
                this.update()
                return
            }
            case 'disableAutomaticUpdates': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.disableAutomaticUpdates = next
                })
                if (next) {
                    this.plugin.unregisterEventHandlers()
                } else if (!this.plugin.isDisabledOnDevice()) {
                    // Do not resurrect handlers the device-local disable turned
                    // off: that flag outranks this one.
                    this.plugin.setupEventHandlers()
                }
                return
            }
            case 'showRefreshButton': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.showRefreshButton = next
                })
                return
            }
            case 'enableDataviewJS': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.enableDataviewJS = next
                })
                return
            }
            case 'showErrorNotifications': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.showErrorNotifications = next
                })
                return
            }
            case 'addTrailingNewline': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.addTrailingNewline = next
                })
                return
            }
            case 'linkFormat': {
                if (value !== 'obsidian' && value !== 'shortest' && value !== 'absolute') {
                    throw new Error(`Setting "${key}" expects a known link format.`)
                }
                const next: LinkFormat = value
                await this.plugin.updateSettings((draft) => {
                    draft.linkFormat = next
                })
                return
            }
            case 'debugLogging': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.debugLogging = next
                })
                setDebugMode(next)
                return
            }
            default:
                new Notice('Failed to save settings.')
                throw new Error(`Setting "${key}" does not address a known field.`)
        }
    }

    /** Rejects rather than coerces: a bad value must not reach the store. */
    private expectBoolean(key: string, value: unknown): boolean {
        if (typeof value !== 'boolean') {
            throw new Error(`Setting "${key}" expects a boolean.`)
        }
        return value
    }

    renderBuyMeACoffeeBadge(contentEl: HTMLElement | DocumentFragment, width = 175): void {
        const linkEl = contentEl.createEl('a', {
            href: 'https://www.buymeacoffee.com/dsebastien'
        })
        const imgEl = linkEl.createEl('img')
        imgEl.src = BUY_ME_A_COFFEE_BADGE_DATA_URL
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}

export type { PluginSettings }
