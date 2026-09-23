import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { serializeDataviewJSQuery } from './serialize-dataviewjs-query.fn'
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'

/**
 * The module under test schedules its timeout through `window`, as the Obsidian
 * plugin conventions require (see AGENTS.md). Bun has no `window`, so the tests
 * provide one. `fireTimeoutsImmediately` collapses the 5s production timeout to
 * the next tick, so the abandonment path can be exercised without a 5s wait.
 */
let fireTimeoutsImmediately = false
// `self` is Bun's global object (the same object as `globalThis`)
const globalScope = self as unknown as { window?: unknown; __dvProbe?: unknown }
const originalWindow = globalScope.window

beforeAll(() => {
    globalScope.window = {
        setTimeout: (handler: () => void, timeout?: number): number =>
            self.setTimeout(handler, fireTimeoutsImmediately ? 0 : timeout),
        clearTimeout: (id?: number): void => self.clearTimeout(id)
    }
})

const settleAbandonedExecutions = (): Promise<void> =>
    new Promise<void>((resolve) => self.setTimeout(resolve, 80))

afterAll(async () => {
    // Abandoned executions keep running; let them finish touching the stub
    // before it is removed, or their late clearTimeout escapes this file.
    await settleAbandonedExecutions()
    globalScope.window = originalWindow
})

const createMockDataviewApi = (): DataviewApi =>
    ({
        pages: () => [],
        page: () => undefined,
        io: {
            load: () => Promise.resolve(''),
            csv: () => Promise.resolve(undefined),
            normalize: () => ''
        }
    }) as unknown as DataviewApi

describe('serializeDataviewJSQuery', () => {
    describe('normal execution', () => {
        it('should reject empty JavaScript code', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: '   ',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.success).toBe(false)
            expect(result.error?.message).toBe('Empty JavaScript code')
        })

        it('should capture rendering calls made through the guarded proxy', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: 'dv.list(["one", "two"])',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toContain('- one')
            expect(result.serializedContent).toContain('- two')
        })

        it('should support awaiting inside the executed code', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: 'await Promise.resolve(); dv.paragraph("done")',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toContain('done')
        })

        it('should report an error raised by the executed code', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: 'throw new Error("boom")',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.success).toBe(false)
            expect(result.error?.message).toBe('boom')
        })

        it('should still reach the real Dataview API through the guard', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: 'dv.paragraph(String(Array.isArray(dv.pages())))',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.success).toBe(true)
            expect(result.serializedContent).toContain('true')
        })
    })

    describe('timeout and abandonment', () => {
        beforeAll(() => {
            fireTimeoutsImmediately = true
        })

        afterAll(() => {
            fireTimeoutsImmediately = false
        })

        it('should fail with a timeout error when execution outlives the timeout', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: 'await new Promise((r) => setTimeout(r, 30)); dv.list(["late"])',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.success).toBe(false)
            expect(result.error?.message).toContain('timed out')

            await settleAbandonedExecutions()
        })

        it('should make the abandoned code throw on its next dv access', async () => {
            const probe: { accessed?: boolean; threw?: boolean; message?: string } = {}
            globalScope.__dvProbe = probe

            await serializeDataviewJSQuery({
                jsCode: `
                    const probe = globalThis.__dvProbe
                    await new Promise((r) => setTimeout(r, 30))
                    probe.accessed = true
                    try {
                        dv.list(["late"])
                        probe.threw = false
                    } catch (e) {
                        probe.threw = true
                        probe.message = String(e)
                    }
                `,
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            // Let the abandoned continuation run to completion
            await settleAbandonedExecutions()

            expect(probe.accessed).toBe(true)
            expect(probe.threw).toBe(true)
            expect(probe.message).toContain('timed out')

            delete globalScope.__dvProbe
        })

        it('should make a method captured before the timeout throw after it', async () => {
            const probe: { threw?: boolean; message?: string } = {}
            globalScope.__dvProbe = probe

            await serializeDataviewJSQuery({
                jsCode: `
                    const probe = globalThis.__dvProbe
                    const list = dv.list
                    await new Promise((r) => setTimeout(r, 30))
                    try {
                        list(["late"])
                        probe.threw = false
                    } catch (e) {
                        probe.threw = true
                        probe.message = String(e)
                    }
                `,
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            await settleAbandonedExecutions()

            expect(probe.threw).toBe(true)
            expect(probe.message).toContain('timed out')

            delete globalScope.__dvProbe
        })

        it('should make a nested object captured before the timeout throw after it', async () => {
            const probe: { threw?: boolean; message?: string } = {}
            globalScope.__dvProbe = probe

            await serializeDataviewJSQuery({
                jsCode: `
                    const probe = globalThis.__dvProbe
                    const io = dv.io
                    await new Promise((r) => setTimeout(r, 30))
                    try {
                        await io.load("some.md")
                        probe.threw = false
                    } catch (e) {
                        probe.threw = true
                        probe.message = String(e)
                    }
                `,
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            await settleAbandonedExecutions()

            expect(probe.threw).toBe(true)
            expect(probe.message).toContain('timed out')

            delete globalScope.__dvProbe
        })

        it('should not capture output produced after abandonment', async () => {
            const result = await serializeDataviewJSQuery({
                jsCode: 'await new Promise((r) => setTimeout(r, 30)); dv.list(["late"])',
                originFile: 'origin.md',
                dataviewApi: createMockDataviewApi()
            })

            expect(result.serializedContent).toBe('')

            await settleAbandonedExecutions()
        })
    })
})
