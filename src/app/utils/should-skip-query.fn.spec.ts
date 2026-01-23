import { describe, expect, it } from 'bun:test'
import { shouldSkipQuery } from './should-skip-query.fn'

describe('shouldSkipQuery', () => {
    describe('manual trigger (isManualTrigger = true)', () => {
        it('should NOT skip auto queries', () => {
            const result = shouldSkipQuery({
                updateMode: 'auto',
                isManualTrigger: true,
                isAlreadySerialized: false
            })
            expect(result).toBe(false)
        })

        it('should NOT skip manual queries', () => {
            const result = shouldSkipQuery({
                updateMode: 'manual',
                isManualTrigger: true,
                isAlreadySerialized: false
            })
            expect(result).toBe(false)
        })

        it('should NOT skip once queries (not serialized)', () => {
            const result = shouldSkipQuery({
                updateMode: 'once',
                isManualTrigger: true,
                isAlreadySerialized: false
            })
            expect(result).toBe(false)
        })

        it('should NOT skip once queries (already serialized)', () => {
            const result = shouldSkipQuery({
                updateMode: 'once',
                isManualTrigger: true,
                isAlreadySerialized: true
            })
            expect(result).toBe(false)
        })

        it('should NOT skip auto queries (already serialized)', () => {
            const result = shouldSkipQuery({
                updateMode: 'auto',
                isManualTrigger: true,
                isAlreadySerialized: true
            })
            expect(result).toBe(false)
        })

        it('should NOT skip manual queries (already serialized)', () => {
            const result = shouldSkipQuery({
                updateMode: 'manual',
                isManualTrigger: true,
                isAlreadySerialized: true
            })
            expect(result).toBe(false)
        })
    })

    describe('automatic trigger (isManualTrigger = false)', () => {
        describe('auto update mode', () => {
            it('should NOT skip auto queries (not serialized)', () => {
                const result = shouldSkipQuery({
                    updateMode: 'auto',
                    isManualTrigger: false,
                    isAlreadySerialized: false
                })
                expect(result).toBe(false)
            })

            it('should NOT skip auto queries (already serialized)', () => {
                const result = shouldSkipQuery({
                    updateMode: 'auto',
                    isManualTrigger: false,
                    isAlreadySerialized: true
                })
                expect(result).toBe(false)
            })
        })

        describe('manual update mode', () => {
            it('should SKIP manual queries (not serialized)', () => {
                const result = shouldSkipQuery({
                    updateMode: 'manual',
                    isManualTrigger: false,
                    isAlreadySerialized: false
                })
                expect(result).toBe(true)
            })

            it('should SKIP manual queries (already serialized)', () => {
                const result = shouldSkipQuery({
                    updateMode: 'manual',
                    isManualTrigger: false,
                    isAlreadySerialized: true
                })
                expect(result).toBe(true)
            })
        })

        describe('once update mode', () => {
            it('should NOT skip once queries (not serialized)', () => {
                const result = shouldSkipQuery({
                    updateMode: 'once',
                    isManualTrigger: false,
                    isAlreadySerialized: false
                })
                expect(result).toBe(false)
            })

            it('should SKIP once queries (already serialized)', () => {
                const result = shouldSkipQuery({
                    updateMode: 'once',
                    isManualTrigger: false,
                    isAlreadySerialized: true
                })
                expect(result).toBe(true)
            })
        })
    })

    describe('edge cases', () => {
        it('should handle all combinations correctly', () => {
            // This is a comprehensive truth table test
            const testCases: Array<{
                updateMode: 'auto' | 'manual' | 'once'
                isManualTrigger: boolean
                isAlreadySerialized: boolean
                expectedSkip: boolean
            }> = [
                // Manual trigger - never skip
                {
                    updateMode: 'auto',
                    isManualTrigger: true,
                    isAlreadySerialized: false,
                    expectedSkip: false
                },
                {
                    updateMode: 'auto',
                    isManualTrigger: true,
                    isAlreadySerialized: true,
                    expectedSkip: false
                },
                {
                    updateMode: 'manual',
                    isManualTrigger: true,
                    isAlreadySerialized: false,
                    expectedSkip: false
                },
                {
                    updateMode: 'manual',
                    isManualTrigger: true,
                    isAlreadySerialized: true,
                    expectedSkip: false
                },
                {
                    updateMode: 'once',
                    isManualTrigger: true,
                    isAlreadySerialized: false,
                    expectedSkip: false
                },
                {
                    updateMode: 'once',
                    isManualTrigger: true,
                    isAlreadySerialized: true,
                    expectedSkip: false
                },

                // Automatic trigger - skip based on rules
                {
                    updateMode: 'auto',
                    isManualTrigger: false,
                    isAlreadySerialized: false,
                    expectedSkip: false
                },
                {
                    updateMode: 'auto',
                    isManualTrigger: false,
                    isAlreadySerialized: true,
                    expectedSkip: false
                },
                {
                    updateMode: 'manual',
                    isManualTrigger: false,
                    isAlreadySerialized: false,
                    expectedSkip: true
                },
                {
                    updateMode: 'manual',
                    isManualTrigger: false,
                    isAlreadySerialized: true,
                    expectedSkip: true
                },
                {
                    updateMode: 'once',
                    isManualTrigger: false,
                    isAlreadySerialized: false,
                    expectedSkip: false
                },
                {
                    updateMode: 'once',
                    isManualTrigger: false,
                    isAlreadySerialized: true,
                    expectedSkip: true
                }
            ]

            for (const testCase of testCases) {
                const result = shouldSkipQuery({
                    updateMode: testCase.updateMode,
                    isManualTrigger: testCase.isManualTrigger,
                    isAlreadySerialized: testCase.isAlreadySerialized
                })

                expect(result).toBe(testCase.expectedSkip)
            }
        })
    })
})
