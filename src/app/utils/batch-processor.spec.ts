import { test, expect } from 'bun:test'
import { processInBatches } from './batch-processor'

/**
 * Awaited rejection assertion.
 *
 * `expect(p).rejects.toThrow()` types as void here, so awaiting it trips
 * `await-thenable` while not awaiting it lets a passing-by-accident test
 * through. Catching the error directly is both typed and actually awaited.
 */
async function expectRejection(promise: Promise<unknown>, contains: string): Promise<void> {
    let caught: unknown
    await promise.catch((error: unknown) => {
        caught = error
    })
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain(contains)
}

test('processInBatches should process items in batches', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const processor = (item: number) => Promise.resolve(item * 2)

    const results = await processInBatches(items, processor, 3)

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
})

test('processInBatches should handle empty arrays', async () => {
    const items: number[] = []
    const processor = (item: number) => Promise.resolve(item * 2)

    const results = await processInBatches(items, processor, 5)

    expect(results).toEqual([])
})

test('processInBatches should handle single item', async () => {
    const items = [42]
    const processor = (item: number) => Promise.resolve(item * 2)

    const results = await processInBatches(items, processor, 5)

    expect(results).toEqual([84])
})

test('processInBatches should use default batch size of 5', async () => {
    const items = [1, 2, 3, 4, 5, 6]
    const callOrder: number[] = []
    const processor = (item: number) => {
        callOrder.push(item)
        return Promise.resolve(item)
    }

    const results = await processInBatches(items, processor)

    expect(results).toEqual([1, 2, 3, 4, 5, 6])
    expect(callOrder).toEqual([1, 2, 3, 4, 5, 6])
})

test('processInBatches should process items concurrently within a batch', async () => {
    const items = ['a', 'b', 'c']
    const startTimes: number[] = []

    const processor = async (item: string) => {
        startTimes.push(Date.now())
        await new Promise<void>((resolve) => self.setTimeout(resolve, 50))
        return item.toUpperCase()
    }

    const results = await processInBatches(items, processor, 3)

    expect(results).toEqual(['A', 'B', 'C'])

    // All items in the same batch should start at roughly the same time (within 10ms)
    const maxDiff = Math.max(...startTimes) - Math.min(...startTimes)
    expect(maxDiff).toBeLessThan(20)
})

test('processInBatches should preserve order across batches', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // Simulate varying processing times
    const processor = async (item: number) => {
        await new Promise<void>((resolve) => self.setTimeout(resolve, Math.random() * 10))
        return `item-${item}`
    }

    const results = await processInBatches(items, processor, 3)

    expect(results).toEqual([
        'item-1',
        'item-2',
        'item-3',
        'item-4',
        'item-5',
        'item-6',
        'item-7',
        'item-8',
        'item-9',
        'item-10'
    ])
})

test('processInBatches should handle batch size larger than array length', async () => {
    const items = [1, 2, 3]
    const processor = (item: number) => Promise.resolve(item * 10)

    const results = await processInBatches(items, processor, 100)

    expect(results).toEqual([10, 20, 30])
})

test('processInBatches should handle errors in processor', async () => {
    const items = [1, 2, 3]
    const processor = (item: number) => {
        if (item === 2) {
            return Promise.reject(new Error('Processing failed'))
        }
        return Promise.resolve(item)
    }

    await expectRejection(processInBatches(items, processor, 3), 'Processing failed')
})

test('processInBatches should report progress after each batch', async () => {
    const items = [1, 2, 3, 4, 5]
    const processor = (item: number) => Promise.resolve(item)
    const progress: Array<[number, number]> = []

    await processInBatches(items, processor, 2, (processed, total) => {
        progress.push([processed, total])
    })

    expect(progress).toEqual([
        [2, 5],
        [4, 5],
        [5, 5]
    ])
})

test('processInBatches should not report progress for an empty array', async () => {
    const processor = (item: number) => Promise.resolve(item)
    let calls = 0

    await processInBatches([] as number[], processor, 2, () => {
        calls++
    })

    expect(calls).toBe(0)
})
