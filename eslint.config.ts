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

export default defineConfig([
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    // @ts-expect-error - obsidianmd types are incomplete but the config works at runtime
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
            '@typescript-eslint/no-require-imports': 'off',
            // The community-plugin reviewer treats both the rule violation
            // and any `eslint-disable @typescript-eslint/no-explicit-any` as
            // an ERROR that blocks the scorecard. Catch locally as error,
            // not warn. See AGENTS.md "Community catalog review".
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-deprecated': 'off',
            // These are too strict for dynamic plugin APIs
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            // Obsidian methods are dynamically added to prototypes
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            'no-prototype-builtins': 'off',
            // Allow confirm for delete confirmations
            'no-alert': 'off',
            // Never disable obsidianmd/* rules here: the community catalog
            // reviewer runs its own ruleset against the git archive, so a
            // local disable only hides the finding until submission.
            // Brand names are the supported escape hatch for sentence-case.
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    brands: [
                        ...DEFAULT_BRANDS,
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
    },
    {
        // Tests are not shipped and are not scanned by the community scorecard.
        //
        // `unbound-method` guards against losing `this` when a method is passed
        // around; asserting on a mock's call record (`expect(api.pages)`) is not
        // that, and rewriting every assertion to dodge the rule would make the
        // tests worse. `no-tfile-tfolder-cast` wants an `instanceof TFile`
        // narrow, which is impossible in a test: a real TFile cannot be
        // constructed outside Obsidian.
        files: ['**/*.spec.ts'],
        rules: {
            '@typescript-eslint/unbound-method': 'off',
            'obsidianmd/no-tfile-tfolder-cast': 'off'
        }
    },
    {
        // The logger is the one place console access is the point. Everywhere
        // else `no-console` still applies, which is what keeps stray debugging
        // out of the shipped plugin.
        files: ['src/utils/log.ts'],
        rules: {
            'no-console': 'off'
        }
    }
])
