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
 * @param fn The async function to execute
 * @param timeoutMs The timeout in milliseconds
 * @returns The result of the function or throws on timeout
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`DataviewJS execution timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        fn()
            .then((result) => {
                clearTimeout(timeoutId)
                resolve(result)
            })
            .catch((error) => {
                clearTimeout(timeoutId)
                reject(error)
            })
    })
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
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

        // Create the function with 'dv' as the parameter
        // The code can reference 'dv' directly
        const executeCode = new AsyncFunction('dv', jsCode) as (
            dv: Record<string, unknown>
        ) => Promise<void>

        // Execute the code with timeout
        await withTimeout(async () => {
            await executeCode(dv)
        }, DATAVIEWJS_TIMEOUT_MS)

        // Get the captured markdown
        let serializedContent = getMarkdown()

        // Apply indentation if provided
        if (indentation && serializedContent) {
            const lines = serializedContent.split('\n')
            const indentedLines = lines.map((line) => {
                return indentation + line
            })
            serializedContent = indentedLines.join('\n')
        }

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
