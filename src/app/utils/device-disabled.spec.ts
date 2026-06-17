import { describe, expect, test } from 'bun:test'
import { isDisabledOnDevice, setDisabledOnDevice, type DeviceLocalStore } from './device-disabled'
import { DEVICE_DISABLED_STORAGE_KEY } from '../constants'

/**
 * In-memory implementation of the device-local storage API for tests.
 */
class FakeStore implements DeviceLocalStore {
    private readonly data = new Map<string, unknown>()

    loadLocalStorage(key: string): unknown {
        return this.data.has(key) ? this.data.get(key) : null
    }

    saveLocalStorage(key: string, value: unknown | null): void {
        if (value === null) {
            this.data.delete(key)
        } else {
            this.data.set(key, value)
        }
    }

    has(key: string): boolean {
        return this.data.has(key)
    }
}

describe('isDisabledOnDevice', () => {
    test('returns false when nothing is stored', () => {
        expect(isDisabledOnDevice(new FakeStore())).toBe(false)
    })

    test('returns true after the flag is enabled', () => {
        const store = new FakeStore()
        setDisabledOnDevice(store, true)
        expect(isDisabledOnDevice(store)).toBe(true)
    })

    test('returns false after the flag is disabled again', () => {
        const store = new FakeStore()
        setDisabledOnDevice(store, true)
        setDisabledOnDevice(store, false)
        expect(isDisabledOnDevice(store)).toBe(false)
    })

    test('treats unrelated stored values as enabled', () => {
        const store = new FakeStore()
        store.saveLocalStorage(DEVICE_DISABLED_STORAGE_KEY, 'something-else')
        expect(isDisabledOnDevice(store)).toBe(false)
    })
})

describe('setDisabledOnDevice', () => {
    test('clears the storage entry when disabling is turned off', () => {
        const store = new FakeStore()
        setDisabledOnDevice(store, true)
        expect(store.has(DEVICE_DISABLED_STORAGE_KEY)).toBe(true)

        setDisabledOnDevice(store, false)
        expect(store.has(DEVICE_DISABLED_STORAGE_KEY)).toBe(false)
    })

    test('round-trips through the storage key', () => {
        const store = new FakeStore()
        setDisabledOnDevice(store, true)
        expect(store.loadLocalStorage(DEVICE_DISABLED_STORAGE_KEY)).toBe('true')
    })
})
