import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import type { Literal, Link, Widget, DataObject } from 'obsidian-dataview/lib/data-model/value'

/**
 * Interface for DateTime-like objects (to avoid direct Luxon dependency)
 */
interface DateTimeLike {
    toISO: () => string | null
    toISODate: () => string | null
    toFormat: (format: string) => string
    hour: number
    minute: number
    second: number
}

/**
 * Interface for Duration-like objects (to avoid direct Luxon dependency)
 */
interface DurationLike {
    toISO: () => string | null
    toHuman: () => string | null
}

/**
 * Type guard to check if a value is a Dataview Link
 */
function isLink(value: unknown): value is Link {
    return (
        value !== null &&
        typeof value === 'object' &&
        'path' in value &&
        'embed' in value &&
        typeof (value as Link).path === 'string' &&
        typeof (value as Link).embed === 'boolean'
    )
}

/**
 * Type guard to check if a value is a Luxon DateTime
 */
function isDateTime(value: unknown): value is DateTimeLike {
    return (
        value !== null &&
        typeof value === 'object' &&
        'toISO' in value &&
        'toFormat' in value &&
        typeof (value as { toISO: unknown }).toISO === 'function'
    )
}

/**
 * Type guard to check if a value is a Luxon Duration
 */
function isDuration(value: unknown): value is DurationLike {
    return (
        value !== null &&
        typeof value === 'object' &&
        'toISO' in value &&
        'toHuman' in value &&
        typeof (value as { toHuman: unknown }).toHuman === 'function' &&
        !('toFormat' in value && typeof (value as { toFormat: unknown }).toFormat === 'function')
    )
}

/**
 * Type guard to check if a value is a Dataview Widget
 */
function isWidget(value: unknown): value is Widget {
    return (
        value !== null &&
        typeof value === 'object' &&
        '$widget' in value &&
        'markdown' in value &&
        typeof (value as Widget).markdown === 'function'
    )
}

/**
 * Type guard to check if a value is an HTMLElement
 */
function isHTMLElement(value: unknown): value is HTMLElement {
    return value !== null && typeof value === 'object' && 'tagName' in value && 'innerHTML' in value
}

/**
 * Type guard to check if a value is a plain object (DataObject)
 */
function isDataObject(value: unknown): value is DataObject {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isLink(value) &&
        !isDateTime(value) &&
        !isDuration(value) &&
        !isWidget(value) &&
        !isHTMLElement(value)
    )
}

/**
 * Convert a Dataview Literal value to a string representation.
 *
 * Handles all Dataview literal types:
 * - Primitives: string, number, boolean, null
 * - DateTime: formatted as ISO date
 * - Duration: human-readable format
 * - Link: markdown link format (with embed support)
 * - Array: comma-separated values
 * - Object: key-value pairs
 * - Widget: uses markdown() method
 * - HTMLElement: extracts text content
 * - Function: returns placeholder
 *
 * @param value The Dataview Literal value to convert
 * @param dataviewApi The Dataview API instance (for potential future use)
 * @returns String representation of the value
 */
export function literalToString(value: Literal, _dataviewApi: DataviewApi): string {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return '-'
    }

    // Handle primitives
    if (typeof value === 'string') {
        return value
    }

    if (typeof value === 'number') {
        return String(value)
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false'
    }

    // Handle functions
    if (typeof value === 'function') {
        return '<function>'
    }

    // Handle Link (check before other objects)
    if (isLink(value)) {
        return linkToString(value)
    }

    // Handle DateTime
    if (isDateTime(value)) {
        // Format as ISO date for readability
        const iso = value.toISO()
        if (iso) {
            // Return just the date portion if no time component, otherwise full ISO
            if (value.hour === 0 && value.minute === 0 && value.second === 0) {
                return value.toISODate() ?? iso
            }
            return iso
        }
        return '-'
    }

    // Handle Duration
    if (isDuration(value)) {
        // Use human-readable format
        const human = value.toHuman()
        if (human) {
            return human
        }
        // Fallback to ISO format
        const iso = value.toISO()
        return iso ?? '-'
    }

    // Handle Widget
    if (isWidget(value)) {
        return value.markdown()
    }

    // Handle HTMLElement
    if (isHTMLElement(value)) {
        return value.textContent ?? ''
    }

    // Handle Array
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '-'
        }
        const items = value.map((item) => literalToString(item as Literal, _dataviewApi))
        return items.join(', ')
    }

    // Handle DataObject (plain object)
    if (isDataObject(value)) {
        const entries = Object.entries(value)
        if (entries.length === 0) {
            return '-'
        }
        const pairs = entries.map(
            ([key, val]) => `${key}: ${literalToString(val as Literal, _dataviewApi)}`
        )
        return `{ ${pairs.join(', ')} }`
    }

    // Fallback: try to convert to string
    return String(value)
}

/**
 * Convert a Dataview Link to its markdown representation.
 *
 * @param link The Dataview Link to convert
 * @returns Markdown link string
 */
function linkToString(link: Link): string {
    // Use the Link's toString() method if available
    if (typeof link.toString === 'function') {
        const str = link.toString()
        // The toString() method returns the markdown representation
        if (str && str !== '[object Object]') {
            return str
        }
    }

    // Fallback: build the link manually
    const prefix = link.embed ? '!' : ''
    let linkPath = link.path

    // Add subpath if present
    if (link.subpath) {
        if (link.type === 'header') {
            linkPath += '#' + link.subpath
        } else if (link.type === 'block') {
            linkPath += '#^' + link.subpath
        }
    }

    // Add display text if present and different from path
    if (link.display && link.display !== link.path) {
        return `${prefix}[[${linkPath}|${link.display}]]`
    }

    return `${prefix}[[${linkPath}]]`
}

/**
 * Escape special characters in inline query results that might interfere with markdown tables.
 * This is specifically for results that will appear inside table cells.
 *
 * @param value The string value to escape
 * @returns Escaped string safe for table cells
 */
export function escapeForTable(value: string): string {
    // Escape pipe characters which are table column separators
    return value.replace(/\|/g, '\\|')
}
