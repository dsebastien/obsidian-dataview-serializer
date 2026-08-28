import { describe, expect, test, mock } from 'bun:test'
import { produce } from 'immer'
import DataviewSerializerPlugin from '../../main'
import { SettingsTab } from './settings-tab'
import { DEFAULT_SETTINGS } from '../types/plugin-settings.intf'
import type { PluginSettings } from '../types/plugin-settings.intf'

/**
 * Behavioral coverage for the settings write path.
 *
 * `settings-guard.spec.ts` only scans source text, and nothing in CI renders a
 * settings pane. These tests exercise the properties no UI test can reach:
 * writes are serialized, memory is committed only after persistence succeeds,
 * a rejected value never reaches the store, and the side effects that register
 * file handlers fire only after the write lands.
 */

async function expectRejection(promise: Promise<unknown>, contains: string): Promise<void> {
    let caught: unknown
    await promise.catch((error: unknown) => {
        caught = error
    })
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain(contains)
}

interface Harness {
    plugin: DataviewSerializerPlugin
    tab: SettingsTab
    saveData: ReturnType<typeof mock>
    setupEventHandlers: ReturnType<typeof mock>
    unregisterEventHandlers: ReturnType<typeof mock>
}

function createHarness(options?: {
    saveData?: () => Promise<void>
    disabledOnDevice?: boolean
}): Harness {
    const saveData = mock(async () => {
        if (options?.saveData) {
            await options.saveData()
        }
    })
    const setupEventHandlers = mock(() => {})
    const unregisterEventHandlers = mock(() => {})

    const plugin = Object.create(DataviewSerializerPlugin.prototype) as DataviewSerializerPlugin
    const internals = plugin as unknown as Record<string, unknown>
    internals['settings'] = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)
    internals['settingsWriteChain'] = Promise.resolve()
    internals['saveData'] = saveData
    internals['setupEventHandlers'] = setupEventHandlers
    internals['unregisterEventHandlers'] = unregisterEventHandlers
    internals['isDisabledOnDevice'] = () => options?.disabledOnDevice ?? false

    const tab = Object.create(SettingsTab.prototype) as SettingsTab
    const tabInternals = tab as unknown as Record<string, unknown>
    tabInternals['plugin'] = plugin
    tabInternals['update'] = () => {}

    return { plugin, tab, saveData, setupEventHandlers, unregisterEventHandlers }
}

describe('updateSettings', () => {
    test('commits to memory only after the write is persisted', async () => {
        let release = (): void => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { plugin, saveData } = createHarness({ saveData: () => gate })

        const pending = plugin.updateSettings((draft) => {
            draft.showRefreshButton = !DEFAULT_SETTINGS.showRefreshButton
        })

        // Let the queued write start and reach its save await; a bare
        // synchronous assertion would pass even with the ordering reversed,
        // because the chain defers the work to a microtask.
        await Promise.resolve()
        await Promise.resolve()
        expect(saveData).toHaveBeenCalledTimes(1)
        expect(plugin.settings.showRefreshButton).toBe(DEFAULT_SETTINGS.showRefreshButton)

        release()
        await pending
        expect(plugin.settings.showRefreshButton).toBe(!DEFAULT_SETTINGS.showRefreshButton)
    })

    test('leaves memory untouched when persistence fails', async () => {
        const { plugin } = createHarness({
            saveData: () => Promise.reject(new Error('disk full'))
        })

        await expectRejection(
            plugin.updateSettings((draft) => {
                draft.foldersToScan = ['Somewhere']
            }),
            'disk full'
        )

        expect(plugin.settings.foldersToScan).toEqual(DEFAULT_SETTINGS.foldersToScan)
    })

    test('overlapping writes do not drop each other', async () => {
        // Adding a folder and flipping a toggle are one click apart here, so
        // this is the realistic case, not a contrived one.
        let releaseFirst = (): void => {}
        const first = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let call = 0
        const { plugin } = createHarness({
            saveData: () => {
                call += 1
                return call === 1 ? first : Promise.resolve()
            }
        })

        const a = plugin.updateSettings((draft) => {
            draft.foldersToScan = ['Notes']
        })
        const b = plugin.updateSettings((draft) => {
            draft.debugLogging = true
        })

        releaseFirst()
        await Promise.all([a, b])

        expect(plugin.settings.foldersToScan).toEqual(['Notes'])
        expect(plugin.settings.debugLogging).toBe(true)
    })
})

