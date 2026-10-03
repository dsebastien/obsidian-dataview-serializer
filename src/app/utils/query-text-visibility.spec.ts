import { describe, expect, test } from 'bun:test'
import {
    applyQueryTextVisibility,
    HIDE_QUERY_TEXT_CLASS,
    type ClassToggleable
} from './query-text-visibility'

/**
 * In-memory stand-in for an element's class list.
 */
class FakeBody implements ClassToggleable {
    readonly classes = new Set<string>()

    toggleClass(cls: string, value: boolean): void {
        if (value) {
            this.classes.add(cls)
        } else {
            this.classes.delete(cls)
        }
    }
}

describe('applyQueryTextVisibility', () => {
    test('adds the class to every body when hiding', () => {
        const bodies = [new FakeBody(), new FakeBody()]

        applyQueryTextVisibility(bodies, true)

        for (const body of bodies) {
            expect(body.classes.has(HIDE_QUERY_TEXT_CLASS)).toBe(true)
        }
    })

    test('removes the class from every body when showing', () => {
        const bodies = [new FakeBody(), new FakeBody()]
        applyQueryTextVisibility(bodies, true)

        applyQueryTextVisibility(bodies, false)

        for (const body of bodies) {
            expect(body.classes.has(HIDE_QUERY_TEXT_CLASS)).toBe(false)
        }
    })

    test('leaves other classes alone', () => {
        const body = new FakeBody()
        body.classes.add('theme-dark')

        applyQueryTextVisibility([body], true)
        applyQueryTextVisibility([body], false)

        expect([...body.classes]).toEqual(['theme-dark'])
    })
})
