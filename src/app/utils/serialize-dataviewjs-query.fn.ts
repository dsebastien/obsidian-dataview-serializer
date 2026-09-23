/**
 * Serialize DataviewJS queries to markdown.
 *
 * This function executes JavaScript code in a sandboxed context with a proxy `dv` object
 * that captures rendering calls and converts them to markdown.
 *
 * Supports async/await in the JavaScript code.
 */

import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import { createDataviewJSProxy } from './dataviewjs-proxy'
import { log } from '../../utils/log'
import { DATAVIEWJS_TIMEOUT_MS } from '../constants'
import { applyIndentation } from './blockquote.fn'

/**
 * Result of serializing a DataviewJS query
 */
export interface DataviewJSSerializationResult {
    /** Whether the serialization was successful */
    success: boolean
    /** The serialized markdown content (empty string on failure) */
    serializedContent: string
    /** Error information if serialization failed */
    error?: {
        message: string
        jsCode: string
    }
}

/**
 * Parameters for serializing a DataviewJS query
 */
interface SerializeDataviewJSParams {
    /** The JavaScript code to execute */
    jsCode: string
    /** The file path where this query is located */
    originFile: string
    /** The Dataview API instance */
    dataviewApi: DataviewApi
    /** Indentation to apply to the output */
    indentation?: string
}

/**
 * Execute JavaScript code with a timeout.
 *
 * The timeout bounds how long the caller waits, not how long the user's code
 * runs: JavaScript cannot pre-empt code executing on its own thread. Timing out
 * therefore also signals `onTimeout`, so the caller can make the abandoned
 * execution fail the next time it touches anything the caller controls.
 *
 * @param fn The async function to execute
 * @param timeoutMs The timeout in milliseconds
 * @param onTimeout Invoked when the timeout fires, before the promise rejects
 * @returns The result of the function or throws on timeout
 */
async function withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    onTimeout?: () => void
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            onTimeout?.()
            reject(new Error(`DataviewJS execution timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        fn()
            .then((result) => {
                window.clearTimeout(timeoutId)
                resolve(result)
            })
            .catch((error: unknown) => {
                window.clearTimeout(timeoutId)
                reject(error instanceof Error ? error : new Error(String(error)))
            })
    })
}

/**
 * Wrap the `dv` proxy so that it stops answering once execution is abandoned.
 *
 * After a timeout the user's code keeps running — nothing can stop it — but
 * every DataviewJS query exists to call `dv`, so failing the next such call
 * unwinds the vast majority of runaway loops instead of letting them spin (and
 * keep appending to the captured output) for the rest of the session.
 *
 * The guard is recursive: methods and nested objects handed out through `dv`
 * (a captured `dv.list`, a stashed `dv.io`) are wrapped too, so references
 * taken before the timeout also fail after it — not just fresh `dv` accesses.
 * Methods are invoked on the unwrapped object, so built-ins with internal
 * slots (promises returned by `dv.io.load`, arrays from `dv.pages`) keep
 * working. Wrapper functions are created per property access, so comparing
 * two reads of the same method for identity is not supported — user snippets
 * do not do that.
 *
 * A loop that never touches anything reached through `dv` still cannot be
 * interrupted; that would need a worker, which cannot reach the Dataview API.
 *
 * @param dv The proxy to guard
 * @param isAbandoned Tells whether execution has been abandoned
 * @param timeoutMs The timeout, for the error message
 * @returns The guarded proxy
 */
function guardAgainstAbandonedExecution(
    dv: Record<string, unknown>,
    isAbandoned: () => boolean,
    timeoutMs: number
): Record<string, unknown> {
    const wrappedObjects = new WeakMap<object, unknown>()

    function failIfAbandoned(): void {
        if (isAbandoned()) {
            throw new Error(`DataviewJS execution timed out after ${timeoutMs}ms`)
        }
    }

    function guardValue(value: unknown, thisTarget: object | null): unknown {
        if (typeof value === 'function') {
            const fn = value as (...args: unknown[]) => unknown
            return (...args: unknown[]): unknown => {
                failIfAbandoned()
                return guardValue(Reflect.apply(fn, thisTarget, args), null)
            }
        }
        if (typeof value === 'object' && value !== null) {
            return guardObject(value)
        }
        return value
    }

    function guardObject(obj: object): unknown {
        const existing = wrappedObjects.get(obj)
        if (existing) {
            return existing
        }
        const proxy = new Proxy(obj, {
            get(target, property): unknown {
                failIfAbandoned()
                return guardValue(Reflect.get(target, property, target), target)
            }
        })
        wrappedObjects.set(obj, proxy)
        return proxy
    }

    return guardObject(dv) as Record<string, unknown>
}

/**
 * Serialize a DataviewJS query to markdown.
 *
 * Executes the JavaScript code with a proxy `dv` object that captures rendering calls
 * and converts them to markdown.
 *
 * @param params Parameters for serialization
 * @returns Result containing the serialized content or error information
 */
export async function serializeDataviewJSQuery(
    params: SerializeDataviewJSParams
): Promise<DataviewJSSerializationResult> {
    const { jsCode, originFile, dataviewApi, indentation } = params

    if (!jsCode || !jsCode.trim()) {
        return {
            success: false,
            serializedContent: '',
            error: {
                message: 'Empty JavaScript code',
                jsCode
            }
        }
    }

    try {
        // Create the proxy dv object
        const { proxy: dv, getMarkdown } = createDataviewJSProxy(dataviewApi, originFile)

        // Create an async function from the JavaScript code
        // This allows the code to use await for async operations like dv.io.load()
        const AsyncFunction = (
            Object.getPrototypeOf(async function () {}) as {
                constructor: new (
                    ...parameterNamesThenBody: string[]
                ) => (dv: Record<string, unknown>) => Promise<void>
            }
        ).constructor

        // Create the function with 'dv' as the parameter
        // The code can reference 'dv' directly
        const executeCode = new AsyncFunction('dv', jsCode)

        // Execute the code with timeout. Once the timeout fires the execution is
        // abandoned, and the guarded proxy makes its next `dv` access throw.
        let abandoned = false
        const guardedDv = guardAgainstAbandonedExecution(dv, () => abandoned, DATAVIEWJS_TIMEOUT_MS)

        await withTimeout(
            async () => {
                await executeCode(guardedDv)
            },
            DATAVIEWJS_TIMEOUT_MS,
            () => {
                abandoned = true
            }
        )

        // Get the captured markdown
        let serializedContent = getMarkdown()

        // Apply indentation if provided.
        // Inside a blockquote/callout this also keeps otherwise-empty lines quoted.
        serializedContent = applyIndentation(serializedContent, indentation ?? '')

        return {
            success: true,
            serializedContent
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        log(`Failed to execute DataviewJS in file: ${originFile}`, 'warn', err)

        return {
            success: false,
            serializedContent: '',
            error: {
                message: errorMessage,
                jsCode
            }
        }
    }
}
