import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test'
import { log, LOG_PREFIX, LOG_SEPARATOR } from './log'

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

    describe('log function', () => {
        it('should call console.log by default when no level is specified', () => {
            log('test message')
            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
            expect(consoleSpy.log).toHaveBeenCalledWith(`${LOG_PREFIX} test message`, [])
        })

        it('should call console.debug for debug level', () => {
            log('debug message', 'debug')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
            expect(consoleSpy.debug).toHaveBeenCalledWith(`${LOG_PREFIX} debug message`, [])
        })

        it('should call console.info for info level', () => {
            log('info message', 'info')
            expect(consoleSpy.info).toHaveBeenCalledTimes(1)
            expect(consoleSpy.info).toHaveBeenCalledWith(`${LOG_PREFIX} info message`, [])
        })

        it('should call console.warn for warn level', () => {
            log('warn message', 'warn')
            expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
            expect(consoleSpy.warn).toHaveBeenCalledWith(`${LOG_PREFIX} warn message`, [])
        })

        it('should call console.error for error level', () => {
            log('error message', 'error')
            expect(consoleSpy.error).toHaveBeenCalledTimes(1)
            expect(consoleSpy.error).toHaveBeenCalledWith(`${LOG_PREFIX} error message`, [])
        })

        it('should pass additional data to the console method', () => {
            const extraData = { key: 'value' }
            const moreData = [1, 2, 3]
            log('message with data', 'info', extraData, moreData)
            expect(consoleSpy.info).toHaveBeenCalledWith(`${LOG_PREFIX} message with data`, [
                extraData,
                moreData
            ])
        })

        it('should handle empty message', () => {
            log('')
            expect(consoleSpy.log).toHaveBeenCalledWith(`${LOG_PREFIX} `, [])
        })

        it('should handle undefined level as default', () => {
            log('test', undefined)
            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
        })
    })
})
