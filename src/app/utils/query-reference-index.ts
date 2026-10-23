import { findQueryReferences } from './extract-from-sources.fn'
import { findQueryComments, mayContainQueryComment } from './query-comments.fn'
import { referenceMayMatchRename, type RenameOperation } from './rewrite-renamed-references.fn'

/**
 * Which notes hold query comments referencing which links and paths.
 *
 * A rename must find the notes whose queries mention the renamed entry
 * without reading the vault (13k+ notes with queries in large vaults). This
 * index maps each distinct reference to the notes using it; a rename batch
 * then tests every distinct reference once (a few thousand string checks)
 * instead of every note.
 *
 * Keys: `l:<lowercased link path>` for links (Obsidian resolves links
 * case-insensitively), `p:<path>` for quoted FROM paths (case-sensitive, like
 * Dataview). `[[]]` and `""` are never indexed.
 *
 * Pure: the caller feeds note contents and vault events.
 */

type ReferenceKey = string

const keyOf = (kind: 'link' | 'path', target: string): ReferenceKey =>
    kind === 'link' ? `l:${target.toLowerCase()}` : `p:${target}`

const parseKey = (key: ReferenceKey): { kind: 'link' | 'path'; target: string } => ({
    kind: key.startsWith('l:') ? 'link' : 'path',
    target: key.slice(2)
})

/** The distinct reference keys of the query comments of a note */
export function collectReferenceKeys(content: string): Set<ReferenceKey> {
    const keys = new Set<ReferenceKey>()
    if (!mayContainQueryComment(content)) {
        return keys
    }

    for (const comment of findQueryComments(content)) {
        for (const reference of findQueryReferences(comment.body)) {
            if (reference.target !== '') {
                keys.add(keyOf(reference.kind, reference.target))
            }
        }
    }
    return keys
}

export class QueryReferenceIndex {
    private keysByNote = new Map<string, Set<ReferenceKey>>()
    private notesByKey = new Map<ReferenceKey, Set<string>>()

    /** Number of notes holding at least one indexed reference */
    get noteCount(): number {
        return this.keysByNote.size
    }

    /** Number of distinct indexed references */
    get referenceCount(): number {
        return this.notesByKey.size
    }

    /** (Re)index a note from its full content */
    update(notePath: string, content: string): void {
        this.setKeys(notePath, collectReferenceKeys(content))
    }

    /** Forget a deleted note, or every note under a deleted folder */
    remove(path: string): void {
        const removed = [...this.keysByNote.keys()].filter(
            (notePath) => notePath === path || notePath.startsWith(`${path}/`)
        )
        removed.forEach((notePath) => this.setKeys(notePath, new Set()))
    }

    /**
     * Follow a rename. For a folder, every indexed note under it moves too,
     * so the index stays right whether the per-file events come before or
     * after the folder event (or not at all).
     */
    rename(oldPath: string, newPath: string): void {
        const moves: Array<[string, string]> = []
        for (const notePath of this.keysByNote.keys()) {
            if (notePath === oldPath) {
                moves.push([notePath, newPath])
            } else if (notePath.startsWith(`${oldPath}/`)) {
                moves.push([notePath, newPath + notePath.slice(oldPath.length)])
            }
        }

        for (const [from, to] of moves) {
            const keys = this.keysByNote.get(from)!
            this.setKeys(from, new Set())
            this.setKeys(to, keys)
        }
    }

    /**
     * The notes whose queries may reference an entry of the batch (current
     * paths). An over-approximation: the rewrite decides per reference.
     */
    notesAffectedBy(renames: RenameOperation[]): Set<string> {
        const notes = new Set<string>()
        for (const [key, keyNotes] of this.notesByKey) {
            const reference = parseKey(key)
            if (renames.some((rename) => referenceMayMatchRename(reference, rename))) {
                keyNotes.forEach((note) => notes.add(note))
            }
        }
        return notes
    }

    /** The renames of the batch that may concern a note */
    renamesConcerning(notePath: string, renames: RenameOperation[]): RenameOperation[] {
        const keys = [...(this.keysByNote.get(notePath) ?? [])].map(parseKey)
        return renames.filter((rename) =>
            keys.some((reference) => referenceMayMatchRename(reference, rename))
        )
    }

    clear(): void {
        this.keysByNote.clear()
        this.notesByKey.clear()
    }

    private setKeys(notePath: string, keys: Set<ReferenceKey>): void {
        for (const key of this.keysByNote.get(notePath) ?? []) {
            const notes = this.notesByKey.get(key)
            notes?.delete(notePath)
            if (notes?.size === 0) {
                this.notesByKey.delete(key)
            }
        }

        if (keys.size === 0) {
            this.keysByNote.delete(notePath)
            return
        }

        this.keysByNote.set(notePath, keys)
        for (const key of keys) {
            let notes = this.notesByKey.get(key)
            if (!notes) {
                notes = new Set()
                this.notesByKey.set(key, notes)
            }
            notes.add(notePath)
        }
    }
}
