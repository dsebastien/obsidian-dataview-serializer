import { describe, expect, it } from 'bun:test'
import {
    buildRenameUpdateNotice,
    collapseRenames,
    referenceMayMatchRename,
    rewriteQueryCommentsForRenames,
    topLevelRenames,
    type LinkResolver,
    type RenameOperation
} from './rewrite-renamed-references.fn'

/**
 * A close-enough model of `metadataCache.getFirstLinkpathDest`: exact path
 * (with or without `.md`), then `/`-bounded path suffix, case-insensitive;
 * the first match wins.
 */
const resolverFor =
    (files: string[]): LinkResolver =>
    (linkpath) => {
        const lower = linkpath.replace(/^\/+/, '').toLowerCase()
        if (lower === '') {
            return null
        }
        const candidates = files.map((path) => ({
            path,
            forms: [path.toLowerCase(), path.toLowerCase().replace(/\.md$/, '')]
        }))
        const exact = candidates.find(({ forms }) => forms.includes(lower))
        if (exact) {
            return exact.path
        }
        const suffix = candidates.find(({ forms }) => forms.some((f) => f.endsWith(`/${lower}`)))
        return suffix?.path ?? null
    }

const fileRename = (oldPath: string, newPath: string): RenameOperation => ({
    kind: 'file',
    oldPath,
    newPath
})
const folderRename = (oldPath: string, newPath: string): RenameOperation => ({
    kind: 'folder',
    oldPath,
    newPath
})

const q = (query: string) => `<!-- QueryToSerialize: ${query} -->`

/** Rewrite a single query line against a vault holding `files` (post-rename) */
const rewrite = (query: string, renames: RenameOperation[], files: string[]): string =>
    rewriteQueryCommentsForRenames(q(query), renames, resolverFor(files)).content.slice(
        '<!-- QueryToSerialize: '.length,
        -' -->'.length
    )

describe('rewriteQueryCommentsForRenames: file renames', () => {
    const rename = fileRename('Goals/Old Goal.md', 'Goals/New Goal.md')
    const vault = ['Goals/New Goal.md', 'Other/Note.md']

    it('rewrites a basename link', () => {
        expect(rewrite('LIST FROM #type/plan AND [[Old Goal]]', [rename], vault)).toBe(
            'LIST FROM #type/plan AND [[New Goal]]'
        )
    })

    it('matches links case-insensitively', () => {
        expect(rewrite('LIST FROM [[old goal]]', [rename], vault)).toBe('LIST FROM [[New Goal]]')
    })

    it('keeps aliases, headings and block references', () => {
        expect(
            rewrite(
                'LIST FROM [[Old Goal|the goal]] OR [[Old Goal#Tasks]] OR [[Old Goal#^abc|x]]',
                [rename],
                vault
            )
        ).toBe('LIST FROM [[New Goal|the goal]] OR [[New Goal#Tasks]] OR [[New Goal#^abc|x]]')
    })

    it('keeps the path form of a path link', () => {
        expect(rewrite('LIST FROM [[Goals/Old Goal]]', [rename], vault)).toBe(
            'LIST FROM [[Goals/New Goal]]'
        )
    })

    it('keeps an explicit .md extension', () => {
        expect(rewrite('LIST FROM [[Goals/Old Goal.md]] OR [[Old Goal.md]]', [rename], vault)).toBe(
            'LIST FROM [[Goals/New Goal.md]] OR [[New Goal.md]]'
        )
    })

    it('uses the full path when the new basename is ambiguous', () => {
        const ambiguous = ['Archive/New Goal.md', 'Goals/New Goal.md']
        expect(rewrite('LIST FROM [[Old Goal]]', [rename], ambiguous)).toBe(
            'LIST FROM [[Goals/New Goal]]'
        )
    })

    it('rewrites links outside FROM too', () => {
        expect(rewrite('LIST WHERE contains(file.outlinks, [[Old Goal]])', [rename], vault)).toBe(
            'LIST WHERE contains(file.outlinks, [[New Goal]])'
        )
    })

    it('rewrites every occurrence on the line', () => {
        expect(rewrite('LIST FROM [[Old Goal]] OR -[[Old Goal]]', [rename], vault)).toBe(
            'LIST FROM [[New Goal]] OR -[[New Goal]]'
        )
    })

    it('leaves a link that still resolves to another note', () => {
        const stillThere = ['Goals/New Goal.md', 'Archive/Old Goal.md']
        expect(rewrite('LIST FROM [[Old Goal]]', [rename], stillThere)).toBe(
            'LIST FROM [[Old Goal]]'
        )
    })

    it('never touches other names or [[]]', () => {
        expect(
            rewrite('LIST FROM [[Old Goal 2]] OR [[My Old Goal]] OR [[]]', [rename], vault)
        ).toBe('LIST FROM [[Old Goal 2]] OR [[My Old Goal]] OR [[]]')
    })

    it('leaves a note moved without renaming alone when referenced by basename', () => {
        const move = fileRename('Inbox/Note.md', 'Notes/Note.md')
        expect(rewrite('LIST FROM [[Note]] OR [[Inbox/Note]]', [move], ['Notes/Note.md'])).toBe(
            'LIST FROM [[Note]] OR [[Notes/Note]]'
        )
    })

    it('rewrites quoted file paths, with or without .md', () => {
        expect(rewrite('LIST FROM "Goals/Old Goal.md" OR "Goals/Old Goal"', [rename], vault)).toBe(
            'LIST FROM "Goals/New Goal.md" OR "Goals/New Goal"'
        )
    })

    it('matches quoted paths case-sensitively, like Dataview', () => {
        expect(rewrite('LIST FROM "goals/old goal"', [rename], vault)).toBe(
            'LIST FROM "goals/old goal"'
        )
    })

    it('leaves strings outside FROM alone', () => {
        expect(rewrite('LIST WHERE file.path = "Goals/Old Goal.md"', [rename], vault)).toBe(
            'LIST WHERE file.path = "Goals/Old Goal.md"'
        )
    })

    it('rewrites non-Markdown attachments with their extension', () => {
        const pdf = fileRename('Files/old.pdf', 'Files/new.pdf')
        expect(
            rewrite('LIST WHERE contains(file.outlinks, [[old.pdf]])', [pdf], ['Files/new.pdf'])
        ).toBe('LIST WHERE contains(file.outlinks, [[new.pdf]])')
    })
})

