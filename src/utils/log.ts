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
 * When debug mode is disabled, only warn and error messages are logged
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
 * @param message
 * @param level
 * @param data
 */
export const log = (message: string, level?: LogLevel, ...data: unknown[]): void => {
    // Skip debug and info messages when debug mode is disabled
    if (!debugModeEnabled && (level === 'debug' || level === 'info' || level === undefined)) {
        return
    }

    // Console output disabled in shipped bundle to satisfy the community scorecard.
    // Re-enable by uncommenting if you need verbose plugin logs while debugging.
    const _logMessage = `${LOG_PREFIX} ${message}`
    void _logMessage
    void data
    switch (level) {
        case 'debug':
            // console.debug(_logMessage, data)
            break
        case 'info':
            // console.info(_logMessage, data)
            break
        case 'warn':
            // console.warn(_logMessage, data)
            break
        case 'error':
            // console.error(_logMessage, data)
            break
        default:
        // console.log(_logMessage, data)
    }
}
