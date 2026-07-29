import { describe, expect, it } from 'bun:test'
import { containsPathPlaceholders, resolvePathPlaceholders } from './resolve-path-placeholders.fn'

// Thursday, July 23rd 2026 - ISO week 30, Q3
const REFERENCE_DATE = new Date(2026, 6, 23, 12, 0, 0)

describe('resolvePathPlaceholders', () => {
    describe('basic placeholders', () => {
        it('should resolve {{year}}', () => {
            expect(resolvePathPlaceholders('Daily/{{year}}', REFERENCE_DATE)).toBe('Daily/2026')
        })

        it('should resolve {{quarter}}', () => {
            expect(resolvePathPlaceholders('Archive/{{quarter}}', REFERENCE_DATE)).toBe(
                'Archive/Q3'
            )
        })

        it('should resolve {{month}}', () => {
            expect(resolvePathPlaceholders('Daily/{{month}}', REFERENCE_DATE)).toBe('Daily/07')
        })

        it('should resolve {{monthName}}', () => {
            expect(resolvePathPlaceholders('Daily/{{monthName}}', REFERENCE_DATE)).toBe('Daily/Jul')
        })

        it('should resolve {{week}} to the padded ISO week number', () => {
            expect(resolvePathPlaceholders('Weekly/{{week}}', REFERENCE_DATE)).toBe('Weekly/30')
        })

        it('should pad single digit ISO week numbers', () => {
            expect(resolvePathPlaceholders('{{week}}', new Date(2026, 0, 8))).toBe('02')
        })

        it('should resolve {{date}}', () => {
            expect(resolvePathPlaceholders('Daily/{{date}}', REFERENCE_DATE)).toBe(
                'Daily/2026-07-23'
            )
        })

        it('should resolve {{day}}', () => {
            expect(resolvePathPlaceholders('{{day}}', REFERENCE_DATE)).toBe('23')
        })

        it('should resolve several placeholders in a single path', () => {
            expect(
                resolvePathPlaceholders('Daily/{{year}}/{{month}}-{{monthName}}', REFERENCE_DATE)
            ).toBe('Daily/2026/07-Jul')
        })

        it('should resolve repeated placeholders', () => {
            expect(resolvePathPlaceholders('{{year}}/{{year}}', REFERENCE_DATE)).toBe('2026/2026')
        })

        it('should be case insensitive', () => {
            expect(resolvePathPlaceholders('{{YEAR}}/{{MonthName}}', REFERENCE_DATE)).toBe(
                '2026/Jul'
            )
        })

        it('should tolerate whitespace inside the braces', () => {
            expect(resolvePathPlaceholders('{{ year }}', REFERENCE_DATE)).toBe('2026')
        })
    })

    describe('offsets', () => {
        it('should shift {{month-1}} by one month', () => {
            expect(resolvePathPlaceholders('{{month-1}}', REFERENCE_DATE)).toBe('06')
        })

        it('should shift {{month+1}} by one month', () => {
            expect(resolvePathPlaceholders('{{month+1}}', REFERENCE_DATE)).toBe('08')
        })

        it('should roll the year over when shifting months across boundaries', () => {
            expect(resolvePathPlaceholders('{{year-1}}/{{month-1}}', new Date(2026, 0, 15))).toBe(
                '2025/12'
            )
        })

        it('should not roll the year of {{year}} when shifting {{month}}', () => {
            // The year placeholder is resolved independently of the month one
            expect(resolvePathPlaceholders('{{year}}/{{month-1}}', new Date(2026, 0, 15))).toBe(
                '2026/12'
            )
        })

        it('should shift {{week-1}} by one week', () => {
            expect(resolvePathPlaceholders('{{week-1}}', REFERENCE_DATE)).toBe('29')
        })

        it('should shift {{date-7}} by seven days', () => {
            expect(resolvePathPlaceholders('{{date-7}}', REFERENCE_DATE)).toBe('2026-07-16')
        })

        it('should shift {{quarter-1}} by one quarter', () => {
            expect(resolvePathPlaceholders('{{quarter-1}}', REFERENCE_DATE)).toBe('Q2')
        })

        it('should shift {{year+2}} by two years', () => {
            expect(resolvePathPlaceholders('{{year+2}}', REFERENCE_DATE)).toBe('2028')
        })

        it('should tolerate whitespace around the offset', () => {
            expect(resolvePathPlaceholders('{{ month - 1 }}', REFERENCE_DATE)).toBe('06')
        })
    })

    describe('custom formats', () => {
        it('should apply a custom date-fns format', () => {
            expect(resolvePathPlaceholders('{{date:MM-MMM}}', REFERENCE_DATE)).toBe('07-Jul')
        })

        it('should apply a custom format to a shifted date', () => {
            expect(resolvePathPlaceholders('{{month-1:MMMM}}', REFERENCE_DATE)).toBe('June')
        })

        it('should support quoted literals in custom formats', () => {
            expect(resolvePathPlaceholders("{{week:RRRR-'CW'II}}", REFERENCE_DATE)).toBe(
                '2026-CW30'
            )
        })

        it('should fall back to the default rendering for an empty format', () => {
            expect(resolvePathPlaceholders('{{year:}}', REFERENCE_DATE)).toBe('2026')
        })

        it('should leave the placeholder untouched when the format is invalid', () => {
            // YYYY is a protected date-fns token and throws
            expect(resolvePathPlaceholders('{{date:YYYY}}', REFERENCE_DATE)).toBe('{{date:YYYY}}')
        })
    })

    describe('inputs without placeholders', () => {
        it('should return static paths untouched', () => {
            expect(resolvePathPlaceholders('Index/Projects', REFERENCE_DATE)).toBe('Index/Projects')
        })

        it('should return an empty string untouched', () => {
            expect(resolvePathPlaceholders('', REFERENCE_DATE)).toBe('')
        })

        it('should leave unknown placeholders untouched', () => {
            expect(resolvePathPlaceholders('{{unknown}}/{{year}}', REFERENCE_DATE)).toBe(
                '{{unknown}}/2026'
            )
        })

        it('should leave single braces untouched', () => {
            expect(resolvePathPlaceholders('{year}', REFERENCE_DATE)).toBe('{year}')
        })

        it('should not resolve a placeholder that is missing its closing braces', () => {
            expect(resolvePathPlaceholders('{{year', REFERENCE_DATE)).toBe('{{year')
        })
    })

    describe('default reference date', () => {
        it('should resolve against the current date when none is given', () => {
            const now = new Date()
            const expectedYear = String(now.getFullYear())
            expect(resolvePathPlaceholders('{{year}}')).toBe(expectedYear)
        })
    })
})

describe('containsPathPlaceholders', () => {
    it('should detect a placeholder', () => {
        expect(containsPathPlaceholders('Daily/{{year}}')).toBe(true)
    })

    it('should detect a placeholder with an offset and a format', () => {
        expect(containsPathPlaceholders('Daily/{{month-1:MMMM}}')).toBe(true)
    })

    it('should return false for static paths', () => {
        expect(containsPathPlaceholders('Daily/2026')).toBe(false)
    })

    it('should return false for unknown placeholders', () => {
        expect(containsPathPlaceholders('{{whatever}}')).toBe(false)
    })

    it('should return false for an empty string', () => {
        expect(containsPathPlaceholders('')).toBe(false)
    })

    it('should be stable across repeated calls', () => {
        // Guards against the shared global regex keeping state between calls
        expect(containsPathPlaceholders('{{year}}')).toBe(true)
        expect(containsPathPlaceholders('{{year}}')).toBe(true)
        expect(containsPathPlaceholders('{{year}}')).toBe(true)
    })
})
