import { describe, expect, it } from 'bun:test'
import { onlyUniqueArray } from './only-unique-array.fn'

describe('onlyUniqueArray', () => {
    it('should return true for first occurrence of a value', () => {
        const arr = [1, 2, 3, 1, 2]
        expect(onlyUniqueArray(1, 0, arr)).toBe(true)
        expect(onlyUniqueArray(2, 1, arr)).toBe(true)
        expect(onlyUniqueArray(3, 2, arr)).toBe(true)
    })

    it('should return false for duplicate values', () => {
        const arr = [1, 2, 3, 1, 2]
        expect(onlyUniqueArray(1, 3, arr)).toBe(false)
        expect(onlyUniqueArray(2, 4, arr)).toBe(false)
    })

    it('should work with strings', () => {
        const arr = ['a', 'b', 'a', 'c', 'b']
        expect(onlyUniqueArray('a', 0, arr)).toBe(true)
        expect(onlyUniqueArray('a', 2, arr)).toBe(false)
        expect(onlyUniqueArray('b', 1, arr)).toBe(true)
        expect(onlyUniqueArray('b', 4, arr)).toBe(false)
        expect(onlyUniqueArray('c', 3, arr)).toBe(true)
    })

    it('should work as a filter callback to remove duplicates', () => {
        const arrWithDuplicates = [1, 2, 3, 1, 2, 4, 3, 5]
        const uniqueArr = arrWithDuplicates.filter(onlyUniqueArray)
        expect(uniqueArr).toEqual([1, 2, 3, 4, 5])
    })

    it('should work with string arrays as a filter callback', () => {
        const arrWithDuplicates = ['apple', 'banana', 'apple', 'cherry', 'banana']
        const uniqueArr = arrWithDuplicates.filter(onlyUniqueArray)
        expect(uniqueArr).toEqual(['apple', 'banana', 'cherry'])
    })

    it('should handle empty array', () => {
        const arr: number[] = []
        const uniqueArr = arr.filter(onlyUniqueArray)
        expect(uniqueArr).toEqual([])
    })

    it('should handle array with no duplicates', () => {
        const arr = [1, 2, 3, 4, 5]
        const uniqueArr = arr.filter(onlyUniqueArray)
        expect(uniqueArr).toEqual([1, 2, 3, 4, 5])
    })

    it('should handle array with all same values', () => {
        const arr = [1, 1, 1, 1]
        const uniqueArr = arr.filter(onlyUniqueArray)
        expect(uniqueArr).toEqual([1])
    })

    it('should work with objects (reference equality)', () => {
        const obj1 = { id: 1 }
        const obj2 = { id: 2 }
        const arr = [obj1, obj2, obj1, obj2]
        const uniqueArr = arr.filter(onlyUniqueArray)
        expect(uniqueArr).toEqual([obj1, obj2])
    })
})
