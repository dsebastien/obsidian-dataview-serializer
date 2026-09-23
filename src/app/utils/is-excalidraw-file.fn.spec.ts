import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { isExcalidrawFile } from './is-excalidraw-file.fn'
import { TFile } from 'obsidian'

describe('isExcalidrawFile', () => {
    const mockTFile = (name: string): TFile =>
        Object.assign(new TFile(), {
            name,
            path: `folder/${name}`,
            basename: name.replace(/\.[^.]+$/, ''),
            extension: name.split('.').pop() || ''
        })

    describe('when ExcalidrawAutomate is not defined', () => {
        beforeEach(() => {
            // Ensure ExcalidrawAutomate is undefined
            if ('ExcalidrawAutomate' in self) {
                delete (self as unknown as Record<string, unknown>)['ExcalidrawAutomate']
            }
        })

        it('should return false for any file', () => {
            expect(isExcalidrawFile(mockTFile('test.md'))).toBe(false)
            expect(isExcalidrawFile(mockTFile('drawing.excalidraw.md'))).toBe(false)
            expect(isExcalidrawFile(mockTFile('image.png'))).toBe(false)
        })
    })

    describe('when ExcalidrawAutomate is defined', () => {
        let mockExcalidrawAutomate: { isExcalidrawFile: (file: TFile) => boolean }

        beforeEach(() => {
            mockExcalidrawAutomate = {
                isExcalidrawFile: (file: TFile) => file.name.includes('.excalidraw.')
            }
            ;(self as unknown as Record<string, unknown>)['ExcalidrawAutomate'] =
                mockExcalidrawAutomate
        })

        afterEach(() => {
            delete (self as unknown as Record<string, unknown>)['ExcalidrawAutomate']
        })

        it('should return true for excalidraw files', () => {
            expect(isExcalidrawFile(mockTFile('drawing.excalidraw.md'))).toBe(true)
            expect(isExcalidrawFile(mockTFile('sketch.excalidraw.png'))).toBe(true)
        })

        it('should return false for non-excalidraw files', () => {
            expect(isExcalidrawFile(mockTFile('test.md'))).toBe(false)
            expect(isExcalidrawFile(mockTFile('regular.png'))).toBe(false)
            expect(isExcalidrawFile(mockTFile('notes.txt'))).toBe(false)
        })
    })

    describe('when ExcalidrawAutomate.isExcalidrawFile returns custom logic', () => {
        beforeEach(() => {
            ;(self as unknown as Record<string, unknown>)['ExcalidrawAutomate'] = {
                isExcalidrawFile: (file: TFile) => file.extension === 'excalidraw'
            }
        })

        afterEach(() => {
            delete (self as unknown as Record<string, unknown>)['ExcalidrawAutomate']
        })

        it('should delegate to ExcalidrawAutomate.isExcalidrawFile', () => {
            expect(isExcalidrawFile(mockTFile('test.excalidraw'))).toBe(true)
            expect(isExcalidrawFile(mockTFile('test.md'))).toBe(false)
        })
    })
})
