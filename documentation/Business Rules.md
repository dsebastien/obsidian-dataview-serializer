# Business Rules

Mandatory invariants. Change only with explicit user approval.

## Per-note ignore flag

When a note's YAML frontmatter contains the property `dataview_serializer_ignore` with a truthy value, the plugin MUST NOT serialize, refresh, auto-update, or otherwise mutate any queries inside it. This applies to:

- Automatic updates triggered by `create`, `modify`, `rename` events.
- Forced updates triggered by changes elsewhere in folders listed under "Folders to force update".
- The "Scan and serialize all Dataview queries" command (silent skip; the same code path that ignores configured folders).
- The "Scan and serialize Dataview queries in current file" command — MUST show a `Notice` explaining why nothing was done.
- The per-query refresh button (block and inline) — MUST show the same notice.

Truthy means: boolean `true`, non-zero numbers, or any non-empty string that is not `false`, `no`, `n`, `0`, or `off` (case-insensitive, whitespace-trimmed). Arrays and objects are treated as truthy. Missing/`null`/`undefined` mean the note is processed normally.

The exact key is defined by `IGNORE_FRONTMATTER_KEY` in `src/app/constants.ts`. Underscores are used (not dashes) to keep the key compatible with Dataview field-access syntax (`file.dataview_serializer_ignore`).

Conversion and removal commands (`convert-dataview-query-at-cursor`, `convert-all-dataview-queries-in-file`, `remove-all-queries-in-current-file`, `insert-query-block`) are NOT subject to this rule: they only manipulate marker syntax, they do not run Dataview queries.

## Device-local disable flag

The per-device "Disable on this device" flag MUST be stored only in device-local storage via `app.loadLocalStorage`/`app.saveLocalStorage` (key `DEVICE_DISABLED_STORAGE_KEY` in `src/app/constants.ts`). It MUST NEVER be a member of `PluginSettings`, written to `data.json`, or otherwise synced — its entire purpose is to stay local to the device it is toggled on.

When the flag is set on a device, the plugin MUST be fully inert there: no file-event listeners registered, `processFile` short-circuits immediately (covering schedulers and any programmatic caller), all commands no-op with a notice, and the per-query refresh buttons render nothing. The flag is orthogonal to the synced `disableAutomaticUpdates` setting; when the device flag is cleared, event handlers are re-registered only if `disableAutomaticUpdates` is false.

## Periodic full serialization

The timer config (enabled flag and interval) MUST be stored only in device-local storage (key `PERIODIC_SERIALIZATION_STORAGE_KEY`), never in `PluginSettings` or `data.json`: several devices running it against a synced vault produce sync conflicts, so each device opts in on its own. Off by default; interval in whole minutes, at least `PERIODIC_SERIALIZATION_MIN_MINUTES` (5).

A tick is an automatic run over the "Folders to scan" scope (whole vault when empty), through `processFile` with `force=false` and `isManualTrigger=false`: ignored folders, the per-note ignore flag, the per-file cooldown, and manual/once query modes all apply, and only changed output is written. It is silent apart from error notices gated by `showErrorNotifications`, skips while the previous run is in progress, does nothing while the device-local disable is set, and is independent of `disableAutomaticUpdates`.

## Unresolved FROM references keep the previous output

When `skipQueriesWithUnresolvedReferences` is on (default), a DQL query (block or inline, every update mode) whose FROM clause has a positive source that does not resolve — `[[link]]` via `metadataCache.getFirstLinkpathDest` from the query's note, `"path"` via `vault.getAbstractFileByPath` as folder or file (also with `.md`) — MUST NOT be serialized: no Dataview call, previous output kept, nothing written for a never-serialized query, once-and-eject not ejected. Negated sources, tags, `[[]]` and `""` are never checked; DataviewJS is out of scope. Each run reports skips in one notice: manual runs always, automatic runs only with `showErrorNotifications` and once per skip per `UNRESOLVED_REFERENCE_NOTICE_COOLDOWN_MS`. Parsing lives in `extract-from-sources.fn.ts`. See [#88](https://github.com/dsebastien/obsidian-dataview-serializer/issues/88).

## Renames rewrite query references

When `updateQueriesOnRename` is on (default) and the plugin is not disabled on the device, a vault rename MUST rewrite, in the query comments of every affected note (block and inline definitions, every update mode and syntax, and the result header), the links and FROM paths that referenced the renamed note or folder; nothing outside query comments changes. Links: case-insensitive, anywhere in the query, matched on the old path (with or without `.md`) or a `/`-bounded suffix of it, skipped when they still resolve to another existing file; form kept (basename stays basename unless ambiguous, then full path; alias, heading, block kept). Quoted paths: FROM clause only, negated included, case-sensitive, exact or `old/` prefix (never a bare string prefix). Events are batched (quiet period `RENAME_BATCH_DELAY_MS`), each note is written at most once per batch through `Vault.process`, marked as a plugin write, then re-serialized like an automatic update (not when automatic updates are disabled). Notes with the per-note ignore flag or in ignored folders are skipped. DataviewJS is out of scope. One notice per batch. See [#87](https://github.com/dsebastien/obsidian-dataview-serializer/issues/87) and `documentation/Query references.md`.

## Blockquote and callout integrity

When a query's indentation contains a blockquote marker, everything the plugin writes for that query MUST carry the same prefix: the result start and end markers, the serialized content, and the blank separator lines (written as a bare `>`, without trailing whitespace). A single unprefixed line terminates the blockquote and breaks the enclosing callout, which is the bug this rule exists to prevent.

Conversely, when the indentation contains no `>`, output and matching MUST stay byte-for-byte identical to what previous versions produced — plain whitespace indentation is applied to the content only, never to the markers. `getBlockquotePrefix` returning an empty string is the switch between the two behaviors.

See `documentation/Blockquotes and callouts.md` and [#64](https://github.com/dsebastien/obsidian-dataview-serializer/issues/64).

## Never overwrite a newer version of a note

Serializing queries is asynchronous, so a note can be rewritten by someone else between the read that feeds the serialization and the write that saves it: Templater rendering a note created from a template, a sync, a capture plugin, another plugin. The plugin MUST therefore write through `Vault.process` and compare, inside the callback, the content it is about to replace against the content the serialization was computed from. When they differ, the newer content MUST be kept and nothing written.

A skipped write MUST NOT start the update cooldown (`nextPossibleUpdates`). The write that overtook the run fires its own modify event, and that event has to be free to reprocess the note at once; throttling it would leave the note unserialized until the next unrelated edit.

The bug this rule exists to prevent: a plugin created a daily note from a template, this plugin read the raw template, Templater rendered the note, and the serialized version, built on the raw text, was written on top. The note ended up holding unrendered `<% %>` template code.
