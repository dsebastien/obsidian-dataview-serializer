import {
    addDays,
    addMonths,
    addQuarters,
    addWeeks,
    addYears,
    format,
    getISOWeek,
    getQuarter
} from 'date-fns'

/**
 * Supported placeholder names, mapped to:
 * - `unit`: the calendar unit an offset (e.g. `-1`) shifts the reference date by
 * - `render`: how the (shifted) date is rendered when no custom format is given
 *
 * Rendering intentionally avoids locale-dependent output for numeric values so
 * that resolved folder paths stay stable across devices and languages.
 */
const PLACEHOLDERS = {
    year: {
        unit: 'year',
        render: (date: Date): string => format(date, 'yyyy')
    },
    quarter: {
        unit: 'quarter',
        render: (date: Date): string => `Q${getQuarter(date)}`
    },
    monthname: {
        unit: 'month',
        render: (date: Date): string => format(date, 'MMM')
    },
    month: {
        unit: 'month',
        render: (date: Date): string => format(date, 'MM')
    },
    week: {
        unit: 'week',
        render: (date: Date): string => String(getISOWeek(date)).padStart(2, '0')
    },
    date: {
        unit: 'day',
        render: (date: Date): string => format(date, 'yyyy-MM-dd')
    },
    day: {
        unit: 'day',
        render: (date: Date): string => format(date, 'dd')
    }
} as const

type PlaceholderName = keyof typeof PLACEHOLDERS
type PlaceholderUnit = (typeof PLACEHOLDERS)[PlaceholderName]['unit']

/**
 * Matches `{{name}}`, `{{name-1}}`, `{{name+2}}`, `{{name:FORMAT}}` and
 * `{{name-1:FORMAT}}`.
 *
 * `monthname` MUST come before `month` in the alternation, otherwise `month`
 * would match its prefix and the placeholder would never resolve.
 */
const PLACEHOLDER_REGEX =
    /\{\{\s*(year|quarter|monthname|month|week|date|day)\s*([+-]\s*\d+)?\s*(?::([^}]*?))?\s*\}\}/gi

const shiftDate = (date: Date, unit: PlaceholderUnit, amount: number): Date => {
    switch (unit) {
        case 'year':
            return addYears(date, amount)
        case 'quarter':
            return addQuarters(date, amount)
        case 'month':
            return addMonths(date, amount)
        case 'week':
            return addWeeks(date, amount)
        case 'day':
            return addDays(date, amount)
    }
}

/**
 * Resolves date placeholders in a folder path (or any other string).
 *
 * Supported placeholders (case-insensitive), shown for 2026-07-23:
 * - `{{year}}` → `2026`
 * - `{{quarter}}` → `Q3`
 * - `{{month}}` → `07`
 * - `{{monthName}}` → `Jul`
 * - `{{week}}` → `30` (ISO week number)
 * - `{{date}}` → `2026-07-23`
 * - `{{day}}` → `23`
 *
 * Each placeholder accepts an optional offset, expressed in the placeholder's
 * own unit: `{{month-1}}` (previous month), `{{week+1}}` (next week),
 * `{{date-7}}` (seven days ago).
 *
 * Each placeholder also accepts an optional [date-fns format string]
 * (https://date-fns.org/docs/format) after a colon, which overrides the default
 * rendering: `{{date:MM-MMM}}` → `07-Jul`, `{{month-1:MMMM}}` → `June`.
 * Literal text inside a custom format must be single-quoted, as date-fns
 * requires: `{{week:RRRR-'CW'II}}` → `2026-CW30`.
 *
 * Unknown placeholders and invalid formats are left untouched, so a typo shows
 * up in the UI instead of silently resolving to something unexpected.
 *
 * @param input the string to resolve
 * @param referenceDate the date to resolve against (defaults to now)
 */
export const resolvePathPlaceholders = (
    input: string,
    referenceDate: Date = new Date()
): string => {
    if (!input) {
        return input
    }

    return input.replace(
        PLACEHOLDER_REGEX,
        (match: string, rawName: string, rawOffset?: string, customFormat?: string): string => {
            const name = rawName.toLowerCase() as PlaceholderName
            const placeholder = PLACEHOLDERS[name]

            const offset = rawOffset ? Number.parseInt(rawOffset.replace(/\s+/g, ''), 10) : 0
            if (Number.isNaN(offset)) {
                return match
            }

            const date =
                offset === 0 ? referenceDate : shiftDate(referenceDate, placeholder.unit, offset)

            if (customFormat === undefined || customFormat.trim().length === 0) {
                return placeholder.render(date)
            }

            try {
                return format(date, customFormat)
            } catch {
                // Invalid date-fns format string: keep the placeholder as-is
                return match
            }
        }
    )
}

/**
 * Returns true when the given string contains at least one supported placeholder.
 */
export const containsPathPlaceholders = (input: string): boolean => {
    if (!input) {
        return false
    }

    // The regex is global, so its lastIndex must be reset between calls
    PLACEHOLDER_REGEX.lastIndex = 0
    return PLACEHOLDER_REGEX.test(input)
}
