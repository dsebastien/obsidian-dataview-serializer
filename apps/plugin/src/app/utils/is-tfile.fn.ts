import { TAbstractFile, TFile } from 'obsidian';

export function isTFile(value: TAbstractFile): value is TFile {
  return 'stat' in value;
}
