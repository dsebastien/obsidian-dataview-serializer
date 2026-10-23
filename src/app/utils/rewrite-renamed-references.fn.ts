import type { QueryReference } from './extract-from-sources.fn'
import {
    findQueryComments,
    rewriteQueryComments,
    type QueryCommentsRewrite
} from './query-comments.fn'

/**
 * Rewriting of query references after a note or folder is renamed.
 *
 * Obsidian's link updater skips HTML comments, which is where queries live,
 * so a rename leaves `FROM [[Old]]` or `FROM "Old/folder"` behind. These pure
 * functions decide which references pointed at the renamed entry and what
 * they become.
 *
 * Matching rules (deliberate):
 * - Links compare case-insensitively, like Obsidian resolves links. A link
 *   matches a renamed file when its path equals the old path (with or without
 *   `.md`) or is a `/`-bounded suffix of it (`[[Old]]`, `[[sub/Old]]`,
 *   `[[folder/sub/Old]]`). A link that still resolves to a different existing
 *   file is left alone: it was, or now is, pointing elsewhere.
 * - Quoted paths compare case-sensitively, like Dataview matches folder and
 *   file sources and like the unresolved-reference check (#88) resolves them.
 * - Folder prefixes only match on a `/` boundary: renaming `Projects` never
 *   touches `"Projects2"`.
 * - Negated FROM sources are rewritten too: they are meant to keep excluding
 *   the same note or folder.
 */

/** A rename reported by the vault */
export interface RenameOperation {
    kind: 'file' | 'folder'
    oldPath: string
    newPath: string
}

/**
 * Where a link path leads from the note holding the query, as a vault path,
 * or null when it does not resolve (`metadataCache.getFirstLinkpathDest`).
 */
export type LinkResolver = (linkpath: string) => string | null

const MD_EXTENSION = '.md'

const withoutMdExtension = (path: string): string =>
    path.toLowerCase().endsWith(MD_EXTENSION) ? path.slice(0, -MD_EXTENSION.length) : path

const fileNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** `[[/a/b]]` and `[[a/b]]` lead to the same place */
const stripLeadingSlashes = (path: string): string => path.replace(/^\/+/, '')

/** True when `target` names the file at `path` the way a link would */
function linkTargetsFile(target: string, path: string): boolean {
    const lowerTarget = stripLeadingSlashes(target).toLowerCase()
    if (lowerTarget === '') {
        return false
    }
    return [path.toLowerCase(), withoutMdExtension(path).toLowerCase()].some(
        (candidate) => candidate === lowerTarget || candidate.endsWith(`/${lowerTarget}`)
    )
}

/** True when `path` is `folder` or lies under it */
function isUnderFolder(path: string, folder: string): boolean {
    return path === folder || path.startsWith(`${folder}/`)
}

/**
 * Whether a reference may point at the renamed entry. Ignores link
 * resolution (see {@link rewriteReferenceForRename}), so it over-approximates:
 * it picks the notes worth opening, it does not decide the rewrite.
 */
export function referenceMayMatchRename(
    reference: Pick<QueryReference, 'kind' | 'target'>,
    rename: RenameOperation
): boolean {
    const { kind, target } = reference
    if (target === '') {
        return false
    }

    if (kind === 'link') {
        if (rename.kind === 'file') {
            return linkTargetsFile(target, rename.oldPath)
        }
        const lowerTarget = stripLeadingSlashes(target).toLowerCase()
        return lowerTarget.includes('/') && isUnderFolder(lowerTarget, rename.oldPath.toLowerCase())
    }

    if (rename.kind === 'file') {
        return target === rename.oldPath || target === withoutMdExtension(rename.oldPath)
    }
    return isUnderFolder(target, rename.oldPath)
}

