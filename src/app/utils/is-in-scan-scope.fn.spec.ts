import { describe, expect, test } from 'bun:test'
import { isInScanScope } from './is-in-scan-scope.fn'

describe('isInScanScope', () => {
    test('treats an empty list as the whole vault', () => {
        expect(isInScanScope('any/note.md', [])).toBe(true)
        expect(isInScanScope('root.md', [])).toBe(true)
    })

    test('accepts files under a configured folder', () => {
        expect(isInScanScope('Index/Projects.md', ['Index'])).toBe(true)
        expect(isInScanScope('Index/sub/Deep.md', ['Index'])).toBe(true)
    })

    test('rejects files outside every configured folder', () => {
        expect(isInScanScope('Notes/Other.md', ['Index'])).toBe(false)
        expect(isInScanScope('root.md', ['Index', 'Dashboards'])).toBe(false)
    })

    test('accepts a match on any of several folders', () => {
        expect(isInScanScope('Dashboards/Home.md', ['Index', 'Dashboards'])).toBe(true)
    })
})
