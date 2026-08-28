import { TFile } from 'obsidian'

/**
 * Injected into the global scope by the Excalidraw plugin when it is running.
 *
 * Declared here rather than suppressed with `@ts-expect-error`: the suppression
 * left the value typed as `error`, which made the call below an unsafe-return
 * the moment type-checked linting was switched on, and told the reader nothing
 * about the shape being relied on.
 */
declare const ExcalidrawAutomate: { isExcalidrawFile: (file: TFile) => boolean } | undefined

/**
 * Check if the given TFile is an Excalidraw file
 * Taken from https://github.com/beaussan/update-time-on-edit-obsidian
 * @param file
 */
export const isExcalidrawFile = (file: TFile): boolean => {
    // `typeof` guard, not a truthiness check: the binding does not exist at all
    // unless the Excalidraw plugin is loaded, and reading it directly would
    // throw a ReferenceError.
    if (typeof ExcalidrawAutomate === 'undefined' || !ExcalidrawAutomate) {
        return false
    }
    return ExcalidrawAutomate.isExcalidrawFile(file)
}
