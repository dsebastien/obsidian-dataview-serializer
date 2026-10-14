import { describe, expect, test } from 'bun:test'
import {
    createDefaultPeriodicSerializationConfig,
    loadPeriodicSerializationConfig,
    savePeriodicSerializationConfig,
    validateIntervalMinutes
} from './periodic-serialization-config'
import type { DeviceLocalStore } from './device-disabled'
import {
    PERIODIC_SERIALIZATION_DEFAULT_MINUTES,
    PERIODIC_SERIALIZATION_MIN_MINUTES,
    PERIODIC_SERIALIZATION_STORAGE_KEY
} from '../constants'

/**
 * In-memory implementation of the device-local storage API for tests.
 */
class FakeStore implements DeviceLocalStore {
    readonly data = new Map<string, unknown>()

    loadLocalStorage(key: string): unknown {
        return this.data.has(key) ? this.data.get(key) : null
    }

    saveLocalStorage(key: string, value: unknown): void {
        if (value === null) {
            this.data.delete(key)
        } else {
            this.data.set(key, value)
        }
    }
}

describe('validateIntervalMinutes', () => {
    test('accepts whole minutes at or above the minimum', () => {
        expect(validateIntervalMinutes(PERIODIC_SERIALIZATION_MIN_MINUTES)).toBeUndefined()
        expect(validateIntervalMinutes(30)).toBeUndefined()
        expect(validateIntervalMinutes(1440)).toBeUndefined()
    })

    test('rejects values below the minimum', () => {
        expect(validateIntervalMinutes(PERIODIC_SERIALIZATION_MIN_MINUTES - 1)).toBeString()
        expect(validateIntervalMinutes(0)).toBeString()
        expect(validateIntervalMinutes(-10)).toBeString()
    })

    test('rejects fractions and non-finite values', () => {
        expect(validateIntervalMinutes(7.5)).toBeString()
        expect(validateIntervalMinutes(Number.NaN)).toBeString()
        expect(validateIntervalMinutes(Number.POSITIVE_INFINITY)).toBeString()
    })
})

describe('loadPeriodicSerializationConfig', () => {
    test('defaults to disabled with the default interval', () => {
        expect(loadPeriodicSerializationConfig(new FakeStore())).toEqual({
            enabled: false,
            intervalMinutes: PERIODIC_SERIALIZATION_DEFAULT_MINUTES
        })
    })

    test('round-trips a saved config', () => {
        const store = new FakeStore()
        savePeriodicSerializationConfig(store, { enabled: true, intervalMinutes: 15 })
        expect(loadPeriodicSerializationConfig(store)).toEqual({
            enabled: true,
            intervalMinutes: 15
        })
    })

    test('falls back per field on invalid stored data', () => {
        const store = new FakeStore()
        store.data.set(PERIODIC_SERIALIZATION_STORAGE_KEY, {
            enabled: 'yes',
            intervalMinutes: 1
        })
        expect(loadPeriodicSerializationConfig(store)).toEqual(
            createDefaultPeriodicSerializationConfig()
        )

        store.data.set(PERIODIC_SERIALIZATION_STORAGE_KEY, { enabled: true })
        expect(loadPeriodicSerializationConfig(store)).toEqual({
            enabled: true,
            intervalMinutes: PERIODIC_SERIALIZATION_DEFAULT_MINUTES
        })
    })

    test('ignores non-object stored values', () => {
        const store = new FakeStore()
        store.data.set(PERIODIC_SERIALIZATION_STORAGE_KEY, 'true')
        expect(loadPeriodicSerializationConfig(store)).toEqual(
            createDefaultPeriodicSerializationConfig()
        )
    })
})

describe('savePeriodicSerializationConfig', () => {
    test('refuses to store an invalid interval', () => {
        const store = new FakeStore()
        expect(() =>
            savePeriodicSerializationConfig(store, { enabled: true, intervalMinutes: 1 })
        ).toThrow()
        expect(store.data.has(PERIODIC_SERIALIZATION_STORAGE_KEY)).toBe(false)
    })
})
