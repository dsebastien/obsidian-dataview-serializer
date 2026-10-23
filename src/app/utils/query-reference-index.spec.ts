import { describe, expect, it } from 'bun:test'
import { collectReferenceKeys, QueryReferenceIndex } from './query-reference-index'
import type { RenameOperation } from './rewrite-renamed-references.fn'

const note = (query: string) => `# Title\n<!-- QueryToSerialize: ${query} -->\n`

describe('collectReferenceKeys', () => {
    it('collects links (lowercased) and FROM paths (as written)', () => {
        expect(
            [
                ...collectReferenceKeys(note('LIST FROM [[Goal|g]] OR "Folder/Sub" OR [[]] OR ""'))
            ].sort()
        ).toEqual(['l:goal', 'p:Folder/Sub'])
    })

    it('ignores notes without query comments', () => {
        expect(collectReferenceKeys('[[Goal]] "Folder"').size).toBe(0)
    })
})

describe('QueryReferenceIndex', () => {
    const build = () => {
        const index = new QueryReferenceIndex()
        index.update('a.md', note('LIST FROM [[Goal]]'))
        index.update('b.md', note('LIST FROM "Projects/x"'))
        index.update('c.md', note('LIST FROM "Projects2"'))
        index.update('d.md', 'no queries')
        return index
    }

    it('only keeps notes with references', () => {
        const index = build()
        expect(index.noteCount).toBe(3)
        expect(index.referenceCount).toBe(3)
    })

    it('finds the notes affected by a file rename', () => {
        const rename: RenameOperation = { kind: 'file', oldPath: 'x/Goal.md', newPath: 'x/G.md' }
        expect([...build().notesAffectedBy([rename])]).toEqual(['a.md'])
    })

    it('finds the notes affected by a folder rename, on / boundaries only', () => {
        const rename: RenameOperation = { kind: 'folder', oldPath: 'Projects', newPath: 'Work' }
        expect([...build().notesAffectedBy([rename])]).toEqual(['b.md'])
    })

    it('tells which renames concern a note', () => {
        const renames: RenameOperation[] = [
            { kind: 'folder', oldPath: 'Projects', newPath: 'Work' },
            { kind: 'file', oldPath: 'Goal.md', newPath: 'G.md' }
        ]
        expect(build().renamesConcerning('a.md', renames)).toEqual([renames[1]!])
    })

    it('updates and removes notes', () => {
        const index = build()
        index.update('a.md', note('LIST FROM #tag'))
        index.remove('b.md')
        expect(index.noteCount).toBe(1)
        expect(index.referenceCount).toBe(1)
    })

    it('follows note and folder renames', () => {
        const index = new QueryReferenceIndex()
        index.update('Old/a.md', note('LIST FROM [[Goal]]'))
        index.update('Old/sub/b.md', note('LIST FROM [[Goal]]'))
        index.update('Older/c.md', note('LIST FROM [[Goal]]'))

        index.rename('Old', 'New')
        index.rename('Old/a.md', 'New/a.md') // per-file event after the folder one: no-op
        index.rename('Older/c.md', 'Older/d.md')

        const rename: RenameOperation = { kind: 'file', oldPath: 'Goal.md', newPath: 'G.md' }
        expect([...index.notesAffectedBy([rename])].sort()).toEqual([
            'New/a.md',
            'New/sub/b.md',
            'Older/d.md'
        ])
    })

    it('removes every note under a deleted folder', () => {
        const index = build()
        index.update('F/x.md', note('LIST FROM [[Goal]]'))
        index.remove('F')
        expect(index.noteCount).toBe(3)
    })
})
