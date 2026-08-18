import { describe, expect, it, mock } from 'bun:test'
import { buildVaultNameIndex, isNameUniqueInIndex } from './vault-name-index.fn'
import type { App, TFile } from 'obsidian'

describe('vault-name-index', () => {
    const createMockApp = (files: Partial<TFile>[], getFiles = mock(() => files as TFile[])): App =>
        ({
            vault: { getFiles }
        }) as unknown as App

    describe('buildVaultNameIndex', () => {
        it('should return an empty index for an empty vault', () => {
            const index = buildVaultNameIndex(createMockApp([]))

            expect(index.size).toBe(0)
        })

        it('should count each distinct file name once', () => {
            const index = buildVaultNameIndex(
                createMockApp([{ name: 'a.md' }, { name: 'b.md' }, { name: 'c.md' }])
            )

            expect(index.get('a.md')).toBe(1)
            expect(index.get('b.md')).toBe(1)
            expect(index.get('c.md')).toBe(1)
        })

        it('should count repeated file names across different folders', () => {
            const index = buildVaultNameIndex(
                createMockApp([{ name: 'note.md' }, { name: 'note.md' }, { name: 'note.md' }])
            )

            expect(index.get('note.md')).toBe(3)
        })

        it('should walk the vault file list exactly once', () => {
            const getFiles = mock(() => [{ name: 'a.md' }] as TFile[])

            buildVaultNameIndex(createMockApp([], getFiles))

            expect(getFiles).toHaveBeenCalledTimes(1)
        })
    })

    describe('isNameUniqueInIndex', () => {
        it('should report a name occurring once as unique', () => {
            const index = buildVaultNameIndex(createMockApp([{ name: 'unique.md' }]))

            expect(isNameUniqueInIndex(index, 'unique.md')).toBe(true)
        })

        it('should report a name occurring twice as not unique', () => {
            const index = buildVaultNameIndex(
                createMockApp([{ name: 'dupe.md' }, { name: 'dupe.md' }])
            )

            expect(isNameUniqueInIndex(index, 'dupe.md')).toBe(false)
        })

        it('should treat an unknown name as unique', () => {
            const index = buildVaultNameIndex(createMockApp([{ name: 'other.md' }]))

            expect(isNameUniqueInIndex(index, 'missing.md')).toBe(true)
        })

        it('should distinguish names that differ only by extension', () => {
            const index = buildVaultNameIndex(
                createMockApp([{ name: 'note.md' }, { name: 'note.pdf' }])
            )

            expect(isNameUniqueInIndex(index, 'note.md')).toBe(true)
            expect(isNameUniqueInIndex(index, 'note.pdf')).toBe(true)
        })
    })
})
