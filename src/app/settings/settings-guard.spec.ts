import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

/**
 * Source-level guard for the declarative settings API (Obsidian 1.13+).
 *
 * Nothing in CI renders a settings pane, so a broken settings control cannot
 * fail a normal test — five invisible controls once shipped through 2806
 * passing tests and two adversarial reviews elsewhere in this plugin
 * collection. This spec is the cheap partial
 * guard: it fails on the two patterns that caused every one of those bugs.
 *
 * - `group.listEl` — a `render:` hook writing outside its own row. The
 *   framework owns that DOM and discards the write; the control is simply
 *   not there at runtime.
 * - `settingEl.remove()` — deleting the row a `render:` hook would have
 *   drawn into. (`infoEl.remove()` is fine — that's the row's label block.)
 *
 * A live vault check remains the acceptance criterion for any settings
 * change; this spec only catches the known-fatal patterns early.
 */
describe('declarative settings guard', () => {
    test('no render hook writes outside its own row', async () => {
        const glob = new Glob('src/app/settings/**/*.ts')
        const offenders: string[] = []
        for await (const file of glob.scan({ cwd: `${import.meta.dir}/../../..` })) {
            if (file.endsWith('.spec.ts')) {
                continue
            }
            const raw = await Bun.file(`${import.meta.dir}/../../../${file}`).text()
            // Strip comments first: docs are allowed (encouraged, even) to
            // NAME the forbidden patterns; code is not allowed to USE them.
            const content = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
            if (/\.\s*listEl\b|\[\s*['"]listEl['"]\s*\]/.test(content)) {
                offenders.push(`${file}: accesses a group listEl`)
            }
            if (/settingEl\s*\.\s*remove\s*\(/.test(content)) {
                offenders.push(`${file}: removes settingEl`)
            }
        }
        expect(offenders).toEqual([])
    })
})
