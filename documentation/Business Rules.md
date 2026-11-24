# Business Rules

Mandatory invariants. Change only with explicit user approval.

## Per-note ignore flag

When a note's YAML frontmatter contains the property `dataview_serializer_ignore` with a truthy value, the plugin MUST NOT serialize, refresh, auto-update, or otherwise mutate any queries inside it. This applies to:

- Automatic updates triggered by `create`, `modify`, `rename` events.
- Forced updates triggered by changes elsewhere in folders listed under "Folders to force update".
- The "Scan and serialize all Dataview queries" command (silent skip; the same code path that ignores configured folders).
- The "Scan and serialize Dataview queries in current file" command — MUST show a `Notice` explaining why nothing was done.
- The per-query refresh button (block and inline) — MUST show the same notice.
- `api.refreshNotes()` — no notice; the note is reported with outcome `ignored`.

Truthy means: boolean `true`, non-zero numbers, or any non-empty string that is not `false`, `no`, `n`, `0`, or `off` (case-insensitive, whitespace-trimmed). Arrays and objects are treated as truthy. Missing/`null`/`undefined` mean the note is processed normally.

The exact key is defined by `IGNORE_FRONTMATTER_KEY` in `src/app/constants.ts`. Underscores are used (not dashes) to keep the key compatible with Dataview field-access syntax (`file.dataview_serializer_ignore`).

Conversion and removal commands (`convert-dataview-query-at-cursor`, `convert-all-dataview-queries-in-file`, `remove-all-queries-in-current-file`, `insert-query-block`) are NOT subject to this rule: they only manipulate marker syntax, they do not run Dataview queries.

## Device-local disable flag

The per-device "Disable on this device" flag MUST be stored only in device-local storage via `app.loadLocalStorage`/`app.saveLocalStorage` (key `DEVICE_DISABLED_STORAGE_KEY` in `src/app/constants.ts`). It MUST NEVER be a member of `PluginSettings`, written to `data.json`, or otherwise synced — its entire purpose is to stay local to the device it is toggled on.

When the flag is set on a device, the plugin MUST be fully inert there: no file-event listeners registered, `processFile` short-circuits immediately (covering schedulers and any programmatic caller), all commands no-op with a notice, the per-query refresh buttons render nothing, and `api.refreshNotes()` runs nothing (state `disabled-on-device`, every note `not-run`). The flag is orthogonal to the synced `disableAutomaticUpdates` setting; when the device flag is cleared, event handlers are re-registered only if `disableAutomaticUpdates` is false.

## Periodic full serialization

The timer config (enabled flag and interval) MUST be stored only in device-local storage (key `PERIODIC_SERIALIZATION_STORAGE_KEY`), never in `PluginSettings` or `data.json`: several devices running it against a synced vault produce sync conflicts, so each device opts in on its own. Off by default; interval in whole minutes, at least `PERIODIC_SERIALIZATION_MIN_MINUTES` (5).

A tick is an automatic run over the "Folders to scan" scope (whole vault when empty), through `processFile` with `force=false` and `isManualTrigger=false`: ignored folders, the per-note ignore flag, the per-file cooldown, and manual/once query modes all apply, and only changed output is written. It is silent apart from error notices gated by `showErrorNotifications`, skips while the previous run is in progress, does nothing while the device-local disable is set, and is independent of `disableAutomaticUpdates`.

## Unresolved FROM references keep the previous output

When `skipQueriesWithUnresolvedReferences` is on (default), a DQL query (block or inline, every update mode) whose FROM clause has a positive source that does not resolve — `[[link]]` via `metadataCache.getFirstLinkpathDest` from the query's note, `"path"` via `vault.getAbstractFileByPath` as folder or file (also with `.md`) — MUST NOT be serialized: no Dataview call, previous output kept, nothing written for a never-serialized query, once-and-eject not ejected. Negated sources, tags, `[[]]` and `""` are never checked; DataviewJS is out of scope. Each run reports skips in one notice: manual runs always, automatic runs only with `showErrorNotifications` and once per skip per `UNRESOLVED_REFERENCE_NOTICE_COOLDOWN_MS`. Parsing lives in `extract-from-sources.fn.ts`. See [#88](https://github.com/dsebastien/obsidian-dataview-serializer/issues/88).

## Renames rewrite query references

