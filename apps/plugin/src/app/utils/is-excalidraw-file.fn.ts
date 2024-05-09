import { TFile } from 'obsidian';

/**
 * Check if the given TFile is an Excalidraw file
 * Taken from https://github.com/beaussan/update-time-on-edit-obsidian
 * @param file
 */
export const isExcalidrawFile = (file: TFile): boolean => {
  const ea =
    //@ts-expect-error this is coming from global context, injected by Excalidraw
    typeof ExcalidrawAutomate === 'undefined'
      ? undefined
      : //@ts-expect-error this is comming from global context, injected by Excalidraw
        ExcalidrawAutomate; //ea will be undefined if the Excalidraw plugin is not running
  return ea ? ea.isExcalidrawFile(file) : false;
};