describe('rewriteQueryCommentsForRenames: folder renames', () => {
    const rename = folderRename('Projects', 'Work')
    const vault = ['Work/A.md', 'Work/sub/B.md', 'Projects2/C.md']

    it('rewrites the folder and its subfolders', () => {
        expect(rewrite('LIST FROM "Projects" OR "Projects/sub"', [rename], vault)).toBe(
            'LIST FROM "Work" OR "Work/sub"'
        )
    })

    it('rewrites negated sources too', () => {
        expect(rewrite('LIST FROM "" AND !"Projects/sub" AND -"Projects"', [rename], vault)).toBe(
            'LIST FROM "" AND !"Work/sub" AND -"Work"'
        )
    })

    it('never matches a mere prefix of another folder name', () => {
        expect(rewrite('LIST FROM "Projects2" OR "Projects 2/x"', [rename], vault)).toBe(
            'LIST FROM "Projects2" OR "Projects 2/x"'
        )
    })

    it('keeps slashes around the path', () => {
        expect(rewrite('LIST FROM "/Projects/"', [rename], vault)).toBe('LIST FROM "/Work/"')
    })

    it('rewrites path links under the folder', () => {
        expect(rewrite('LIST FROM [[Projects/sub/B|b]]', [rename], vault)).toBe(
            'LIST FROM [[Work/sub/B|b]]'
        )
    })

    it('handles the mangled real-world nested folder case', () => {
        const nested = folderRename(
            '20 Actions/23 Projects23 Projects/YouTube',
            '20 Actions/23 Projects/YouTube'
        )
        expect(
            rewrite('LIST FROM "" AND !"20 Actions/23 Projects23 Projects/YouTube"', [nested], [])
        ).toBe('LIST FROM "" AND !"20 Actions/23 Projects/YouTube"')
    })

    it('handles a folder rename batch with its per-file events', () => {
        const batch = collapseRenames([
            folderRename('Projects', 'Work'),
            fileRename('Projects/A.md', 'Work/A.md'),
            fileRename('Projects/sub/B.md', 'Work/sub/B.md')
        ])
        expect(
            rewrite(
                'LIST FROM "Projects/sub" OR [[A]] OR [[Projects/A]] OR "Projects/sub/B.md"',
                batch,
                vault
            )
        ).toBe('LIST FROM "Work/sub" OR [[A]] OR [[Work/A]] OR "Work/sub/B.md"')
    })
})