describe('setControlValue', () => {
    test('rejects a wrongly typed value without writing', async () => {
        const { tab, plugin, saveData } = createHarness()

        await expectRejection(tab.setControlValue('showRefreshButton', 'yes'), 'boolean')
        expect(saveData).not.toHaveBeenCalled()
        expect(plugin.settings.showRefreshButton).toBe(DEFAULT_SETTINGS.showRefreshButton)
    })

    test('rejects an unknown link format without writing', async () => {
        const { tab, plugin, saveData } = createHarness()

        await expectRejection(tab.setControlValue('linkFormat', 'sideways'), 'known link format')
        expect(saveData).not.toHaveBeenCalled()
        expect(plugin.settings.linkFormat).toBe(DEFAULT_SETTINGS.linkFormat)
    })

    test('rejects an unknown key', async () => {
        const { tab, saveData } = createHarness()

        await expectRejection(tab.setControlValue('nope', true), 'known field')
        expect(saveData).not.toHaveBeenCalled()
    })

    test('unregisters handlers only after the write lands', async () => {
        let release = (): void => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { tab, unregisterEventHandlers } = createHarness({ saveData: () => gate })

        const pending = tab.setControlValue('disableAutomaticUpdates', true)
        await Promise.resolve()
        await Promise.resolve()
        expect(unregisterEventHandlers).not.toHaveBeenCalled()

        release()
        await pending
        expect(unregisterEventHandlers).toHaveBeenCalledTimes(1)
    })

    test('re-registers handlers when automatic updates are turned back on', async () => {
        const { tab, setupEventHandlers } = createHarness()

        await tab.setControlValue('disableAutomaticUpdates', false)

        expect(setupEventHandlers).toHaveBeenCalledTimes(1)
    })

    test('does not resurrect handlers the device-local disable turned off', async () => {
        // The device flag outranks the synced setting: turning automatic
        // updates back on must not re-register handlers on a device where the
        // whole plugin is switched off.
        const { tab, setupEventHandlers } = createHarness({ disabledOnDevice: true })

        await tab.setControlValue('disableAutomaticUpdates', false)

        expect(setupEventHandlers).not.toHaveBeenCalled()
    })

    test('does not touch handlers when the write fails', async () => {
        const { tab, setupEventHandlers, unregisterEventHandlers } = createHarness({
            saveData: () => Promise.reject(new Error('disk full'))
        })

        await expectRejection(tab.setControlValue('disableAutomaticUpdates', true), 'disk full')

        expect(unregisterEventHandlers).not.toHaveBeenCalled()
        expect(setupEventHandlers).not.toHaveBeenCalled()
    })

    test('persists every scalar control', async () => {
        const { tab, plugin } = createHarness()

        await tab.setControlValue('showRefreshButton', !DEFAULT_SETTINGS.showRefreshButton)
        await tab.setControlValue('enableDataviewJS', !DEFAULT_SETTINGS.enableDataviewJS)
        await tab.setControlValue(
            'showErrorNotifications',
            !DEFAULT_SETTINGS.showErrorNotifications
        )
        await tab.setControlValue('addTrailingNewline', !DEFAULT_SETTINGS.addTrailingNewline)
        await tab.setControlValue('linkFormat', 'absolute')

        expect(plugin.settings).toMatchObject({
            showRefreshButton: !DEFAULT_SETTINGS.showRefreshButton,
            enableDataviewJS: !DEFAULT_SETTINGS.enableDataviewJS,
            showErrorNotifications: !DEFAULT_SETTINGS.showErrorNotifications,
            addTrailingNewline: !DEFAULT_SETTINGS.addTrailingNewline,
            linkFormat: 'absolute'
        })
    })

    test('getControlValue answers for every declared control key', () => {
        const { tab, plugin } = createHarness()
        const settings: PluginSettings = plugin.settings

        expect(tab.getControlValue('disabledOnDevice')).toBe(false)
        expect(tab.getControlValue('disableAutomaticUpdates')).toBe(
            settings.disableAutomaticUpdates
        )
        expect(tab.getControlValue('showRefreshButton')).toBe(settings.showRefreshButton)
        expect(tab.getControlValue('enableDataviewJS')).toBe(settings.enableDataviewJS)
        expect(tab.getControlValue('showErrorNotifications')).toBe(settings.showErrorNotifications)
        expect(tab.getControlValue('addTrailingNewline')).toBe(settings.addTrailingNewline)
        expect(tab.getControlValue('linkFormat')).toBe(settings.linkFormat)
        expect(tab.getControlValue('debugLogging')).toBe(settings.debugLogging)
        expect(tab.getControlValue('nope')).toBeUndefined()
    })
})
