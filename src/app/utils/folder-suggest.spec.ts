import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { TFolder } from 'obsidian'
import type { App } from 'obsidian'
import { FolderSuggest } from './folder-suggest'

// Polyfill for Obsidian's String.contains() method
declare global {
    interface String {
        contains(searchString: string): boolean
    }
}

beforeAll(() => {
    if (!String.prototype.contains) {
        String.prototype.contains = function (searchString: string): boolean {
            return this.includes(searchString)
        }
    }
})

const createFolder = (path: string): TFolder => {
    const folder = new TFolder()
    ;(folder as unknown as { path: string }).path = path
    return folder
}

/**
 * `AbstractInputSuggest` is mocked as an empty class in the test setup, so the
 * real base constructor never assigns `app`. The suggester is wired up by hand
 * here to stand in for what Obsidian would do at runtime.
 */
const createSuggest = (
    paths: string[],
    getAllLoadedFiles = mock(() => paths.map(createFolder))
): { suggest: FolderSuggest; getAllLoadedFiles: ReturnType<typeof mock> } => {
    const inputEl = { value: '' } as HTMLInputElement
    const app = { vault: { getAllLoadedFiles } } as unknown as App
    const suggest = new FolderSuggest(inputEl, app)
    ;(suggest as unknown as { app: App }).app = app
    return { suggest, getAllLoadedFiles }
}

describe('FolderSuggest', () => {
    describe('getSuggestions', () => {
        it('should return every folder for an empty query', () => {
            const { suggest } = createSuggest(['a', 'b', 'c'])

            expect(suggest.getSuggestions('').map((f) => f.path)).toEqual(['a', 'b', 'c'])
        })

        it('should match folders case-insensitively on any path segment', () => {
            const { suggest } = createSuggest(['Notes/Daily', 'Archive', 'notes/Weekly'])

            expect(suggest.getSuggestions('notes').map((f) => f.path)).toEqual([
                'Notes/Daily',
                'notes/Weekly'
            ])
        })

        it('should return nothing when no folder matches', () => {
            const { suggest } = createSuggest(['a', 'b'])

            expect(suggest.getSuggestions('nope')).toEqual([])
        })

        it('should ignore vault entries that are not folders', () => {
            // A plain object stands in for a TFile: not a TFolder at runtime
            const files = [createFolder('folder'), { path: 'note.md' } as unknown as TFolder]
            const { suggest } = createSuggest(
                [],
                mock(() => files)
            )

            expect(suggest.getSuggestions('').map((f) => f.path)).toEqual(['folder'])
        })
    })

    describe('result cap', () => {
        it('should cap the suggestions at 50', () => {
            const paths = Array.from({ length: 200 }, (_, i) => `folder-${i}`)
            const { suggest } = createSuggest(paths)

            expect(suggest.getSuggestions('folder')).toHaveLength(50)
        })

        it('should still cap when the query matches everything', () => {
            const paths = Array.from({ length: 75 }, (_, i) => `f${i}`)
            const { suggest } = createSuggest(paths)

            expect(suggest.getSuggestions('')).toHaveLength(50)
        })

        it('should return all matches when fewer than the cap', () => {
            const paths = Array.from({ length: 10 }, (_, i) => `f${i}`)
            const { suggest } = createSuggest(paths)

            expect(suggest.getSuggestions('')).toHaveLength(10)
        })
    })

    describe('index caching', () => {
        it('should walk the vault only once across many keystrokes', () => {
            const { suggest, getAllLoadedFiles } = createSuggest(['alpha', 'beta', 'gamma'])

            suggest.getSuggestions('a')
            suggest.getSuggestions('al')
            suggest.getSuggestions('alp')
            suggest.getSuggestions('alph')

            expect(getAllLoadedFiles).toHaveBeenCalledTimes(1)
        })

        it('should not walk the vault before the first query', () => {
            const { getAllLoadedFiles } = createSuggest(['alpha'])

            expect(getAllLoadedFiles).not.toHaveBeenCalled()
        })

        it('should keep returning correct results from the cached index', () => {
            const { suggest } = createSuggest(['alpha', 'beta'])

            expect(suggest.getSuggestions('alpha').map((f) => f.path)).toEqual(['alpha'])
            expect(suggest.getSuggestions('beta').map((f) => f.path)).toEqual(['beta'])
            expect(suggest.getSuggestions('alpha').map((f) => f.path)).toEqual(['alpha'])
        })
    })
})
