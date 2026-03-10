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
 * with their associated query definitions.
 *
 * @param text The document text
 * @returns The cleaned text and the number of removed queries
 */
export function removeAllQueries(text: string): RemoveAllQueriesResult {
    let result = text
    let removedCount = 0

    // --- Step 1: Remove block query result blocks ---
    // Must be done before query definitions to avoid result block markers
    // interfering with definition matching.

    // Legacy: <!-- SerializedQuery: <query> -->\n...\n<!-- SerializedQuery END -->[\n]
    result = result.replace(
        /[ \t]*<!-- SerializedQuery: [^\n]* -->(?:\n|$)[\s\S]*?<!-- SerializedQuery END -->(?:\n|$)/g,
        ''
    )

    // Alt: <!-- dataview-serializer-result: <query> -->\n...\n<!-- dataview-serializer-result-end -->[\n]
    result = result.replace(
        /[ \t]*<!-- dataview-serializer-result: [^\n]* -->(?:\n|$)[\s\S]*?<!-- dataview-serializer-result-end -->(?:\n|$)/g,
        ''
    )

    // --- Step 2: Remove block query definitions (count these) ---
    // Matches single-line and multi-line definitions for all 4 update modes.

    // Legacy: <!-- QueryToSerialize[Manual|Once|OnceAndEject]: ... -->
    result = result.replace(
        /^[ \t]*<!-- QueryToSerialize(?:Manual|Once(?:AndEject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        () => {
            removedCount++
            return ''
        }
    )

    // Alt: <!-- dataview-serializer-query[-manual|-once|-once-and-eject]: ... -->
    result = result.replace(
        /^[ \t]*<!-- dataview-serializer-query(?:-manual|-once(?:-and-eject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        () => {
            removedCount++
            return ''
        }
    )

    // --- Step 3: Remove inline queries (count these) ---

    // Legacy: <!-- IQ[Manual|Once|OnceAndEject]: =expr -->result<!-- /IQ -->
    result = result.replace(
        /<!-- IQ(?:Manual|Once(?:AndEject)?)?: =[^-]*(?:-(?!->)[^-]*)* -->[\s\S]*?<!-- \/IQ -->/g,
        () => {
            removedCount++
            return ''
        }
    )

    // Alt: <!-- dataview-serializer-iq[-manual|-once|-once-and-eject]: =expr -->result<!-- /dataview-serializer-iq -->
    result = result.replace(
        /<!-- dataview-serializer-iq(?:-manual|-once(?:-and-eject)?)?: =[^-]*(?:-(?!->)[^-]*)* -->[\s\S]*?<!-- \/dataview-serializer-iq -->/g,
        () => {
            removedCount++
            return ''
        }
    )

    // --- Step 4: Remove DataviewJS result blocks ---

    // Legacy: <!-- SerializedDataviewJS -->\n...\n<!-- SerializedDataviewJS END -->[\n]
    result = result.replace(
        /[ \t]*<!-- SerializedDataviewJS -->(?:\n|$)[\s\S]*?<!-- SerializedDataviewJS END -->(?:\n|$)/g,
        ''
    )

    // Alt: <!-- dataview-serializer-js-result -->\n...\n<!-- dataview-serializer-js-result-end -->[\n]
    result = result.replace(
        /[ \t]*<!-- dataview-serializer-js-result -->(?:\n|$)[\s\S]*?<!-- dataview-serializer-js-result-end -->(?:\n|$)/g,
        ''
    )

    // --- Step 5: Remove DataviewJS query definitions (count these) ---

    // Legacy: <!-- DataviewJSToSerialize[Manual|Once|OnceAndEject]: ... -->
    result = result.replace(
        /^[ \t]*<!-- DataviewJSToSerialize(?:Manual|Once(?:AndEject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        () => {
            removedCount++
            return ''
        }
    )

    // Alt: <!-- dataview-serializer-js[-manual|-once|-once-and-eject]: ... -->
    result = result.replace(
        /^[ \t]*<!-- dataview-serializer-js(?:-manual|-once(?:-and-eject)?)?:[\s\S]*?-->(?:\n|$)/gm,
        () => {
            removedCount++
            return ''
        }
    )

    // --- Step 6: Clean up excess blank lines ---
    // Collapse 3+ consecutive newlines into 2 (one blank line)
    result = result.replace(/\n{3,}/g, '\n\n')

    return { newText: result, removedCount }
}
