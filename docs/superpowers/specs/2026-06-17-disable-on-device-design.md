# Design: Device-local "Disable on this device" toggle

Date: 2026-06-17
Status: Approved

## Goal

Let a user make the plugin fully inert on a single device, without that choice
propagating to their other devices through sync. Primary use case: disable the
plugin on a phone/tablet while keeping it active on the desktop.

## Why a normal setting does not work

Settings persisted via `Plugin.saveData()` are written to the plugin's
`data.json`. That file is synchronized by Obsidian Sync (and by Git / Syncthing
setups), so any value stored there would propagate to every device. A
per-device, non-synced flag therefore cannot live in `PluginSettings`.

## Storage

Use Obsidian's device-local store, which is backed by the browser's
`localStorage`, scoped per-vault, and never synced:

- `app.saveLocalStorage(key, value)` to write.
- `app.loadLocalStorage(key)` to read.

These APIs are `@since 1.8.7`, so `manifest.json` `minAppVersion` is bumped
`1.4.10` → `1.8.7`. `versions.json` is updated automatically by the release
script (`scripts/version-bump.ts`) from the manifest's `minAppVersion`, so no
manual edit is needed there.

Details:

- New constant in `src/app/constants.ts`:
  `DEVICE_DISABLED_STORAGE_KEY = 'dataview-serializer:disabled-on-device'`.
- The flag is stored as the string `'true'` when disabled; any other value
  (including missing/`null`) means enabled.
- The flag is **NOT** a member of `PluginSettings` and is never passed to
  `saveData()`/`loadData()`.
- Two thin helpers on the plugin:
  - `isDisabledOnDevice(): boolean`
  - `setDisabledOnDevice(value: boolean): void`

## Behavior when the toggle is ON (fully inert)

- **File events:** not registered in `initializePlugin()`; live-unregistered
  when the toggle is switched on.
- **`processFile()`:** early-return guard at the very top. Defense in depth so
  the forced-update scheduler and any programmatic caller are also inert.
- **Commands:** remain registered, but every command callback guards first:
  `if (this.isDisabledOnDevice()) { new Notice('Dataview Serializer is disabled on this device'); return }`.
- **Refresh button:** the CodeMirror editor extension receives a new live
  callback `isDeviceDisabled: () => boolean`; when it returns true the extension
  renders no widgets.
- **Settings tab:** a new device-local section is rendered first, containing the
  toggle and a short note that the choice is device-specific and not synced.
  When ON, a banner at the top of the tab states the plugin is currently inert
  on this device. All other settings remain editable.

## Live toggling (no reload required)

On change:

1. Persist via `setDisabledOnDevice(value)`.
2. Apply immediately:
   - Disabling: call `unregisterEventHandlers()`.
   - Enabling: call `setupEventHandlers()` only if the synced
     `disableAutomaticUpdates` setting is false.
3. Re-render the settings tab to show/hide the banner.

Commands, `processFile()`, and the refresh button all read the flag live, so no
Obsidian reload is needed.

## Interaction with existing `disableAutomaticUpdates`

Independent and orthogonal:

- Device-disable is a per-device master switch (not synced).
- `disableAutomaticUpdates` remains the synced, all-devices auto-update switch.

When re-enabling the device, event handlers are set up only if
`disableAutomaticUpdates` is false.

## Files touched

- `manifest.json` — bump `minAppVersion` to `1.8.7`.
- `src/app/constants.ts` — new storage-key constant.
- `src/app/utils/device-disabled.ts` (new) — pure helpers over an app-like
  store interface (`loadLocalStorage`/`saveLocalStorage`).
- `src/app/plugin.ts` — helpers, guards in `initializePlugin`/`processFile`/each
  command, live toggle wiring, pass the gate callback to the editor extension.
- `src/app/refresh-button-extension.ts` — accept and honor `isDeviceDisabled`.
- `src/app/settings/settings-tab.ts` — new device-local section + banner.
- Tests: `.spec.ts` covering the helper read/write semantics and the guard
  (mocking `loadLocalStorage`/`saveLocalStorage`).
- Docs: `README.md`, `docs/configuration.md`, `docs/release-notes.md`,
  `documentation/history/2026-06-17.md`, and a new Business Rule recording that
  this flag must never be synced.

## Non-goals (YAGNI)

- No automatic platform-based disabling (e.g. auto-disable on all mobile
  devices). The toggle is manual and per-device only.
- No hiding of commands from the palette; disabled commands no-op with a notice.

## Business rule introduced

The device-disable flag MUST be stored only in device-local storage
(`app.loadLocalStorage`/`saveLocalStorage`) and MUST NEVER be written to
`data.json` or otherwise synced.
