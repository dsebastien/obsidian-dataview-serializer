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
 * Pre-compiled regex for wiki links in table cells.
 * Dataview escapes pipes as \| within wiki links in tables.
 * Captures: [[path\|alias]] or [[path|alias]]
 *
 * WARNING: Uses global flag. Safe with matchAll() which creates internal iterator.
 */
const TABLE_LINK_REGEX = /\[\[(.+?)\\?\|(.+?)\]\]/g

/**
 * Pre-compiled regex for wiki links in list output.
 * Captures: [[path|alias]]
 *
 * WARNING: Uses global flag. Safe with matchAll() which creates internal iterator.
 */
const LIST_LINK_REGEX = /\[\[(.+?)\|(.+?)\]\]/g

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

    // Resolve the effective link format and link syntax
    // When 'obsidian', read from Obsidian's vault configuration
    let effectiveLinkFormat: 'shortest' | 'absolute' = 'shortest'
    let useMarkdownLinks = false
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

        // Check Obsidian's "Use [[Wikilinks]]" setting (inverse of useMarkdownLinks)
        // When useMarkdownLinks is true, output [display](path) instead of [[path|display]]
        useMarkdownLinks = (vaultConfig?.useMarkdownLinks as boolean) === true
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

    /**
     * Format a link as either a wikilink or a standard markdown link.
     * @param linkPath The target path (may be simplified or full)
     * @param display Optional display text (omit for simple links where display matches path stem)
     * @param isTable Whether the link is inside a table cell (wikilinks need escaped pipes)
     */
    function formatLink(linkPath: string, display: string | undefined, isTable: boolean): string {
        if (useMarkdownLinks) {
            const displayText = display ?? getNameWithoutExtension(linkPath)
            return `[${displayText}](${linkPath})`
        }
        // Wikilink format
        if (display) {
            const separator = isTable ? '\\|' : '|'
            return `[[${linkPath}${separator}${display}]]`
        }
        return `[[${linkPath}]]`
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

            // Reset lastIndex for reuse of pre-compiled regex
            TABLE_LINK_REGEX.lastIndex = 0

            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            const matchedLinks = [...serializedQuery.matchAll(TABLE_LINK_REGEX)]
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
                        // Name and alias match. Simplify to just the alias
                        // For wikilinks: [[alias]] (no extension)
                        // For markdown: [alias](name) (keep extension for valid link target)
                        const linkTarget = useMarkdownLinks ? name : alias
                        serializedQuery = serializedQuery.replace(
                            match[0],
                            formatLink(linkTarget, undefined, true)
                        )
                    } else {
                        // Name and alias are different. Need to remove the path and keep the alias
                        // For wikilinks: [[nameWithoutExt\|alias]] or [[name\|alias]]
                        // For markdown: [alias](name)
                        const linkTarget = useMarkdownLinks
                            ? name
                            : name.endsWith('.md')
                              ? getNameWithoutExtension(name)
                              : name
                        serializedQuery = serializedQuery.replace(
                            match[0],
                            formatLink(linkTarget, alias, true)
                        )
                    }
                } else {
                    // Name is not unique, keep the full path
                    serializedQuery = serializedQuery.replace(
                        match[0],
                        formatLink(filepath, alias, true)
                    )
                }
            }
        } else {
            // Not a table. Assuming for now a list as that's all we're processing.
            // Reset lastIndex for reuse of pre-compiled regex
            LIST_LINK_REGEX.lastIndex = 0

            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            const matchedLinks = [...serializedQuery.matchAll(LIST_LINK_REGEX)]
            for (const match of matchedLinks) {
                // Matched array
                // match[0]: Full matched string
                // match[1]: Matched group 1 = filepath
                // match[2]: Matched group 2 = alias
                const filepath = match[1]!
                const name = getBasename(filepath)
                const alias = match[2]!
                if (useMarkdownLinks) {
                    // Markdown link format: replace the entire wikilink
                    if (isNameUnique(name)) {
                        if (!isValidAlias(name, alias)) {
                            serializedQuery = serializedQuery.replace(
                                match[0],
                                formatLink(name, undefined, false)
                            )
                        } else {
                            serializedQuery = serializedQuery.replace(
                                match[0],
                                formatLink(name, alias, false)
                            )
                        }
                    } else {
                        serializedQuery = serializedQuery.replace(
                            match[0],
                            formatLink(filepath, alias, false)
                        )
                    }
                } else if (isNameUnique(name)) {
                    // Wikilink format: modify path within existing brackets
                    if (!isValidAlias(name, alias)) {
                        // Name and alias match. Can replace the lot and leave what is the alias as the link
                        serializedQuery = serializedQuery.replace(filepath + '|', '')
                    } else {
                        // Name and alias are different. Need to remove the path and keep the alias
                        if (name.endsWith('.md')) {
                            // For .md we can keep just the note name without extension
                            serializedQuery = serializedQuery.replace(
                                filepath + '|',
                                getNameWithoutExtension(name) + '|'
                            )
                        } else {
                            // File types not .md need to keep full filename
                            serializedQuery = serializedQuery.replace(filepath + '|', name + '|')
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
