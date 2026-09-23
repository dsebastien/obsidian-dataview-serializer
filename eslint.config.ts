import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'
import obsidianmd from 'eslint-plugin-obsidianmd'
// Passing `brands` REPLACES the plugin's default list rather than extending it
// (see sentenceCaseUtil.js: `options?.brands ?? DEFAULT_BRANDS`). Listing only
// this plugin's own names would therefore silently strip "Obsidian", "Git",
// "Markdown", "GitHub", "Windows" and the other 40-odd defaults — and the
// community catalog reviewer, which runs the plugin's own ruleset, would keep
// enforcing every one of them. The loss shows up as findings you never see
// locally, not as findings that go away.
// Deep path because the package exports only its default plugin object; it is
// pinned exactly, and a break here is a loud module-resolution error, never a
// silent shrinking of the list.
import { DEFAULT_BRANDS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js'
import { defineConfig } from 'eslint/config'

// eslint-plugin-obsidianmd 0.4.x lowered these rules from error to warn in its
// recommended preset. --max-warnings 0 would still fail on them, but the rule
// floor (rules-baseline.json) guards the RESOLVED severity, and a warn is one
// config edit away from being ignored. Keep them at error, with the preset's
// own options, so upgrading the plugin never weakens the floor.
const PRESET_WARNINGS_KEPT_AT_ERROR = [
    'no-undef',
    'no-implicit-globals',
    'no-restricted-globals',
    '@typescript-eslint/no-unused-expressions',
    // Carries moment, the one restricted import the core rule cannot hold
    // (it needs allowTypeImports); at warn, a value import of moment would
    // sit below the floor.
    '@typescript-eslint/no-restricted-imports',
    '@microsoft/sdl/no-document-write',
    '@microsoft/sdl/no-inner-html',
    'import/no-extraneous-dependencies',
    'obsidianmd/commands/no-command-in-command-id',
    'obsidianmd/commands/no-command-in-command-name',
    'obsidianmd/commands/no-default-hotkeys',
    'obsidianmd/commands/no-plugin-id-in-command-id',
    'obsidianmd/commands/no-plugin-name-in-command-name',
    'obsidianmd/vault/iterate',
    'obsidianmd/hardcoded-config-path',
    'obsidianmd/no-tfile-tfolder-cast',
    'obsidianmd/object-assign',
    'obsidianmd/prefer-abstract-input-suggest',
    'obsidianmd/validate-manifest',
    'obsidianmd/validate-license'
] as const

/** The obsidianmd preset's own entry for a rule, or undefined. */
const presetEntry = (rule: string): unknown => {
    let entry: unknown
    for (const config of obsidianmd.configs['recommended']) {
        const value = (config as { rules?: Record<string, unknown> }).rules?.[rule]
        if (value !== undefined) {
            entry = value
        }
    }
    return entry
}

/**
 * The preset's rules raised to error with their options intact. A rule the
 * preset stops configuring is skipped rather than thrown on: this config also
 * loads in the community catalog reviewer's environment, where a throw fails
 * the whole review. rules:check reports the vanished rule instead.
 */
const keptAtError = Object.fromEntries(
    PRESET_WARNINGS_KEPT_AT_ERROR.flatMap((rule) => {
        const entry = presetEntry(rule)
        if (entry === undefined) {
            return []
        }
        return [
            [rule, Array.isArray(entry) ? ['error', ...(entry.slice(1) as unknown[])] : 'error']
        ]
    })
)

/**
 * The preset's restricted-import list for the core rule. Entries that rely
 * on allowTypeImports (moment) stay with the @typescript-eslint variant only:
 * the core rule has no such option, so it would report the type-only import
 * the message itself recommends.
 */
const coreRestrictedImports = (): unknown[] => {
    const entry = presetEntry('@typescript-eslint/no-restricted-imports')
    const paths: unknown[] = Array.isArray(entry) ? (entry.slice(1) as unknown[]) : []
    return paths.filter(
        (path) => !(typeof path === 'object' && path !== null && 'allowTypeImports' in path)
    )
}

export default defineConfig([
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...obsidianmd.configs['recommended'],
    eslintConfigPrettier,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            'scripts/**',
            '.cz-config.cjs',
            'prettier.config.cjs',
            'package.json'
        ]
    },
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
                // Tests and build tooling run under the Bun runtime
                Bun: 'readonly',
                // Obsidian global functions
                createDiv: 'readonly',
                createEl: 'readonly',
                createSpan: 'readonly',
                createFragment: 'readonly',
                // Obsidian popout-window-aware globals
                activeWindow: 'readonly',
                activeDocument: 'readonly'
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'error',
            // The community-plugin reviewer treats both the rule violation
            // and any `eslint-disable @typescript-eslint/no-explicit-any` as
            // an ERROR that blocks the scorecard. Catch locally as error,
            // not warn. See AGENTS.md "Community catalog review".
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            // Nothing is switched off here: fix the finding, or scope a
            // reasoned exemption to the one file that needs it and let the
            // rule floor (rules-baseline.json) show it in review.
            '@typescript-eslint/ban-ts-comment': 'error',
            // Also reports Obsidian API deprecations. A replacement API may be
            // newer than minAppVersion: check before swapping, and raise the
            // floor (versions.json records it) only if the plugin needs it.
            '@typescript-eslint/no-deprecated': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-enum-comparison': 'error',
            // The preset switches both off; the core variant stays off only
            // because @typescript-eslint/require-await replaces it.
            '@typescript-eslint/require-await': 'error',
            'prefer-const': 'error',
            'no-prototype-builtins': 'error',
            'no-alert': 'error',
            ...keptAtError,
            // keptAtError copies the preset's options, and 0.4.x allows short
            // circuits and ternaries as statements. Before the upgrade both
            // were errors; keep them errors.
            '@typescript-eslint/no-unused-expressions': [
                'error',
                { allowShortCircuit: false, allowTernary: false, allowTaggedTemplates: false }
            ],
            // 0.4.x switched these three off in favour of replacements, which
            // stay on: no-console -> obsidianmd/rule-custom-message,
            // no-restricted-imports -> @typescript-eslint/no-restricted-imports,
            // import/no-nodejs-modules -> obsidianmd/no-nodejs-modules. The
            // originals stay on too, so the floor never records an `off`.
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
            'no-restricted-imports': ['error', ...coreRestrictedImports()],
            // Mobile safety, so it follows the preset's own reading of the
            // manifest: a desktop-only plugin (isDesktopOnly) may import Node
            // modules, and the preset turns obsidianmd/no-nodejs-modules off
            // for it. Every other plugin gets the core rule at error.
            'import/no-nodejs-modules':
                presetEntry('obsidianmd/no-nodejs-modules') === 'off' ? 'off' : 'error',
            // The preset ships these two off; nothing here gets switched off.
            'no-new-func': 'error',
            'obsidianmd/prefer-active-doc': 'error',
            // Never disable obsidianmd/* rules here: the community catalog
            // reviewer runs its own ruleset against the git archive, so a
            // local disable only hides the finding until submission.
            // Brand names are the supported escape hatch for sentence-case.
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    brands: [
                        // 'Cursor' (the editor, a 0.4 default brand) is dropped:
                        // here "cursor" is the editor caret in command names.
                        ...DEFAULT_BRANDS.filter((brand) => brand !== 'Cursor'),
                        // Author and funding links. Add this plugin's own
                        // product names here; do NOT add ordinary UI words such
                        // as 'Settings' — as a brand it makes every lowercase
                        // occurrence a violation.
                        'Knowii',
                        'GitHub Sponsors',
                        'Sébastien Dubois',
                        'dSebastien',
                        // The plugin this one reads from. Deliberately NOT
                        // 'Dataview Serializer': brand casing is enforced BOTH
                        // ways, and this plugin's own copy writes "Dataview
                        // serializer block" / "Dataview serializer queries"
                        // with a lowercase s.
                        'Dataview',
                        // Proper nouns this plugin's settings copy names.
                        'Jekyll',
                        'Personal Knowledge Management'
                    ],
                    // Quoted strings are UI labels, query snippets and setting
                    // names being referenced, not sentences to be recased.
                    ignoreRegex: ['"[^"]+"'],
                    // Literal markers this plugin writes into notes. Not
                    // `acronyms`, which would REPLACE the rule's default list
                    // the same way `brands` does.
                    ignoreWords: ['END']
                }
            ]
        }
    }
])
