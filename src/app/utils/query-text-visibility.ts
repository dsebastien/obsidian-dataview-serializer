/**
 * Body class that hides the text of query definition lines in Live Preview,
 * leaving only the badge and refresh button. The line shows again while the
 * cursor is on it. Styles: `src/styles.src.css`.
 */
export const HIDE_QUERY_TEXT_CLASS = 'dvs-hide-query-text'

/**
 * Minimal view of an element that can toggle a class. Obsidian adds
 * `toggleClass` to every `HTMLElement`; declaring just that keeps this helper
 * unit-testable without a DOM.
 */
export interface ClassToggleable {
    toggleClass(cls: string, value: boolean): void
}

/**
 * Adds or removes {@link HIDE_QUERY_TEXT_CLASS} on every given body.
 *
 * Takes all bodies rather than `activeDocument.body` because popout windows
 * each have their own document: toggling only the active one would leave the
 * other windows on the old setting.
 */
export const applyQueryTextVisibility = (
    bodies: Iterable<ClassToggleable>,
    hide: boolean
): void => {
    for (const body of bodies) {
        body.toggleClass(HIDE_QUERY_TEXT_CLASS, hide)
    }
}
