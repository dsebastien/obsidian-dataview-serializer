import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test'
import { log, LOG_PREFIX, LOG_SEPARATOR, setDebugMode, isDebugModeEnabled } from './log'

describe('log', () => {
    let consoleSpy: {
        log: ReturnType<typeof spyOn>
        debug: ReturnType<typeof spyOn>
        info: ReturnType<typeof spyOn>
        warn: ReturnType<typeof spyOn>
        error: ReturnType<typeof spyOn>
    }

    beforeEach(() => {
        consoleSpy = {
            log: spyOn(console, 'log').mockImplementation(() => {}),
            debug: spyOn(console, 'debug').mockImplementation(() => {}),
            info: spyOn(console, 'info').mockImplementation(() => {}),
            warn: spyOn(console, 'warn').mockImplementation(() => {}),
            error: spyOn(console, 'error').mockImplementation(() => {})
        }
    })

    afterEach(() => {
        consoleSpy.log.mockRestore()
        consoleSpy.debug.mockRestore()
        consoleSpy.info.mockRestore()
        consoleSpy.warn.mockRestore()
        consoleSpy.error.mockRestore()
        // Reset debug mode after each test
        setDebugMode(false)
    })

    describe('LOG_PREFIX', () => {
        it('should be defined', () => {
            expect(LOG_PREFIX).toBeDefined()
            expect(typeof LOG_PREFIX).toBe('string')
        })
    })

    describe('LOG_SEPARATOR', () => {
        it('should be defined', () => {
            expect(LOG_SEPARATOR).toBeDefined()
            expect(LOG_SEPARATOR).toBe('--------------------------------------------------------')
        })
    })

    describe('setDebugMode', () => {
        it('should enable debug mode', () => {
            setDebugMode(true)
            expect(isDebugModeEnabled()).toBe(true)
        })

        it('should disable debug mode', () => {
            setDebugMode(true)
            setDebugMode(false)
            expect(isDebugModeEnabled()).toBe(false)
        })
    })

    describe('log function with debug mode enabled', () => {
        beforeEach(() => {
            setDebugMode(true)
        })

        it('should not throw when called with no level', () => {
            expect(() => log('test message')).not.toThrow()
        })

        it('should not throw for debug level', () => {
            expect(() => log('debug message', 'debug')).not.toThrow()
        })

        it('should not throw for info level', () => {
            expect(() => log('info message', 'info')).not.toThrow()
        })

        it('should not throw for warn level', () => {
            expect(() => log('warn message', 'warn')).not.toThrow()
        })

        it('should not throw for error level', () => {
            expect(() => log('error message', 'error')).not.toThrow()
        })

        it('should not produce console output (calls suppressed for community scorecard)', () => {
            log('message', 'info', { key: 'value' })
            expect(consoleSpy.log).not.toHaveBeenCalled()
            expect(consoleSpy.debug).not.toHaveBeenCalled()
            expect(consoleSpy.info).not.toHaveBeenCalled()
            expect(consoleSpy.warn).not.toHaveBeenCalled()
            expect(consoleSpy.error).not.toHaveBeenCalled()
        })

        it('should handle empty message without throwing', () => {
            expect(() => log('')).not.toThrow()
        })

        it('should handle undefined level without throwing', () => {
            expect(() => log('test', undefined)).not.toThrow()
        })
    })

    describe('log function with debug mode disabled (default)', () => {
        beforeEach(() => {
            setDebugMode(false)
        })

        it('should not throw when no level is specified', () => {
            expect(() => log('test message')).not.toThrow()
        })

        it('should not throw for debug level', () => {
            expect(() => log('debug message', 'debug')).not.toThrow()
        })

        it('should not throw for info level', () => {
            expect(() => log('info message', 'info')).not.toThrow()
        })

        it('should not throw for warn level', () => {
            expect(() => log('warn message', 'warn')).not.toThrow()
        })

        it('should not throw for error level', () => {
            expect(() => log('error message', 'error')).not.toThrow()
        })

        it('should not produce console output at any level', () => {
            log('test', undefined)
            log('debug', 'debug')
            log('info', 'info')
            log('warn', 'warn')
            log('error', 'error')
            expect(consoleSpy.log).not.toHaveBeenCalled()
            expect(consoleSpy.debug).not.toHaveBeenCalled()
            expect(consoleSpy.info).not.toHaveBeenCalled()
            expect(consoleSpy.warn).not.toHaveBeenCalled()
            expect(consoleSpy.error).not.toHaveBeenCalled()
        })
    })
})
