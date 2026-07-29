export interface ArgsSearchAndRemove {
    name: string
    description: string | DocumentFragment
    currentList: string[]
    setValue: (newValue: string[]) => Promise<void>
    /**
     * When true, entries may contain date placeholders (e.g. `{{year}}`). The
     * input placeholder hints at the syntax, and each configured entry shows
     * what it currently resolves to.
     */
    supportsPlaceholders?: boolean
}
