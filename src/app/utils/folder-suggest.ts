import { AbstractInputSuggest, App, TFolder } from 'obsidian'

/**
 * Upper bound on the number of folders offered at once. A vault can hold
 * thousands of folders, and a dropdown that long is neither usable nor cheap to
 * render; the user narrows it by typing.
 */
const MAX_SUGGESTIONS = 50

interface IndexedFolder {
    folder: TFolder
    lowerCasePath: string
}

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    /**
     * Vault folders with their lower-cased path, built on first use.
     *
     * `getSuggestions` runs on every keystroke, so neither the vault walk nor
     * the per-folder `toLowerCase()` belongs there: only the needle changes
     * between calls, not the haystack.
     */
    private indexedFolders: IndexedFolder[] | undefined

    constructor(
        private inputEl: HTMLInputElement,
        app: App
    ) {
        super(app, inputEl)
    }

    private getIndexedFolders(): IndexedFolder[] {
        if (!this.indexedFolders) {
            this.indexedFolders = this.app.vault
                .getAllLoadedFiles()
                .filter((file): file is TFolder => file instanceof TFolder)
                .map((folder) => ({ folder, lowerCasePath: folder.path.toLowerCase() }))
        }
        return this.indexedFolders
    }

    /**
     * Return the vault folders matching the current input
     * @param inputStr
     */
    getSuggestions(inputStr: string): TFolder[] {
        const lowerCaseInputStr = inputStr.toLowerCase()
        const matches: TFolder[] = []

        for (const { folder, lowerCasePath } of this.getIndexedFolders()) {
            if (lowerCasePath.contains(lowerCaseInputStr)) {
                matches.push(folder)
                if (matches.length >= MAX_SUGGESTIONS) {
                    break
                }
            }
        }

        return matches
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path)
    }

    override selectSuggestion(folder: TFolder): void {
        this.inputEl.value = folder.path
        this.close()
    }
}
