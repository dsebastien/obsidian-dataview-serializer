/**
 * Moving a renamed command's references from its old full id to its new one.
 *
 * Obsidian stores full command ids ('<plugin id>:<command id>') in three
 * places the user controls: custom hotkeys (hotkeys.json), the mobile editor
 * toolbar (app.json, mobileToolbarCommands) and the command palette's pinned
 * commands (command-palette.json). None of them follow a rename, so each is
 * moved once. All three go through internal APIs that are not in the public
 * typings, so every member is optional: an Obsidian build that changes them
 * makes that part a no-op, never a load failure. Commands referenced by other
 * plugins (Commander, QuickAdd macros) cannot be reached and are not moved.
 */

export interface HotkeyManagerLike {
    customKeys?: Record<string, unknown[] | undefined>
    setHotkeys?: (commandId: string, keys: unknown[]) => void
    removeHotkeys?: (commandId: string) => void
    save?: () => unknown
}

export interface VaultConfigLike {
    getConfig?: (key: string) => unknown
    setConfig?: (key: string, value: unknown) => void
}

export interface CommandPaletteLike {
    instance?: {
        options?: { pinned?: unknown }
        saveSettings?: (plugin: unknown) => unknown
    }
}

export interface AppLike {
    hotkeyManager?: HotkeyManagerLike
    vault?: VaultConfigLike
    internalPlugins?: { getPluginById?: (id: string) => CommandPaletteLike | null | undefined }
}

export interface MovedReferences {
    hotkeys: boolean
    mobileToolbar: boolean
    pinned: boolean
}

/**
 * The list with `fromId` replaced by `toId` (kept once, in place), or null
 * when the list is not a string array or does not contain `fromId`.
 */
export function replaceCommandId(list: unknown, fromId: string, toId: string): string[] | null {
    if (!Array.isArray(list) || !list.every((id): id is string => typeof id === 'string')) {
        return null
    }
    if (!list.includes(fromId)) {
        return null
    }
    const replaced: string[] = []
    for (const id of list) {
        const next = id === fromId ? toId : id
        if (!replaced.includes(next)) {
            replaced.push(next)
        }
    }
    return replaced
}

/**
 * Moves custom hotkeys bound to `fromId` onto `toId`, once. Does nothing when
 * the old id has none, or when the new id already has some (the user chose
 * those; they win). Returns true when hotkeys were moved.
 */
export async function migrateCommandHotkeys(
    manager: HotkeyManagerLike | undefined,
    fromId: string,
    toId: string
): Promise<boolean> {
    if (
        !manager?.customKeys ||
        typeof manager.setHotkeys !== 'function' ||
        typeof manager.removeHotkeys !== 'function'
    ) {
        return false
    }
    const keys = manager.customKeys[fromId]
    if (!keys || keys.length === 0) {
        return false
    }
    const existing = manager.customKeys[toId]
    if (existing && existing.length > 0) {
        return false
    }
    manager.setHotkeys(toId, keys)
    manager.removeHotkeys(fromId)
    if (typeof manager.save === 'function') {
        await manager.save()
    }
    return true
}

/** Moves the command in the mobile editor toolbar (app.json). */
export function migrateMobileToolbarCommand(
    vault: VaultConfigLike | undefined,
    fromId: string,
    toId: string
): boolean {
    if (typeof vault?.getConfig !== 'function' || typeof vault.setConfig !== 'function') {
        return false
    }
    const replaced = replaceCommandId(vault.getConfig('mobileToolbarCommands'), fromId, toId)
    if (!replaced) {
        return false
    }
    vault.setConfig('mobileToolbarCommands', replaced)
    return true
}

/** Moves the command in the command palette's pinned list (command-palette.json). */
export async function migratePinnedCommand(
    palette: CommandPaletteLike | null | undefined,
    fromId: string,
    toId: string
): Promise<boolean> {
    const instance = palette?.instance
    if (!instance?.options || typeof instance.saveSettings !== 'function') {
        return false
    }
    const replaced = replaceCommandId(instance.options.pinned, fromId, toId)
    if (!replaced) {
        return false
    }
    instance.options.pinned = replaced
    await instance.saveSettings(palette)
    return true
}

/** Moves every reference Obsidian itself keeps to `fromId` onto `toId`. */
export async function migrateCommandReferences(
    app: AppLike,
    fromId: string,
    toId: string
): Promise<MovedReferences> {
    return {
        hotkeys: await migrateCommandHotkeys(app.hotkeyManager, fromId, toId),
        mobileToolbar: migrateMobileToolbarCommand(app.vault, fromId, toId),
        pinned: await migratePinnedCommand(
            app.internalPlugins?.getPluginById?.('command-palette'),
            fromId,
            toId
        )
    }
}