/** `Target#heading|alias` → [`Target`, `#heading|alias`] */
function splitLinkInner(inner: string): [string, string] {
    const cut = inner.search(/[#|]/)
    return cut === -1 ? [inner, ''] : [inner.slice(0, cut), inner.slice(cut)]
}

/** The text of a link to `newPath`, in the same form as `oldTarget` */
function newLinkTarget(oldTarget: string, newPath: string, resolve: LinkResolver): string {
    const keepsExtension =
        !newPath.toLowerCase().endsWith(MD_EXTENSION) ||
        oldTarget.toLowerCase().endsWith(MD_EXTENSION)
    const fullPath = keepsExtension ? newPath : withoutMdExtension(newPath)

    if (!stripLeadingSlashes(oldTarget).includes('/')) {
        // Basename form stays basename form, unless the new name is ambiguous
        const name = keepsExtension ? fileNameOf(newPath) : fileNameOf(withoutMdExtension(newPath))
        if (resolve(name) === newPath) {
            return name
        }
    }
    return fullPath
}

function rewriteLink(
    reference: QueryReference,
    rename: RenameOperation,
    resolve: LinkResolver
): string | null {
    if (!reference.raw.startsWith('[[') || !reference.raw.endsWith(']]')) {
        return null
    }
    const inner = reference.raw.slice(2, -2)
    const [targetPart, suffix] = splitLinkInner(inner)
    const target = targetPart.trim()

    const currentDestination = resolve(target)

    if (rename.kind === 'file') {
        // Still leads to another existing note: not ours to change
        if (currentDestination !== null && currentDestination !== rename.newPath) {
            return null
        }
        return `[[${newLinkTarget(target, rename.newPath, resolve)}${suffix}]]`
    }

    if (currentDestination !== null) {
        return null
    }
    const leading = target.slice(0, target.length - stripLeadingSlashes(target).length)
    const rest = stripLeadingSlashes(target).slice(rename.oldPath.length)
    return `[[${leading}${rename.newPath}${rest}${suffix}]]`
}

const escapeDqlString = (value: string): string => value.replace(/[\\"]/g, '\\$&')

function rewritePath(reference: QueryReference, rename: RenameOperation): string | null {
    const { raw, target } = reference
    if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
        return null
    }

    let newTarget: string
    if (rename.kind === 'file') {
        const keepsExtension = target === rename.oldPath
        newTarget = keepsExtension ? rename.newPath : withoutMdExtension(rename.newPath)
    } else {
        newTarget = rename.newPath + target.slice(rename.oldPath.length)
    }

    // Keep the slashes Dataview tolerates around paths
    const leading = /^\s*\/*/.exec(raw.slice(1, -1))?.[0] ?? ''
    const trailing = /\/*\s*$/.exec(raw.slice(1, -1))?.[0] ?? ''
    return `"${escapeDqlString(`${leading}${newTarget}${trailing}`)}"`
}

/**
 * The new text of a reference after a rename, or null when the reference
 * did not point at the renamed entry (or must not change).
 *
 * Links keep their form: a basename stays a basename (unless another note
 * shares the new name, then the full path is used), a path becomes the new
 * path; `#heading`, `#^block` and `|alias` are kept.
 */
export function rewriteReferenceForRename(
    reference: QueryReference,
    rename: RenameOperation,
    resolve: LinkResolver
): string | null {
    if (!referenceMayMatchRename(reference, rename)) {
        return null
    }
    // A string outside FROM is a plain value, never a path
    if (reference.kind === 'path') {
        return reference.inFrom ? rewritePath(reference, rename) : null
    }
    return rewriteLink(reference, rename, resolve)
}

/**
 * Merge the renames of a batch: drop no-ops and collapse chains
 * (`A → B` then `B → C` becomes `A → C`), so a reference is rewritten once,
 * to its final form. Order is otherwise kept.
 */
export function collapseRenames(renames: RenameOperation[]): RenameOperation[] {
    const collapsed: RenameOperation[] = []

    for (const rename of renames) {
        const previous = collapsed.find(
            (candidate) => candidate.kind === rename.kind && candidate.newPath === rename.oldPath
        )
        if (previous) {
            previous.newPath = rename.newPath
        } else {
            collapsed.push({ ...rename })
        }
    }

    return collapsed.filter((rename) => rename.oldPath !== rename.newPath)
}

/**
 * Apply renames to the query comments of a note (definitions and result
 * headers alike, so the header stays in sync with its query).
 */
export function rewriteQueryCommentsForRenames(
    content: string,
    renames: RenameOperation[],
    resolve: LinkResolver
): QueryCommentsRewrite {
    let current = content
    // Comments keep their order across passes; count each one once, however
    // many renames touched it
    const changed = new Set<number>()
    const changedQueries = new Set<number>()

    for (const rename of renames) {
        const kinds = findQueryComments(current).map((comment) => comment.kind)
        const pass = rewriteQueryComments(current, (reference) =>
            rewriteReferenceForRename(reference, rename, resolve)
        )
        current = pass.content
        for (const index of pass.changedComments) {
            changed.add(index)
            if (kinds[index] !== 'result-header') {
                changedQueries.add(index)
            }
        }
    }

    return {
        content: current,
        queriesUpdated: changedQueries.size,
        changedComments: [...changed].sort((a, b) => a - b)
    }
}

const displayName = (path: string): string => withoutMdExtension(fileNameOf(path))

/**
 * The renames a user actually made: per-file events of a renamed folder are
 * folded into that folder.
 */
export function topLevelRenames(renames: RenameOperation[]): RenameOperation[] {
    const folders = renames.filter((rename) => rename.kind === 'folder')
    return renames.filter(
        (rename) =>
            !folders.some(
                (folder) => folder !== rename && rename.newPath.startsWith(`${folder.newPath}/`)
            )
    )
}

/** One notice summarizing what a rename batch changed */
export function buildRenameUpdateNotice(
    queriesUpdated: number,
    notesUpdated: number,
    renames: RenameOperation[]
): string {
    const top = topLevelRenames(renames)
    const what =
        top.length === 1
            ? `renaming "${displayName(top[0]!.oldPath)}" to "${displayName(top[0]!.newPath)}"`
            : `renaming ${top.length} notes or folders`
    const queries = `${queriesUpdated} ${queriesUpdated === 1 ? 'query' : 'queries'}`
    const notes = `${notesUpdated} ${notesUpdated === 1 ? 'note' : 'notes'}`
    return `Dataview Serializer: updated ${queries} in ${notes} after ${what}.`
}
