import {
    PERIODIC_SERIALIZATION_DEFAULT_MINUTES,
    PERIODIC_SERIALIZATION_MIN_MINUTES,
    PERIODIC_SERIALIZATION_STORAGE_KEY
} from '../constants'
import type { DeviceLocalStore } from './device-disabled'

/**
 * Device-local config of the periodic serialization timer.
 *
 * Lives in device-local storage, never in the synced settings: each device
 * opts in on its own, so a synced vault does not get rewritten on a timer by
 * every device at once.
 */
export interface PeriodicSerializationConfig {
    enabled: boolean
    intervalMinutes: number
}

export const createDefaultPeriodicSerializationConfig = (): PeriodicSerializationConfig => ({
    enabled: false,
    intervalMinutes: PERIODIC_SERIALIZATION_DEFAULT_MINUTES
})

/**
 * Why an interval is invalid, or undefined when it is valid.
 * Used both by the settings control and when reading stored data.
 */
export const validateIntervalMinutes = (value: number): string | undefined => {
    if (!Number.isInteger(value)) {
        return 'Enter a whole number of minutes.'
    }
    if (value < PERIODIC_SERIALIZATION_MIN_MINUTES) {
        return `The minimum is ${PERIODIC_SERIALIZATION_MIN_MINUTES} minutes.`
    }
    return undefined
}

/**
 * Read the config from device-local storage.
 *
 * The stored value is untrusted (older versions, manual edits): anything
 * missing or invalid falls back to its default instead of failing.
 */
export const loadPeriodicSerializationConfig = (
    store: DeviceLocalStore
): PeriodicSerializationConfig => {
    const config = createDefaultPeriodicSerializationConfig()
    const stored = store.loadLocalStorage(PERIODIC_SERIALIZATION_STORAGE_KEY)
    if (typeof stored !== 'object' || stored === null) {
        return config
    }

    const { enabled, intervalMinutes } = stored as Record<string, unknown>
    if (typeof enabled === 'boolean') {
        config.enabled = enabled
    }
    if (typeof intervalMinutes === 'number' && !validateIntervalMinutes(intervalMinutes)) {
        config.intervalMinutes = intervalMinutes
    }
    return config
}

/**
 * Persist the config to device-local storage.
 * Rejects an invalid interval rather than storing it.
 */
export const savePeriodicSerializationConfig = (
    store: DeviceLocalStore,
    config: PeriodicSerializationConfig
): void => {
    const error = validateIntervalMinutes(config.intervalMinutes)
    if (error) {
        throw new Error(error)
    }
    store.saveLocalStorage(PERIODIC_SERIALIZATION_STORAGE_KEY, {
        enabled: config.enabled,
        intervalMinutes: config.intervalMinutes
    })
}
