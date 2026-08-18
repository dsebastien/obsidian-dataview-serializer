import { describe, expect, it, mock } from 'bun:test'
import { add, sub } from 'date-fns'
import { DataviewSerializerPlugin } from './plugin'
import type { TFile } from 'obsidian'

/**
 * Harness for `shouldFileBeIgnored`.
 *
 * The plugin extends Obsidian's `Plugin`, which is mocked as an empty class, so
 * an instance is built from the prototype and given only the collaborators this
 * method touches. That keeps the test focused on the decision logic rather than
 * on Obsidian's lifecycle.
 */
interface HarnessOptions {
    content?: string
    ignoredFolders?: string[]
    frontmatter?: Record<string, unknown> | undefined
    nextPossibleUpdates?: Map<string, Date>
}

const createPlugin = (options: HarnessOptions = {}) => {
    const cachedRead = mock(() => Promise.resolve(options.content ?? 'some content'))
    const read = mock(() => Promise.resolve(options.content ?? 'some content'))

    const plugin = Object.create(DataviewSerializerPlugin.prototype) as DataviewSerializerPlugin
    Object.assign(plugin, {
        app: {
            vault: { cachedRead, read },
            metadataCache: {
                getFileCache: () => ({ frontmatter: options.frontmatter })
            }
        },
        settings: { ignoredFolders: options.ignoredFolders ?? [] },
        nextPossibleUpdates: options.nextPossibleUpdates ?? new Map<string, Date>()
    })

    return { plugin, cachedRead, read }
}

const createFile = (path: string): TFile => {
    const name = path.split('/').pop() ?? path
    const extension = name.includes('.') ? name.split('.').pop()! : ''
    return { path, name, extension } as TFile
}

describe('DataviewSerializerPlugin.shouldFileBeIgnored', () => {
    describe('cheap rejections happen without reading the file', () => {
        it('should ignore a file with no path', async () => {
            const { plugin, cachedRead, read } = createPlugin()

            expect(await plugin.shouldFileBeIgnored(createFile(''))).toBe(true)
            expect(cachedRead).not.toHaveBeenCalled()
            expect(read).not.toHaveBeenCalled()
        })

        it('should ignore a non-markdown file without reading it', async () => {
            const { plugin, cachedRead, read } = createPlugin()

            expect(await plugin.shouldFileBeIgnored(createFile('folder/image.png'))).toBe(true)
            expect(cachedRead).not.toHaveBeenCalled()
            expect(read).not.toHaveBeenCalled()
        })

        it('should ignore the canvas file without reading it', async () => {
            const { plugin, cachedRead } = createPlugin()

            expect(await plugin.shouldFileBeIgnored(createFile('Canvas.md'))).toBe(true)
            expect(cachedRead).not.toHaveBeenCalled()
        })

        it('should ignore a frontmatter-opted-out file without reading it', async () => {
            const { plugin, cachedRead } = createPlugin({
                frontmatter: { dataview_serializer_ignore: true }
            })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'))).toBe(true)
            expect(cachedRead).not.toHaveBeenCalled()
        })

        it('should respect the frontmatter flag even on a forced run', async () => {
            const { plugin } = createPlugin({
                frontmatter: { dataview_serializer_ignore: true }
            })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'), true)).toBe(true)
        })
    })

    describe('content read', () => {
        it('should read through the cache rather than from disk', async () => {
            const { plugin, cachedRead, read } = createPlugin({ content: 'content' })

            await plugin.shouldFileBeIgnored(createFile('note.md'))

            expect(cachedRead).toHaveBeenCalledTimes(1)
            expect(read).not.toHaveBeenCalled()
        })

        it('should ignore an empty file', async () => {
            const { plugin } = createPlugin({ content: '' })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'))).toBe(true)
        })

        it('should ignore a whitespace-only file', async () => {
            const { plugin } = createPlugin({ content: '   \n\t  \n' })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'))).toBe(true)
        })

        it('should still ignore an empty file on a forced run', async () => {
            const { plugin } = createPlugin({ content: '' })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'), true)).toBe(true)
        })

        it('should not ignore a file with content', async () => {
            const { plugin } = createPlugin({ content: 'real content' })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'))).toBe(false)
        })
    })

    describe('recently updated files', () => {
        it('should ignore a file updated too recently', async () => {
            const nextPossibleUpdates = new Map([['note.md', add(new Date(), { seconds: 30 })]])
            const { plugin } = createPlugin({ nextPossibleUpdates })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'))).toBe(true)
        })

        it('should process a file whose cooldown has elapsed', async () => {
            const nextPossibleUpdates = new Map([['note.md', sub(new Date(), { seconds: 30 })]])
            const { plugin } = createPlugin({ nextPossibleUpdates })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'))).toBe(false)
        })

        it('should bypass the cooldown on a forced run', async () => {
            const nextPossibleUpdates = new Map([['note.md', add(new Date(), { seconds: 30 })]])
            const { plugin } = createPlugin({ nextPossibleUpdates })

            expect(await plugin.shouldFileBeIgnored(createFile('note.md'), true)).toBe(false)
        })
    })

    describe('ignored folders', () => {
        it('should ignore a file inside an ignored folder', async () => {
            const { plugin } = createPlugin({ ignoredFolders: ['Archive'] })

            expect(await plugin.shouldFileBeIgnored(createFile('Archive/note.md'))).toBe(true)
        })

        it('should not ignore a file outside the ignored folders', async () => {
            const { plugin } = createPlugin({ ignoredFolders: ['Archive'] })

            expect(await plugin.shouldFileBeIgnored(createFile('Notes/note.md'))).toBe(false)
        })

        it('should bypass ignored folders on a forced run', async () => {
            const { plugin } = createPlugin({ ignoredFolders: ['Archive'] })

            expect(await plugin.shouldFileBeIgnored(createFile('Archive/note.md'), true)).toBe(
                false
            )
        })
    })
})
