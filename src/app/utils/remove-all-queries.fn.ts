import { replaceOutsideCode } from './code-ranges.fn'

/**
 * Result of removing all queries from a document.
 */
export interface RemoveAllQueriesResult {
    /** The text with all queries removed */
    newText: string
    /** The number of query definitions removed */
    removedCount: number
}

/**
 * Remove all Dataview serializer queries and their output from a document.
 *
 * Handles all three query types (block, inline, DataviewJS) across both
 * syntax variants (legacy and alternative). Result blocks are removed along
 * with their associated query definitions. Queries and result blocks inside
 * fenced code blocks or inline code are examples and are kept
 * (https://github.com/dsebastien/obsidian-dataview-serializer/issues/91).
 *
 * @param text The document text
 * @returns The cleaned text and the number of removed queries
 */
export function removeAllQueries(text: string): RemoveAllQueriesResult {
    let result = text
    let removedCount = 0
    // Code ranges move with every removal, so each pass recomputes them
    const remove = (regex: RegExp, counted: boolean): void => {
        result = replaceOutsideCode(result, regex, () => {
            if (counted) {
                removedCount++
            }
            return ''
        })
    }

    // --- Step 1: Remove block query result blocks ---
    // Must be done before query definitions to avoid result block markers
    // interfering with definition matching.

    // Legacy: <!-- SerializedQuery: <query> -->\n...\n<!-- SerializedQuery END -->[\n]
    remove(
        /[ \t]*(?:>[ \t]*)*<!-- SerializedQuery: [^\n]* -->(?:\n|$)[\s\S]*?<!-- SerializedQuery END -->(?:\n|$)/g,
        false
    )

    // Alt: <!-- dataview-serializer-result: <query> -->\n...\n<!-- dataview-serializer-result-end -->[\n]
    remove(
        /[ \t]*(?:>[ \t]*)*<!-- dataview-serializer-result: [^\n]* -->(?:\n|$)[\s\S]*?<!-- dataview-serializer-result-end -->(?:\n|$)/g,
        false
    )

    // --- Step 2: Remove block query definitions (count these) ---
    // Matches single-line and multi-line definitions for all 4 update modes.

    // Legacy: <!-- QueryToSerialize[Manual|Once|OnceAndEject]: ... -->
    remove(
        /^[ \t]*(?:>[ \t]*)*<!-- QueryToSerialize(?:Manual|Once(?:AndEject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        true
    )

    // Alt: <!-- dataview-serializer-query[-manual|-once|-once-and-eject]: ... -->
    remove(
        /^[ \t]*(?:>[ \t]*)*<!-- dataview-serializer-query(?:-manual|-once(?:-and-eject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        true
    )

    // --- Step 3: Remove inline queries (count these) ---

    // Legacy: <!-- IQ[Manual|Once|OnceAndEject]: =expr -->result<!-- /IQ -->
    remove(
        /<!-- IQ(?:Manual|Once(?:AndEject)?)?: =[^-]*(?:-(?!->)[^-]*)* -->[\s\S]*?<!-- \/IQ -->/g,
        true
    )

    // Alt: <!-- dataview-serializer-iq[-manual|-once|-once-and-eject]: =expr -->result<!-- /dataview-serializer-iq -->
    remove(
        /<!-- dataview-serializer-iq(?:-manual|-once(?:-and-eject)?)?: =[^-]*(?:-(?!->)[^-]*)* -->[\s\S]*?<!-- \/dataview-serializer-iq -->/g,
        true
    )

    // --- Step 4: Remove DataviewJS result blocks ---

    // Legacy: <!-- SerializedDataviewJS -->\n...\n<!-- SerializedDataviewJS END -->[\n]
    remove(
        /[ \t]*(?:>[ \t]*)*<!-- SerializedDataviewJS -->(?:\n|$)[\s\S]*?<!-- SerializedDataviewJS END -->(?:\n|$)/g,
        false
    )

    // Alt: <!-- dataview-serializer-js-result -->\n...\n<!-- dataview-serializer-js-result-end -->[\n]
    remove(
        /[ \t]*(?:>[ \t]*)*<!-- dataview-serializer-js-result -->(?:\n|$)[\s\S]*?<!-- dataview-serializer-js-result-end -->(?:\n|$)/g,
        false
    )

    // --- Step 5: Remove DataviewJS query definitions (count these) ---

    // Legacy: <!-- DataviewJSToSerialize[Manual|Once|OnceAndEject]: ... -->
    remove(
        /^[ \t]*(?:>[ \t]*)*<!-- DataviewJSToSerialize(?:Manual|Once(?:AndEject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        true
    )

    // Alt: <!-- dataview-serializer-js[-manual|-once|-once-and-eject]: ... -->
    remove(
        /^[ \t]*(?:>[ \t]*)*<!-- dataview-serializer-js(?:-manual|-once(?:-and-eject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        true
    )

    // --- Step 6: Clean up excess blank lines ---
    // Collapse 3+ consecutive newlines into 2 (one blank line)
    result = replaceOutsideCode(result, /\n{3,}/g, () => '\n\n')

    return { newText: result, removedCount }
}
