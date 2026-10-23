import { describe, expect, it } from 'bun:test'
import {
    buildUnresolvedReferencesNotice,
    UnresolvedReferenceNoticeThrottle,
    type SkippedQuery
} from './unresolved-reference-notices'

const skip = (
    filePath: string,
    query = 'LIST FROM [[X]]',
    unresolved = ['[[X]]']
): SkippedQuery => ({
    filePath,
    query,
    unresolved
})

describe('UnresolvedReferenceNoticeThrottle', () => {
    const createThrottle = (): {
        throttle: UnresolvedReferenceNoticeThrottle
        advance: (ms: number) => void
    } => {
        let time = 1_000
        const throttle = new UnresolvedReferenceNoticeThrottle(60_000, () => time)
        return { throttle, advance: (ms) => (time += ms) }
    }

    it('reports a skip the first time', () => {
        const { throttle } = createThrottle()
        expect(throttle.select([skip('a.md')], false)).toHaveLength(1)
    })

    it('does not report the same skip again within the cooldown on automatic runs', () => {
        const { throttle, advance } = createThrottle()
        throttle.select([skip('a.md')], false)
        advance(59_999)
        expect(throttle.select([skip('a.md')], false)).toEqual([])
    })

    it('reports it again once the cooldown has elapsed', () => {
        const { throttle, advance } = createThrottle()
        throttle.select([skip('a.md')], false)
        advance(60_000)
        expect(throttle.select([skip('a.md')], false)).toHaveLength(1)
    })

    it('always reports on manual runs', () => {
        const { throttle } = createThrottle()
        throttle.select([skip('a.md')], false)
        expect(throttle.select([skip('a.md')], true)).toHaveLength(1)
        expect(throttle.select([skip('a.md')], true)).toHaveLength(1)
    })

    it('treats a different file, query, or reference as a new skip', () => {
        const { throttle } = createThrottle()
        throttle.select([skip('a.md')], false)
        expect(
            throttle.select(
                [
                    skip('a.md'),
                    skip('b.md'),
                    skip('a.md', 'LIST FROM "Y"', ['"Y"']),
                    skip('a.md', 'LIST FROM [[X]]', ['[[Z]]'])
                ],
                false
            )
        ).toHaveLength(3)
    })
})

describe('buildUnresolvedReferencesNotice', () => {
    it('names the file and references of a single skip', () => {
        const message = buildUnresolvedReferencesNotice([
            skip('Goals/Teach.md', 'LIST FROM [[Old]] OR "Gone"', ['[[Old]]', '"Gone"'])
        ])
        expect(message).toContain('"Teach.md"')
        expect(message).toContain('[[Old]], "Gone"')
        expect(message).toContain('previous result was kept')
    })

    it('summarizes several skips in one notice', () => {
        const message = buildUnresolvedReferencesNotice([skip('a.md'), skip('dir/b.md')])
        expect(message).toContain('2 queries skipped: unresolved references')
        expect(message).toContain('- a.md: [[X]]')
        expect(message).toContain('- b.md: [[X]]')
        expect(message).not.toContain('more')
    })

    it('lists at most three skips', () => {
        const message = buildUnresolvedReferencesNotice([
            skip('a.md'),
            skip('b.md'),
            skip('c.md'),
            skip('d.md'),
            skip('e.md')
        ])
        expect(message).toContain('5 queries skipped')
        expect(message).toContain('- c.md')
        expect(message).not.toContain('- d.md')
        expect(message).toContain('…and 2 more')
    })
})
