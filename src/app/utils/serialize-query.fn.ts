/**
 * Serialize the given query to Markdown
 * @param query
 */
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import { log } from '../../utils/log'
import { App, TFile } from 'obsidian'
import path from 'path'
import type { QuerySerializationResult } from '../types/query-result.intf'
import type { LinkFormat } from '../types/plugin-settings.intf'
import { isTaskQuery } from './is-task-query.fn'

/**
 * Strip checkbox markers from task output to convert tasks to regular list items.
 * This prevents feedback loops where serialized tasks would be picked up by subsequent TASK queries.
 *
 * Converts:
 * - `- [ ] Task text` to `- Task text`
 * - `- [x] Completed task` to `- Completed task`
 * - Handles various checkbox states like [/], [-], [>], etc.
 *
 * Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/19
 *
 * @param taskOutput The raw markdown output from a TASK query
 * @returns Output with checkbox markers removed, converting tasks to regular list items
 */
function stripTaskCheckboxes(taskOutput: string): string {
    if (!taskOutput) {
        return taskOutput
    }

    // Match task checkbox patterns: - [ ], - [x], - [X], - [/], - [-], - [>], etc.
    // The pattern matches:
    // - Optional leading whitespace
    // - A dash followed by space
    // - A checkbox in brackets [.] where . is any single character
    // - A space after the checkbox
    // We replace the checkbox part while preserving the list marker
    return taskOutput.replace(/^(\s*-\s*)\[.\]\s*/gm, '$1')
}

interface SerializeQueryParams {
    query: string
    originFile: string
    dataviewApi: DataviewApi
    app: App
    indentation?: string
    /**
     * Format for internal links in output.
     * - 'shortest': Simplify links when filename is unique (default)
     * - 'absolute': Always use full path for consistency across devices
     */
    linkFormat?: LinkFormat
}

export const serializeQuery = async (
    params: SerializeQueryParams
): Promise<QuerySerializationResult> => {
    const allVaultFiles = params.app.vault.getFiles()

    // Resolve the effective link format
    // When 'obsidian', read from Obsidian's vault configuration
    let effectiveLinkFormat: 'shortest' | 'absolute' = 'shortest'
    const configuredFormat = params.linkFormat ?? 'shortest'

    if (configuredFormat === 'obsidian') {
        // Read Obsidian's "New link format" setting from vault config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vaultConfig = (params.app.vault as any).config
        const obsidianFormat = vaultConfig?.newLinkFormat as string | undefined

        // Map Obsidian's settings to our format:
        // - 'shortest' -> 'shortest'
        // - 'relative' -> 'absolute' (relative paths also preserve full structure)
        // - 'absolute' -> 'absolute'
        if (obsidianFormat === 'relative' || obsidianFormat === 'absolute') {
            effectiveLinkFormat = 'absolute'
        } else {
            effectiveLinkFormat = 'shortest'
        }
    } else {
        effectiveLinkFormat = configuredFormat
    }

    // Check if the name is unique. If it is, we will be able to replace the long path with just the note name. Aids
    // readability.
    // When effectiveLinkFormat is 'absolute', always return false to keep full paths.
    function isNameUnique(name: string): boolean {
        if (effectiveLinkFormat === 'absolute') {
            return false
        }
        const occurrences = allVaultFiles.filter((x: TFile) => x.name == name)
        return occurrences.length <= 1
    }

    // Determine if the note name and alias are different
    function isValidAlias(name: string, alias: string): boolean {
        return path.parse(name).name !== alias
    }

    let serializedQuery = ''
    try {
        serializedQuery = await params.dataviewApi.tryQueryMarkdown(params.query, params.originFile)
        // Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/3

        // For TASK queries, strip checkbox markers to convert tasks to regular list items.
        // This prevents feedback loops where serialized tasks would be picked up by subsequent queries.
        // Reference: https://github.com/dsebastien/obsidian-dataview-serializer/issues/19
        if (isTaskQuery(params.query)) {
            serializedQuery = stripTaskCheckboxes(serializedQuery)
        }

        if (params.query.toLocaleLowerCase().contains('table')) {
            serializedQuery = serializedQuery.replaceAll('\\\\', '\\').replaceAll('\n<', '<')

            // Set up to match the pattern
            // [[path to note\|alias]] - we are only interested in the path and \| that follow it
            const linkExp = new RegExp(/\[\[(.+?)\|(.+?)\]\]/g)

            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            const matchedLinks = [...serializedQuery.matchAll(linkExp)]
            for (const match of matchedLinks) {
                // Matched array
                // mathc[0]: Full matched string
                // match{1]: Matched group 1 = filepath
                // match[2]: Alias
                const name = path.basename(match[1]!)
                const alias = match[2]!
                if (isNameUnique(name)) {
                    // The name is unique, so ok to replace the path
                    if (!isValidAlias(name, alias)) {
                        // Name and alias match. Can replace the lot and leave what is the alias as the link
                        serializedQuery = serializedQuery.replace(match[1] + '\\|', '')
                    } else {
                        // Name and alias are different. Need to remove the path and keep the alias
                        if (name.endsWith('.md')) {
                            // For .md we can keep just the note name without extension
                            serializedQuery = serializedQuery.replace(
                                match[1] + '\\|',
                                path.parse(name).name + '|'
                            )
                        } else {
                            // File types not .md need to keep full filename
                            serializedQuery = serializedQuery.replace(match[1] + '\\|', name + '|')
                        }
                    }
                } else {
                    // Name is not unique, keep the full path but remove the backslash from the pipe
                    serializedQuery = serializedQuery.replace(match[1] + '\\|', match[1] + '|')
                }
            }
        } else {
            // Not a table. Assuming for now a list as that's all we're processing.
            // Set up to match the pattern
            // [[path to note|alias]] - we capture both path and alias
            const linkExp = new RegExp(/\[\[(.+?)\|(.+?)\]\]/g)

            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            const matchedLinks = [...serializedQuery.matchAll(linkExp)]
            for (const match of matchedLinks) {
                // Matched array
                // match[0]: Full matched string
                // match[1]: Matched group 1 = filepath
                // match[2]: Matched group 2 = alias
                const name = path.basename(match[1]!)
                const alias = match[2]!
                if (isNameUnique(name)) {
                    // The name is unique, so ok to replace the path
                    if (!isValidAlias(name, alias)) {
                        // Name and alias match. Can replace the lot and leave what is the alias as the link
                        serializedQuery = serializedQuery.replace(match[1] + '|', '')
                    } else {
                        // Name and alias are different. Need to remove the path and keep the alias
                        if (name.endsWith('.md')) {
                            // For .md we can keep just the note name without extension
                            serializedQuery = serializedQuery.replace(
                                match[1] + '|',
                                path.parse(name).name + '|'
                            )
                        } else {
                            // File types not .md need to keep full filename
                            serializedQuery = serializedQuery.replace(match[1] + '|', name + '|')
                        }
                    }
                }
            }
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        log('Failed to serialize query', 'warn', err)
        return {
            success: false,
            serializedContent: '',
            error: {
                message: errorMessage,
                query: params.query
            }
        }
    }

    // Apply indentation if provided
    if (params.indentation && serializedQuery) {
        const lines = serializedQuery.split('\n')
        const indentedLines = lines.map((line) => {
            return params.indentation + line
        })
        serializedQuery = indentedLines.join('\n')
    }

    return {
        success: true,
        serializedContent: serializedQuery
    }
}
