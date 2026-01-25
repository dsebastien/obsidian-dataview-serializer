/**
 * Serialize the given query to Markdown
 * @param query
 */
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import { log } from '../../utils/log'
import { App, Notice, TFile } from 'obsidian'
import type { QuerySerializationResult } from '../types/query-result.intf'
import type { LinkFormat } from '../types/plugin-settings.intf'
import { isTaskQuery } from './is-task-query.fn'

/**
 * Get the filename from a file path (browser-compatible replacement for path.basename)
 * @param filePath The full file path
 * @returns The filename (last segment of the path)
 */
function getBasename(filePath: string): string {
    return filePath.split('/').pop() ?? filePath
}

/**
 * Get the filename without extension (browser-compatible replacement for path.parse().name)
 * @param filename The filename (with or without extension)
 * @returns The filename without its extension
 */
function getNameWithoutExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex <= 0) {
        return filename
    }
    return filename.substring(0, lastDotIndex)
}

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
        return getNameWithoutExtension(name) !== alias
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

            // Set up to match wiki links in table cells
            // Dataview escapes pipes as \| within wiki links in tables
            // The regex captures: [[path\|alias]] or [[path|alias]]
            // Using \\? to handle the optional backslash before the pipe (not captured in group 1)
            const linkExp = new RegExp(/\[\[(.+?)\\?\|(.+?)\]\]/g)

            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            const matchedLinks = [...serializedQuery.matchAll(linkExp)]
            for (const match of matchedLinks) {
                // Matched array
                // match[0]: Full matched string (e.g., [[folder/note.md\|alias]])
                // match[1]: Matched group 1 = filepath (without trailing backslash)
                // match[2]: Alias
                const filepath = match[1]!
                const name = getBasename(filepath)
                const alias = match[2]!
                if (isNameUnique(name)) {
                    // The name is unique, so ok to replace the path
                    if (!isValidAlias(name, alias)) {
                        // Name and alias match. Simplify to just [[alias]]
                        serializedQuery = serializedQuery.replace(match[0], '[[' + alias + ']]')
                    } else {
                        // Name and alias are different. Need to remove the path and keep the alias
                        if (name.endsWith('.md')) {
                            // For .md we can keep just the note name without extension
                            serializedQuery = serializedQuery.replace(
                                match[0],
                                '[[' + getNameWithoutExtension(name) + '\\|' + alias + ']]'
                            )
                        } else {
                            // File types not .md need to keep full filename
                            serializedQuery = serializedQuery.replace(
                                match[0],
                                '[[' + name + '\\|' + alias + ']]'
                            )
                        }
                    }
                } else {
                    // Name is not unique, keep the full path (with escaped pipe for table)
                    serializedQuery = serializedQuery.replace(
                        match[0],
                        '[[' + filepath + '\\|' + alias + ']]'
                    )
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
                const name = getBasename(match[1]!)
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
                                getNameWithoutExtension(name) + '|'
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
        log(`Failed to serialize query in file: ${params.originFile}`, 'warn', err)
        new Notice(`Dataview Serializer: Invalid query found in ${params.originFile}`)
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
