import { IGNORE_FRONTMATTER_KEY } from '../constants'

/**
 * Values that explicitly opt OUT of ignoring (case-insensitive string comparison).
 * Anything not in this set, that is also "truthy", will ignore the note.
 */
const FALSY_STRING_VALUES = new Set(['false', 'no', 'n', '0', 'off', ''])

/**
 * Returns true when the frontmatter signals that the note should be ignored
 * by the plugin (no queries will be processed in it).
 *
 * Accepts the configured ignore key with any "truthy" value:
 *   - boolean `true`
 *   - numbers other than 0
 *   - strings other than 'false' / 'no' / 'n' / '0' / 'off' / '' (case-insensitive)
 */
export const isIgnoredByFrontmatter = (
    frontmatter: Record<string, unknown> | undefined | null
): boolean => {
    if (!frontmatter) {
        return false
    }

    const value = frontmatter[IGNORE_FRONTMATTER_KEY]

    if (value === undefined || value === null) {
        return false
    }

    if (typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'number') {
        return value !== 0
    }

    if (typeof value === 'string') {
        return !FALSY_STRING_VALUES.has(value.trim().toLowerCase())
    }

    // Any other non-null value (arrays, objects) is treated as truthy.
    return true
}
