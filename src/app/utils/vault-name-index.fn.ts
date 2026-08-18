import type { App } from 'obsidian'

/**
 * Index of file name -> number of vault files carrying that name.
 *
 * Serializing a query rewrites every link it returns, and each rewrite needs to
 * know whether the target's file name is unique in the vault. Answering that by
 * scanning the vault file list per link is O(vaultSize) per link; this index
 * answers it in O(1) after a single walk.
 */
export type VaultNameIndex = ReadonlyMap<string, number>

/**
 * Build the file-name occurrence index for a vault.
 *
 * Walks the vault file list exactly once. Callers that serialize several
 * queries against the same vault state should build this once and share it,
 * rather than letting each serialization rebuild it.
 *
 * @param app The Obsidian app whose vault should be indexed
 * @returns A map of file name to the number of files carrying it
 */
export const buildVaultNameIndex = (app: App): VaultNameIndex => {
    const occurrences = new Map<string, number>()

    for (const file of app.vault.getFiles()) {
        occurrences.set(file.name, (occurrences.get(file.name) ?? 0) + 1)
    }

    return occurrences
}

/**
 * Determine whether a file name occurs at most once in the indexed vault.
 *
 * A name that is absent from the index is treated as unique: the link points at
 * something the vault does not currently contain, so there is nothing it could
 * be ambiguous with.
 *
 * @param index The vault name index
 * @param name The file name to test (including its extension)
 * @returns true when the name is unambiguous
 */
export const isNameUniqueInIndex = (index: VaultNameIndex, name: string): boolean => {
    return (index.get(name) ?? 0) <= 1
}
