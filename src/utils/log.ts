import * as pluginManifest from '../../manifest.json'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const LOG_SEPARATOR = '--------------------------------------------------------'
export const LOG_PREFIX = `${pluginManifest.name}:`

/**
 * Internal state for debug mode
 */
let debugModeEnabled = false

/**
 * Set debug mode on or off
 * When debug mode is disabled, nothing is written to the console
 * @param enabled Whether to enable debug logging
 */
export const setDebugMode = (enabled: boolean): void => {
    debugModeEnabled = enabled
}

/**
 * Check if debug mode is enabled
 */
export const isDebugModeEnabled = (): boolean => {
    return debugModeEnabled
}

/**
 * Log a message
 *
 * Console output is opt-in: nothing is written unless the user enables the
 * "Debug logging" setting. This keeps the default build silent (the Obsidian
 * community plugin review flags unconditional console usage, and verbose
 * logging measurably slows down large vault scans) while still giving users a
 * way to observe what the plugin is doing when troubleshooting.
 *
 * @param message
 * @param level
 * @param data
 */
export const log = (message: string, level?: LogLevel, ...data: unknown[]): void => {
    // Nothing is ever logged unless the user opted into debug logging
    if (!debugModeEnabled) {
        return
    }

    const logMessage = `${LOG_PREFIX} ${message}`

    switch (level) {
        case 'debug':
            console.debug(logMessage, ...data)
            break
        case 'info':
            console.info(logMessage, ...data)
            break
        case 'warn':
            console.warn(logMessage, ...data)
            break
        case 'error':
            console.error(logMessage, ...data)
            break
        default:
            console.log(logMessage, ...data)
    }
}
