import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

/**
 * Guard for the `paths` aliases in tsconfig.json.
 *
 * obsidian-dataview's own .d.ts files import their modules by bare,
 * baseUrl-relative specifiers, so `tsconfig.json` maps those prefixes back into
 * the package to stop every `DataviewApi` type degrading to `error`. The
 * prefixes are generic — `api/*`, `ui/*`, `settings`, `index` — which means the
 * mapping is global, not dataview-scoped.
 *
 * The hazard: a source file importing a bare `settings` or `api/thing` would be
 * type-checked against Dataview internals while resolving to something else at
 * runtime. Types would agree, behaviour would not, and nothing would complain.
 *
 * Every local import in this repo is relative, so this spec is a tripwire, not
 * a fix. If it ever fails, either rename the import or drop the alias it
 * collides with.
 */
const ALIASED_PREFIXES = [
    'api',
    'data-import',
    'data-index',
    'data-model',
    'expression',
    'query',
    'ui'
]
const ALIASED_EXACT = ['settings', 'index']

describe('tsconfig paths aliases', () => {
    test('no source file imports a specifier the dataview aliases capture', async () => {
        const offenders: string[] = []
        const importPattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

        for (const dir of ['src', 'scripts']) {
            const glob = new Glob(`${dir}/**/*.ts`)
            for await (const file of glob.scan({ cwd: `${import.meta.dir}/../../..` })) {
                const content = await Bun.file(`${import.meta.dir}/../../../${file}`).text()
                for (const match of content.matchAll(importPattern)) {
                    const specifier = match[1]
                    if (specifier === undefined) {
                        continue
                    }
                    const prefix = specifier.split('/')[0]
                    if (prefix === undefined) {
                        continue
                    }
                    const captured =
                        ALIASED_EXACT.includes(specifier) ||
                        (specifier.includes('/') && ALIASED_PREFIXES.includes(prefix))
                    if (captured) {
                        offenders.push(`${file}: imports '${specifier}'`)
                    }
                }
            }
        }

        expect(offenders).toEqual([])
    })
})
