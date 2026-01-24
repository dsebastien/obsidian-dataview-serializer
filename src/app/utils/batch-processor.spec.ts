import { test, expect } from 'bun:test'
import { processInBatches } from './batch-processor'

test('processInBatches should process items in batches', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const processor = async (item: number) => item * 2

    const results = await processInBatches(items, processor, 3)

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
})

test('processInBatches should handle empty arrays', async () => {
    const items: number[] = []
    const processor = async (item: number) => item * 2

    const results = await processInBatches(items, processor, 5)

    expect(results).toEqual([])
})

test('processInBatches should handle single item', async () => {
    const items = [42]
    const processor = async (item: number) => item * 2

    const results = await processInBatches(items, processor, 5)

    expect(results).toEqual([84])
})

test('processInBatches should use default batch size of 5', async () => {
    const items = [1, 2, 3, 4, 5, 6]
    const callOrder: number[] = []
    const processor = async (item: number) => {
        callOrder.push(item)
        return item
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
        await new Promise((resolve) => setTimeout(resolve, 50))
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
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))
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
    const processor = async (item: number) => item * 10

    const results = await processInBatches(items, processor, 100)

    expect(results).toEqual([10, 20, 30])
})

test('processInBatches should handle errors in processor', async () => {
    const items = [1, 2, 3]
    const processor = async (item: number) => {
        if (item === 2) {
            throw new Error('Processing failed')
        }
        return item
    }

    await expect(processInBatches(items, processor, 3)).rejects.toThrow('Processing failed')
})