When `updateQueriesOnRename` is on (default) and the plugin is not disabled on the device, a vault rename MUST rewrite, in the query comments of every affected note (block and inline definitions, every update mode and syntax, and the result header), the links and FROM paths that referenced the renamed note or folder; nothing outside query comments changes. Links: case-insensitive, anywhere in the query, matched on the old path (with or without `.md`) or a `/`-bounded suffix of it, skipped when they still resolve to another existing file; form kept (basename stays basename unless ambiguous, then full path; alias, heading, block kept). Quoted paths: FROM clause only, negated included, case-sensitive, exact or `old/` prefix (never a bare string prefix). Events are batched (quiet period `RENAME_BATCH_DELAY_MS`), each note is written at most once per batch through `Vault.process`, marked as a plugin write, then re-serialized like an automatic update (not when automatic updates are disabled). Notes with the per-note ignore flag or in ignored folders are skipped. DataviewJS is out of scope. One notice per batch. See [#87](https://github.com/dsebastien/obsidian-dataview-serializer/issues/87) and `documentation/Query references.md`.

## Query validation

"Validate all queries" (command) and `api.validateQueries()` are read-only and cover the full-scan scope (`foldersToScan`, minus ignored folders and notes with the per-note ignore flag). Unresolved references use the #88 rules (positive FROM sources only). A self-reference is a link (anywhere in the query) resolving to the note itself; only those without `#heading`/`#^block` are fixable, by replacing the link with `[[]]` in the definition and its result header through `Vault.process`, marked as a plugin write, then re-serialized like an automatic update. Quoted own paths are not self-references (`FROM "x.md"` is the note itself, `FROM [[]]` its backlinks). Dataview errors are only checked when asked (`runQueries`), since that runs every query. When the plugin is disabled on the device, the command no-ops with the usual notice and fixes write nothing; `api.validateQueries()` still works (no mutation). See [#89](https://github.com/dsebastien/obsidian-dataview-serializer/issues/89).

## Refresh API

`api.refreshNotes(paths)` re-serializes the given notes for a caller that must know which ones are up to date (e.g. before publishing them); its report is a contract other tools code against (`src/app/api.ts`, `docs/api.md`). `paths` not an array: reject with a `TypeError` naming `refreshNotes`.

- States, checked in this order before any note is processed (anything but `ready`: nothing runs, every note `not-run`): `disabled-on-device`; `dataview-not-loaded`; `dataview-index-not-ready` (`api.index.initialized` false: right after startup the index is partial and queries return lists with missing rows); `dataview-index-busy` (for some Markdown file of the vault, `index.pages.get(path).mtime` differs from `file.stat.mtime`, or the page is missing, still so after polling for `INDEX_WAIT_TIMEOUT_MS`; from `INDEX_RELOAD_DELAY_MS` into a wait, a note still stale is asked once to re-index through the public `index.reload(file)`, at most `MAX_RELOADS_PER_WAIT` per wait; the report names the first `STALE_PATHS_REPORTED` stale notes in `stalePaths`). A Dataview without these fields counts as ready and current. Callers must let Obsidian save and index their own edits first.
- Lookup: the exact path only (`getFileByPath`, then an exact `path` match in a map of `getMarkdownFiles()` built at most once per call). A path that only `normalizePath` would map to a note (U+00A0, U+202F, NFD, slashes) is `not-found` with `resolvedPath` null: it may name another note. One report entry per input path, in input order; each note is processed once per pass, however many entries lead to it.
- Forced (cooldown, "Folders to scan" and ignored folders do not apply) but MUST honor the per-note ignore flag; a note named `Canvas.md` and Excalidraw drawings (recognized while the Excalidraw plugin runs) are `ignored` too; an empty note is `no-queries`. Automatic query modes (manual queries and once queries with output are not run; once-and-eject always runs). Ignores `disableAutomaticUpdates`. DataviewJS follows `enableDataviewJS`; when off, each DataviewJS query that would run is reported in `skipped` and keeps its output. A later copy of a query (same query text, or same DataviewJS code) is never serialized and is reported in `skipped`.
- Reads the note from disk (`vault.read`), not the cache. An empty query result replaces an existing result block (empty block, a bare `>` line inside a blockquote); a query never serialized that returns nothing is left untouched and counts as current, so once queries stay open and once-and-eject queries (block and DataviewJS) are not ejected by an empty result. A query marker inside a result block is output, not a live query. Nothing outside the result blocks changes: a definition keeps its trailing spaces, the note keeps its final line end or its lack of one.
- A note with any failing query (query error, DataviewJS error, exception) MUST NOT be written by that pass and is `failed` with at least one error. Before writing, for every query that runs (current or not, empty or not), exactly one result block MUST follow its definition and no stale result block may follow it (a second block, or a block separated by a blank line); a placed block MUST be where it belongs; an ejected definition MUST be gone. Otherwise the query gets an error and the pass writes nothing. A refused write (different newer content) is `conflict`; a newer version that already holds the new text counts as `updated` (no write). The cooldown starts only after a write. No notice.
- Passes: when a pass wrote a note, wait for the index (same check, `indexWaitTimeout`: `INDEX_WAIT_TIMEOUT_MS` plus `INDEX_WAIT_PER_WRITE_MS` per note written, at most `INDEX_WAIT_MAX_MS`), then run another pass over the notes of the call that have queries, until a pass writes nothing, at most `MAX_REFRESH_PASSES` (3). `writes` counts every write of the call, so a `failed` note can have `writes` > 0. The outcome is the last pass's, `updated` if any pass wrote (a failure of the last pass stays `failed`). When the passes do not settle, the notes concerned get the error `UNSETTLED_MESSAGE` and are listed in `unsettledPaths`: the notes that still wrote in the last pass (a self-changing note never settles), or, when the index stays behind between passes, every note with queries that ran in the last pass.
- Shares the processing of `processFile` (`runFile` in `plugin.ts`, refresh mode). The other callers keep their behavior: partial writes on query errors, empty results left out, cache reads, notices, no placement check, duplicates silently ignored, markers in result blocks processed, definitions rebuilt and a final line end added on rewrite. The corrections listed below apply to them too.

Runs of one note never overlap, whoever starts them (`runFile` holds a lock keyed on the note's `TFile`, which survives a rename): an event run and an API run on the same note run one after the other.

### Corrections that change `processFile` for every caller

Made while building the refresh API; they apply to file events, commands, the refresh buttons, the schedulers and the API alike:

- The block regexes (`serialized-block-regexes.fn.ts`) accept spaces or tabs after the closing `-->` of a marker line and CRLF line ends. Before, such a definition or block was not matched: the query ran, then its block was left stale or a second block was inserted.
- Blocks are written with the note's own line ends (CRLF when the note holds any).
- A multi-line definition is matched on its original text in the "already serialized" check and the existing-block comparison. Before, a multi-line once query ran again on every update, and the old block of a multi-line query was not recognized.
- Runs of one note never overlap (the `TFile` lock above).
- A newer version that already holds exactly the serialized text is not a conflict: nothing is written and no cooldown starts.

## Queries inside code are examples

A query comment (block, inline, DataviewJS, both syntaxes, every update mode, result headers) or a ` ```dataview ` block / `` `=expr` `` span inside fenced code (` ``` ` or `~~~`, 3+ chars, CommonMark closing rules, nesting, unclosed to end of document, inside callouts) or inside inline code MUST be ignored everywhere: serialization (every trigger), refresh buttons and line decorations, validation and fixes, rename rewriting and the reference index, conversion, removal. A result block inside code is never rewritten or removed. Indented code (4+ spaces) is not code for this rule. Single implementation: `src/app/utils/code-ranges.fn.ts`. See [#91](https://github.com/dsebastien/obsidian-dataview-serializer/issues/91).

## Blockquote and callout integrity

When a query's indentation contains a blockquote marker, everything the plugin writes for that query MUST carry the same prefix: the result start and end markers, the serialized content, and the blank separator lines (written as a bare `>`, without trailing whitespace). A single unprefixed line terminates the blockquote and breaks the enclosing callout, which is the bug this rule exists to prevent.

An empty result inside a blockquote is written as a bare `>` line, never as an empty line.

Conversely, when the indentation contains no `>`, output and matching MUST stay byte-for-byte identical to what previous versions produced — plain whitespace indentation is applied to the content only, never to the markers. `getBlockquotePrefix` returning an empty string is the switch between the two behaviors.

See `documentation/Blockquotes and callouts.md` and [#64](https://github.com/dsebastien/obsidian-dataview-serializer/issues/64).

## Never overwrite a newer version of a note

Serializing queries is asynchronous, so a note can be rewritten by someone else between the read that feeds the serialization and the write that saves it: Templater rendering a note created from a template, a sync, a capture plugin, another plugin. The plugin MUST therefore write through `Vault.process` and compare, inside the callback, the content it is about to replace against the content the serialization was computed from. When they differ, the newer content MUST be kept and nothing written. The one case that is not a conflict: the newer content is already exactly the serialized text; then nothing is written either (the newer version stays), and the note counts as holding its output.

A skipped write MUST NOT start the update cooldown (`nextPossibleUpdates`). The write that overtook the run fires its own modify event, and that event has to be free to reprocess the note at once; throttling it would leave the note unserialized until the next unrelated edit.

The bug this rule exists to prevent: a plugin created a daily note from a template, this plugin read the raw template, Templater rendered the note, and the serialized version, built on the raw text, was written on top. The note ended up holding unrendered `<% %>` template code.
