import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test'
import type { Mock } from 'bun:test'
import { log, LOG_PREFIX, LOG_SEPARATOR, setDebugMode, isDebugModeEnabled } from './log'

describe('log', () => {
    let consoleSpy: {
        log: Mock<Console['log']>
        debug: Mock<Console['debug']>
        info: Mock<Console['info']>
        warn: Mock<Console['warn']>
        error: Mock<Console['error']>
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

        it('should log debug messages to console.debug', () => {
            log('debug message', 'debug')
            expect(consoleSpy.debug).toHaveBeenCalledWith(`${LOG_PREFIX} debug message`)
        })

        it('should log info messages to console.debug (Obsidian allows debug, warn and error only)', () => {
            log('info message', 'info')
            expect(consoleSpy.debug).toHaveBeenCalledWith(`${LOG_PREFIX} info message`)
        })

        it('should log warn messages to console.warn', () => {
            log('warn message', 'warn')
            expect(consoleSpy.warn).toHaveBeenCalledWith(`${LOG_PREFIX} warn message`)
        })

        it('should log error messages to console.error', () => {
            log('error message', 'error')
            expect(consoleSpy.error).toHaveBeenCalledWith(`${LOG_PREFIX} error message`)
        })

        it('should log to console.debug when no level is given', () => {
            log('plain message')
            expect(consoleSpy.debug).toHaveBeenCalledWith(`${LOG_PREFIX} plain message`)
        })

        it('should forward additional data to the console', () => {
            const data = { key: 'value' }
            log('message', 'info', data)
            expect(consoleSpy.debug).toHaveBeenCalledWith(`${LOG_PREFIX} message`, data)
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

        it('should not produce any console output at any level', () => {
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
