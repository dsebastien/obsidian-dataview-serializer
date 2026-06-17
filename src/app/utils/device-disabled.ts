import { DEVICE_DISABLED_STORAGE_KEY } from '../constants'

/**
 * Minimal view of the Obsidian `App` device-local storage API.
 *
 * `loadLocalStorage`/`saveLocalStorage` read and write the vault-scoped browser
 * `localStorage`, which is never synced between devices. Declaring just the two
 * methods we need keeps this helper unit-testable without a full `App` mock.
 */
export interface DeviceLocalStore {
    loadLocalStorage(key: string): unknown
    saveLocalStorage(key: string, data: unknown | null): void
}

/**
 * Value written to device-local storage when the plugin is disabled on the
 * current device. Any other stored value (including a missing entry) means the
 * plugin is enabled.
 */
const DISABLED_VALUE = 'true'

/**
 * Returns true when the plugin has been disabled on the current device.
 *
 * The flag lives only in device-local storage, so this never reflects choices
 * made on other (synced) devices.
 */
export const isDisabledOnDevice = (store: DeviceLocalStore): boolean => {
    return store.loadLocalStorage(DEVICE_DISABLED_STORAGE_KEY) === DISABLED_VALUE
}

/**
 * Persist the per-device disable flag.
 *
 * When disabling, writes the sentinel value; when enabling, clears the entry
 * (passing `null` removes the key) so device-local storage stays tidy.
 */
export const setDisabledOnDevice = (store: DeviceLocalStore, disabled: boolean): void => {
    store.saveLocalStorage(DEVICE_DISABLED_STORAGE_KEY, disabled ? DISABLED_VALUE : null)
}
