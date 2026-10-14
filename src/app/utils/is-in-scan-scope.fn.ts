/**
 * Whether a file falls inside the "Folders to scan" scope of a vault-wide run
 * (the "Scan and serialize all" command and the periodic serialization timer).
 *
 * An empty list means the whole vault is in scope. Matching is a path prefix
 * match, the same rule as "Folders to ignore" and "Folders to force update".
 * Event-driven updates are not scoped by this list: they only process the file
 * that changed.
 */
export const isInScanScope = (filePath: string, foldersToScan: readonly string[]): boolean => {
    if (foldersToScan.length === 0) {
        return true
    }
    return foldersToScan.some((folder) => filePath.startsWith(folder))
}
