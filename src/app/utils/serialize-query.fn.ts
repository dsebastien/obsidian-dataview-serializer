/**
 * Serialize the given query to Markdown
 * @param query
 */
import type { DataviewApi } from 'obsidian-dataview/lib/api/plugin-api'
import { log } from '../../utils/log'
import { App, Notice } from 'obsidian'
import type { QuerySerializationResult } from '../types/query-result.intf'
import type { LinkFormat } from '../types/plugin-settings.intf'
import { isTaskQuery } from './is-task-query.fn'
import { applyIndentation } from './blockquote.fn'
import { buildVaultNameIndex, isNameUniqueInIndex } from './vault-name-index.fn'
import type { VaultNameIndex } from './vault-name-index.fn'

/**
 * Structural view of the undocumented `Vault.config` object. Obsidian does not
 * expose these fields in its public typings, so we declare only the two link
 * preferences we read here.
 */
interface VaultWithConfig {
    config?: {
        newLinkFormat?: string
        useMarkdownLinks?: boolean
    }
}

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
    /**
     * Provider for the vault file-name index, so that a single processing pass
     * can share one index across all of its queries. Called at most once, and
     * only when a link actually needs a uniqueness check — serializations that
     * never shorten a link (absolute link format, link-free results) therefore
     * never walk the vault. Defaults to indexing `params.app`'s vault.
     */
    getVaultNameIndex?: () => VaultNameIndex
}

export const serializeQuery = async (
    params: SerializeQueryParams
): Promise<QuerySerializationResult> => {
    // Resolve the effective link format and link syntax
    // When 'obsidian', read from Obsidian's vault configuration
    let effectiveLinkFormat: 'shortest' | 'absolute' = 'shortest'
    let useMarkdownLinks = false
    const configuredFormat = params.linkFormat ?? 'shortest'

    if (configuredFormat === 'obsidian') {
        // Read Obsidian's "New link format" setting from vault config.
        // `vault.config` is not exposed in Obsidian's public typings, so we
        // describe just the fields we read via a local structural type.
        const vaultConfig = (params.app.vault as VaultWithConfig).config
        const obsidianFormat = vaultConfig?.newLinkFormat

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
        useMarkdownLinks = vaultConfig?.useMarkdownLinks === true
    } else {
        effectiveLinkFormat = configuredFormat
    }

    // The vault file-name index is only consulted when links may be shortened.
    // Building it walks the whole vault, so it is shared when the caller supplies
    // one and otherwise built at most once per serialization, on first use.
    let vaultNameIndex: VaultNameIndex | undefined

    function getVaultNameIndex(): VaultNameIndex {
        vaultNameIndex ??= params.getVaultNameIndex
            ? params.getVaultNameIndex()
            : buildVaultNameIndex(params.app)
        return vaultNameIndex
    }

    // Check if the name is unique. If it is, we will be able to replace the long path with just the note name. Aids
    // readability.
    // When effectiveLinkFormat is 'absolute', always return false to keep full paths.
    function isNameUnique(name: string): boolean {
        if (effectiveLinkFormat === 'absolute') {
            return false
        }
        return isNameUniqueInIndex(getVaultNameIndex(), name)
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

    /**
     * Rewrite every wiki link in the output in a single pass.
     *
     * Replacing matches one at a time with `String.replace` re-scans the output
     * from index 0 and re-allocates it for every link, which is quadratic in the
     * number of links. Rebuilding from the match offsets is linear, and each
     * match is rewritten at its own position rather than at the first textually
     * identical one.
     *
     * @param input The serialized query output
     * @param regex The (global) link regex to apply
     * @param buildReplacement Produces the replacement for a single match
     * @returns The output with every link rewritten
     */
    function rewriteLinks(
        input: string,
        regex: RegExp,
        buildReplacement: (match: RegExpMatchArray) => string
    ): string {
        // Reset lastIndex for reuse of pre-compiled regex
        regex.lastIndex = 0
        const matches = [...input.matchAll(regex)]
        if (matches.length === 0) {
            return input
        }

        const segments: string[] = []
        let cursor = 0

        for (const match of matches) {
            const matchedText = match[0]
            const start = match.index
            if (start === undefined) {
                continue
            }
            segments.push(input.slice(cursor, start))
            segments.push(buildReplacement(match))
            cursor = start + matchedText.length
        }
        segments.push(input.slice(cursor))

        return segments.join('')
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

            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            serializedQuery = rewriteLinks(serializedQuery, TABLE_LINK_REGEX, (match) => {
                // Matched array
                // match[0]: Full matched string (e.g., [[folder/note.md\|alias]])
                // match[1]: Matched group 1 = filepath (without trailing backslash)
                // match[2]: Alias
                const filepath = match[1]!
                const name = getBasename(filepath)
                const alias = match[2]!

                if (!isNameUnique(name)) {
                    // Name is not unique, keep the full path
                    return formatLink(filepath, alias, true)
                }

                // The name is unique, so ok to replace the path
                if (!isValidAlias(name, alias)) {
                    // Name and alias match. Simplify to just the alias
                    // For wikilinks: [[alias]] (no extension)
                    // For markdown: [alias](name) (keep extension for valid link target)
                    return formatLink(useMarkdownLinks ? name : alias, undefined, true)
                }

                // Name and alias are different. Need to remove the path and keep the alias
                // For wikilinks: [[nameWithoutExt\|alias]] or [[name\|alias]]
                // For markdown: [alias](name)
                const linkTarget = useMarkdownLinks
                    ? name
                    : name.endsWith('.md')
                      ? getNameWithoutExtension(name)
                      : name
                return formatLink(linkTarget, alias, true)
            })
        } else {
            // Not a table. Assuming for now a list as that's all we're processing.
            // Returned links are delivered as the full path to the .md (or other filetype) file, aliased to the note name
            serializedQuery = rewriteLinks(serializedQuery, LIST_LINK_REGEX, (match) => {
                // Matched array
                // match[0]: Full matched string
                // match[1]: Matched group 1 = filepath
                // match[2]: Matched group 2 = alias
                const filepath = match[1]!
                const name = getBasename(filepath)
                const alias = match[2]!

                if (useMarkdownLinks) {
                    // Markdown link format: replace the entire wikilink
                    if (!isNameUnique(name)) {
                        return formatLink(filepath, alias, false)
                    }
                    return isValidAlias(name, alias)
                        ? formatLink(name, alias, false)
                        : formatLink(name, undefined, false)
                }

                // Wikilink format: modify the path within the existing brackets
                if (!isNameUnique(name)) {
                    // Name is not unique, keep the link untouched
                    return match[0]
                }

                if (!isValidAlias(name, alias)) {
                    // Name and alias match. Can replace the lot and leave what is the alias as the link
                    return formatLink(alias, undefined, false)
                }

                // Name and alias are different. Need to remove the path and keep the alias.
                // For .md we can keep just the note name without extension; other file
                // types need to keep the full filename.
                return formatLink(
                    name.endsWith('.md') ? getNameWithoutExtension(name) : name,
                    alias,
                    false
                )
            })
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

    // Apply indentation if provided.
    // Inside a blockquote/callout this also keeps otherwise-empty lines quoted.
    serializedQuery = applyIndentation(serializedQuery, params.indentation ?? '')

    return {
        success: true,
        serializedContent: serializedQuery
    }
}
