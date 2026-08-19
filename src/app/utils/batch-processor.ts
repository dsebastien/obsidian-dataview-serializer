/**
 * Process items in parallel batches for improved performance.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param batchSize - Number of items to process concurrently (default: 5)
 * @param onProgress - Optional callback invoked after each batch with the number of
 *                     items processed so far and the total number of items
 * @returns Promise resolving to array of results in the same order as input items
 */
export async function processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize = 5,
    onProgress?: (processed: number, total: number) => void
): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(processor))
        results.push(...batchResults)
        onProgress?.(results.length, items.length)
    }
    return results
}
