import { describe, expect, test } from 'bun:test'
import {
    migrateCommandHotkeys,
    migrateCommandReferences,
    migrateMobileToolbarCommand,
    migratePinnedCommand,
    replaceCommandId,
    type HotkeyManagerLike
} from './migrate-command-references.fn'

const OLD = 'dataview-serializer:insert-dataview-serializer-block'
const NEW = 'dataview-serializer:insert-query-block'
const binding = [{ modifiers: ['Mod', 'Shift'], key: 'D' }]

const fakeHotkeys = (customKeys: Record<string, unknown[] | undefined>) => {
    const manager = {
        customKeys,
        saves: 0,
        setHotkeys(commandId: string, keys: unknown[]): void {
            manager.customKeys[commandId] = keys
        },
        removeHotkeys(commandId: string): void {
            manager.customKeys[commandId] = undefined
        },
        save(): Promise<void> {
            manager.saves += 1
            return Promise.resolve()
        }
    }
    return manager
}

const fakeVault = (mobileToolbarCommands: unknown) => {
    const config: Record<string, unknown> = { mobileToolbarCommands }
    return {
        config,
        getConfig: (key: string): unknown => config[key],
        setConfig: (key: string, value: unknown): void => {
            config[key] = value
        }
    }
}

const fakePalette = (pinned: unknown) => {
    const palette = {
        saved: 0,
        instance: {
            options: { pinned } as { pinned?: unknown },
            saveSettings: (plugin: unknown): Promise<void> => {
                expect(plugin).toBe(palette)
                palette.saved += 1
                return Promise.resolve()
            }
        }
    }
    return palette
}

describe('replaceCommandId', () => {
    test('replaces the old id in place', () => {
        expect(replaceCommandId(['a', OLD, 'b'], OLD, NEW)).toEqual(['a', NEW, 'b'])
    })

    test('keeps the new id once when both were listed', () => {
        expect(replaceCommandId([OLD, NEW, 'b'], OLD, NEW)).toEqual([NEW, 'b'])
    })

    test('returns null when there is nothing to move or the value is not a string list', () => {
        expect(replaceCommandId(['a'], OLD, NEW)).toBe(null)
        expect(replaceCommandId(undefined, OLD, NEW)).toBe(null)
        expect(replaceCommandId([OLD, 3], OLD, NEW)).toBe(null)
    })
})

describe('migrateCommandHotkeys', () => {
    test('moves a hotkey bound to the old command id onto the new one and saves', async () => {
        const manager = fakeHotkeys({ [OLD]: binding })
        expect(await migrateCommandHotkeys(manager, OLD, NEW)).toBe(true)
        expect(manager.customKeys[NEW]).toEqual(binding)
        expect(manager.customKeys[OLD]).toBeUndefined()
        expect(manager.saves).toBe(1)
    })

    test('leaves a hotkey the user already bound to the new id alone', async () => {
        const mine = [{ modifiers: ['Alt'], key: 'I' }]
        const manager = fakeHotkeys({ [OLD]: binding, [NEW]: mine })
        expect(await migrateCommandHotkeys(manager, OLD, NEW)).toBe(false)
        expect(manager.customKeys[NEW]).toEqual(mine)
        expect(manager.customKeys[OLD]).toEqual(binding)
        expect(manager.saves).toBe(0)
    })

    test('does nothing when the old id has no custom hotkey', async () => {
        const manager = fakeHotkeys({ [OLD]: [] })
        expect(await migrateCommandHotkeys(manager, OLD, NEW)).toBe(false)
        expect(manager.saves).toBe(0)
    })

    test('is a no-op, never a failure, when the internal API is missing or changed', async () => {
        expect(await migrateCommandHotkeys(undefined, OLD, NEW)).toBe(false)
        const changed: HotkeyManagerLike = { customKeys: { [OLD]: binding } }
        expect(await migrateCommandHotkeys(changed, OLD, NEW)).toBe(false)
    })

    test('a failing save reaches the caller instead of becoming an unhandled rejection', async () => {
        const manager = fakeHotkeys({ [OLD]: binding })
        manager.save = () => Promise.reject(new Error('read-only config folder'))
        let caught: unknown = null
        try {
            await migrateCommandHotkeys(manager, OLD, NEW)
        } catch (error) {
            caught = error
        }
        expect(caught).toBeInstanceOf(Error)
    })
})

describe('migrateMobileToolbarCommand', () => {
    test('moves the command in the mobile toolbar', () => {
        const vault = fakeVault(['editor:undo', OLD])
        expect(migrateMobileToolbarCommand(vault, OLD, NEW)).toBe(true)
        expect(vault.config['mobileToolbarCommands']).toEqual(['editor:undo', NEW])
    })

    test('leaves a toolbar without the old command untouched', () => {
        const vault = fakeVault(['editor:undo'])
        expect(migrateMobileToolbarCommand(vault, OLD, NEW)).toBe(false)
        expect(vault.config['mobileToolbarCommands']).toEqual(['editor:undo'])
    })

    test('is a no-op when the config API is missing', () => {
        expect(migrateMobileToolbarCommand(undefined, OLD, NEW)).toBe(false)
        expect(migrateMobileToolbarCommand({ getConfig: () => [OLD] }, OLD, NEW)).toBe(false)
    })
})

describe('migratePinnedCommand', () => {
    test('moves the command in the palette pins and saves them', async () => {
        const palette = fakePalette(['app:reload', OLD])
        expect(await migratePinnedCommand(palette, OLD, NEW)).toBe(true)
        expect(palette.instance.options.pinned).toEqual(['app:reload', NEW])
        expect(palette.saved).toBe(1)
    })

    test('does nothing without pins, or without the palette', async () => {
        const palette = fakePalette(undefined)
        expect(await migratePinnedCommand(palette, OLD, NEW)).toBe(false)
        expect(palette.saved).toBe(0)
        expect(await migratePinnedCommand(null, OLD, NEW)).toBe(false)
    })
})

describe('migrateCommandReferences', () => {
    test('moves every reference Obsidian keeps and reports what moved', async () => {
        const hotkeyManager = fakeHotkeys({ [OLD]: binding })
        const vault = fakeVault([OLD])
        const palette = fakePalette([OLD])
        const moved = await migrateCommandReferences(
            {
                hotkeyManager,
                vault,
                internalPlugins: {
                    getPluginById: (id: string) => (id === 'command-palette' ? palette : null)
                }
            },
            OLD,
            NEW
        )
        expect(moved).toEqual({ hotkeys: true, mobileToolbar: true, pinned: true })
        expect(hotkeyManager.customKeys[NEW]).toEqual(binding)
        expect(vault.config['mobileToolbarCommands']).toEqual([NEW])
        expect(palette.instance.options.pinned).toEqual([NEW])
    })
})
