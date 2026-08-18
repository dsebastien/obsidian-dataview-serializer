/**
 * Test setup file that mocks the 'obsidian' module.
 * The obsidian package is types-only and has no runtime code,
 * so we need to provide mock implementations for tests.
 */
import { mock } from 'bun:test'

// Mock the obsidian module
void mock.module('obsidian', () => ({
    Notice: class Notice {
        constructor(_message: string, _timeout?: number) {
            // No-op for tests
        }
    },
    // These are only used as types, but we provide empty implementations
    // in case they're ever accessed at runtime
    App: class App {},
    TFile: class TFile {},
    Plugin: class Plugin {},
    PluginSettingTab: class PluginSettingTab {},
    Setting: class Setting {},
    MarkdownView: class MarkdownView {},
    TAbstractFile: class TAbstractFile {},
    TFolder: class TFolder {},
    AbstractInputSuggest: class AbstractInputSuggest {},
    SearchComponent: class SearchComponent {},
    // Pulled in transitively by the plugin entry point and the What's new view.
    // Only their identity matters here; nothing calls into them under test.
    ItemView: class ItemView {},
    WorkspaceLeaf: class WorkspaceLeaf {},
    MarkdownRenderer: class MarkdownRenderer {
        static render(): Promise<void> {
            return Promise.resolve()
        }
    },
    debounce: (fn: (...args: unknown[]) => unknown) => fn,
    setIcon: () => {}
}))
