import { describe, expect, it } from 'bun:test'
import { isIgnoredByFrontmatter } from './is-ignored-by-frontmatter.fn'
import { IGNORE_FRONTMATTER_KEY } from '../constants'

describe('isIgnoredByFrontmatter', () => {
    it('returns false when frontmatter is undefined', () => {
        expect(isIgnoredByFrontmatter(undefined)).toBe(false)
    })

    it('returns false when frontmatter is null', () => {
        expect(isIgnoredByFrontmatter(null)).toBe(false)
    })

    it('returns false when the key is missing', () => {
        expect(isIgnoredByFrontmatter({ other: 'value' })).toBe(false)
    })

    it('returns false when the key is explicitly false', () => {
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: false })).toBe(false)
    })

    it('returns true when the key is boolean true', () => {
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: true })).toBe(true)
    })

    it('returns true for common truthy string values', () => {
        for (const value of ['true', 'yes', 'y', '1', 'on', 'ignore']) {
            expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: value })).toBe(true)
        }
    })

    it('returns false for common falsy string values (case-insensitive)', () => {
        for (const value of ['false', 'FALSE', 'No', 'n', '0', 'off', '']) {
            expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: value })).toBe(false)
        }
    })

    it('trims whitespace before comparison', () => {
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: '  false  ' })).toBe(false)
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: '  true  ' })).toBe(true)
    })

    it('treats non-zero numbers as truthy and 0 as falsy', () => {
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: 1 })).toBe(true)
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: -1 })).toBe(true)
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: 0 })).toBe(false)
    })

    it('treats null/undefined values as not ignored', () => {
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: null })).toBe(false)
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: undefined })).toBe(false)
    })

    it('treats arrays and objects as truthy', () => {
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: ['anything'] })).toBe(true)
        expect(isIgnoredByFrontmatter({ [IGNORE_FRONTMATTER_KEY]: { nested: true } })).toBe(true)
    })
})
