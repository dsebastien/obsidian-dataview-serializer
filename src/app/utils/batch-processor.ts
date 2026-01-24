/**
 * Process items in parallel batches for improved performance.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param batchSize - Number of items to process concurrently (default: 5)
 * @returns Promise resolving to array of results in the same order as input items
 */
export async function processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize = 5
): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(processor))
        results.push(...batchResults)
    }
    return results
}