describe('rewriteQueryCommentsForRenames: query comment kinds', () => {
    const rename = fileRename('Old.md', 'New.md')
    const resolve = resolverFor(['New.md'])

    it('keeps the SerializedQuery header in sync with its query', () => {
        const content = [
            '<!-- QueryToSerialize: LIST FROM [[Old]] -->',
            '<!-- SerializedQuery: LIST FROM [[Old]] -->',
            '- [[Old]]',
            '<!-- SerializedQuery END -->'
        ].join('\n')
        const result = rewriteQueryCommentsForRenames(content, [rename], resolve)
        expect(result.content).toBe(
            [
                '<!-- QueryToSerialize: LIST FROM [[New]] -->',
                '<!-- SerializedQuery: LIST FROM [[New]] -->',
                '- [[Old]]',
                '<!-- SerializedQuery END -->'
            ].join('\n')
        )
        expect(result.queriesUpdated).toBe(1)
    })

    it('covers inline queries and the alternative syntax', () => {
        const content = [
            'Status: <!-- IQ: =[[Old]].status -->x<!-- /IQ -->',
            '<!-- dataview-serializer-query-manual: TABLE x FROM [[Old]] -->',
            '<!-- dataview-serializer-result: TABLE x FROM [[Old]] -->',
            '<!-- dataview-serializer-result-end -->'
        ].join('\n')
        const result = rewriteQueryCommentsForRenames(content, [rename], resolve)
        expect(result.content).not.toContain('[[Old]]')
        expect(result.queriesUpdated).toBe(2)
    })

    it('rewrites multi-line definitions in a callout', () => {
        const content = '> <!-- QueryToSerialize: LIST\n> FROM [[Old]]\n> SORT file.name -->'
        expect(rewriteQueryCommentsForRenames(content, [rename], resolve).content).toBe(
            '> <!-- QueryToSerialize: LIST\n> FROM [[New]]\n> SORT file.name -->'
        )
    })

    it('keeps CRLF files intact', () => {
        const content = 'a\r\n<!-- QueryToSerialize: LIST FROM [[Old]] -->\r\nb [[Old]]\r\n'
        expect(rewriteQueryCommentsForRenames(content, [rename], resolve).content).toBe(
            'a\r\n<!-- QueryToSerialize: LIST FROM [[New]] -->\r\nb [[Old]]\r\n'
        )
    })

    it('counts a query once across several renames', () => {
        const content = '<!-- QueryToSerialize: LIST FROM [[Old]] OR "Folder" -->'
        const result = rewriteQueryCommentsForRenames(
            content,
            [rename, folderRename('Folder', 'Dir')],
            resolve
        )
        expect(result.content).toBe('<!-- QueryToSerialize: LIST FROM [[New]] OR "Dir" -->')
        expect(result.queriesUpdated).toBe(1)
    })
})

describe('collapseRenames', () => {
    it('collapses chains and drops no-ops', () => {
        expect(
            collapseRenames([
                fileRename('A.md', 'B.md'),
                fileRename('B.md', 'C.md'),
                fileRename('X.md', 'X.md')
            ])
        ).toEqual([fileRename('A.md', 'C.md')])
    })

    it('drops a rename undone in the same batch', () => {
        expect(collapseRenames([fileRename('A.md', 'B.md'), fileRename('B.md', 'A.md')])).toEqual(
            []
        )
    })
})

describe('referenceMayMatchRename', () => {
    it('ignores empty targets', () => {
        expect(
            referenceMayMatchRename({ kind: 'link', target: '' }, fileRename('A.md', 'B.md'))
        ).toBe(false)
    })

    it('does not treat basename links as folder paths', () => {
        expect(
            referenceMayMatchRename(
                { kind: 'link', target: 'Projects' },
                folderRename('Projects', 'W')
            )
        ).toBe(false)
    })
})

describe('rename notice', () => {
    it('names a single rename', () => {
        expect(buildRenameUpdateNotice(3, 2, [fileRename('a/Old.md', 'a/New.md')])).toBe(
            'Dataview Serializer: updated 3 queries in 2 notes after renaming "Old" to "New".'
        )
    })

    it('folds per-file events into their folder', () => {
        const batch = [
            folderRename('Projects', 'Work'),
            fileRename('Projects/A.md', 'Work/A.md'),
            fileRename('Projects/sub/B.md', 'Work/sub/B.md')
        ]
        expect(topLevelRenames(batch)).toEqual([folderRename('Projects', 'Work')])
        expect(buildRenameUpdateNotice(1, 1, batch)).toBe(
            'Dataview Serializer: updated 1 query in 1 note after renaming "Projects" to "Work".'
        )
    })

    it('counts unrelated renames', () => {
        expect(
            buildRenameUpdateNotice(2, 2, [fileRename('A.md', 'B.md'), fileRename('C.md', 'D.md')])
        ).toBe(
            'Dataview Serializer: updated 2 queries in 2 notes after renaming 2 notes or folders.'
        )
    })
})
