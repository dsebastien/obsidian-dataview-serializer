# Query references

How the plugin reads the links and paths written in queries, and keeps them right when notes or folders are renamed.

## Parsing

- `src/app/utils/extract-from-sources.fn.ts`: tokenizer for DQL query text. `findQueryReferences(query)` returns every link (`[[…]]`, anywhere in the query) and every quoted path of the FROM clause, with offsets, `inFrom`, and `negated`. `extractPositiveFromSources` (#88) is a filter on top of it.
- `src/app/utils/query-comments.fn.ts`: `findQueryComments(content)` locates query comments: block definitions (all flags, both syntaxes, multi-line), inline definitions (`IQ` family), and result headers (`SerializedQuery:` / `dataview-serializer-result:`). DataviewJS is excluded. `rewriteQueryComments(content, rewriter)` replaces references in place; everything else is kept byte for byte (CRLF included).

## Code blocks (#91)

`src/app/utils/code-ranges.fn.ts`: `findCodeRanges(text)` returns the fenced code blocks and inline code spans of a note as sorted `[start, end)` offsets, in one linear pass (fast path: no backtick and no `~~~`, no work). Lookups: `isInsideCode` (binary search), `isNestedInCode` (for constructs that are code themselves: ` ```dataview `, `` `=expr` ``). Regex helpers used by the serializer: `matchOutsideCode`, `replaceOutsideCode` (rescans from `index + 1` after a skipped match, so a lazy match starting in code cannot swallow a live one), `indexOfOutsideCode`.

Consumers filter on the offset of the comment opener: `findQueries`, `findDataviewJSQueries`, `findInlineQueries`, `findRawInlineQueries`, `findQueryComments` (hence validation, rename rewriting, the index), `findDataviewCodeblocks`/`findDataviewInlineQueries`, `removeAllQueries`, the result-block regex matching in `plugin.ts` and `serialized-block-regexes.fn.ts`, and `refresh-button-extension.ts` (ranges cached per CodeMirror `Text`, computed only when a marker is in view).

Decisions (module header has the full list): any leading whitespace before a fence is accepted (fences in list items; lists are not parsed); 4-space indented code blocks are not code (list continuation lines would hide live queries); inline spans do not cross lines; HTML comments are opaque (backticks in a query comment never open a span; a multi-line comment suspends fence detection), so DataviewJS template literals are safe.

## Rename rewriting (#87)

- Pure rules: `src/app/utils/rewrite-renamed-references.fn.ts` (`rewriteReferenceForRename`, `rewriteQueryCommentsForRenames`, `collapseRenames`, notice text). Matching rules are in its header and in `Business Rules.md`.
- Link resolution is injected (`LinkResolver`): the plugin passes `metadataCache.getFirstLinkpathDest(linkpath, notePath)`. It is used to (a) skip links that still resolve to another file and (b) pick basename vs full-path form for the new link.
- Runtime: `src/app/rename-query-updater.ts` (`RenameQueryUpdater`), started/stopped by `plugin.applyRenameQueryUpdater()` from the setting and the device-local disable.

### Index

`src/app/utils/query-reference-index.ts`: `Map<note, Set<key>>` plus the inverse `Map<key, Set<note>>`. Keys: `l:<lowercased link path>`, `p:<path>`. Only notes with at least one non-empty reference are stored.

- Built in the background when the updater starts (layout ready): `getMarkdownFiles()` read with `cachedRead` in chunks of `QUERY_REFERENCE_INDEX_CHUNK_SIZE`, yielding between chunks. A rename batch awaits the build.
- Maintained from vault events: `modify`/`create` re-read the note after a `RENAME_BATCH_DELAY_MS` debounce; `delete` drops the note (or folder subtree); `rename` moves entries synchronously (folder renames move the subtree, so per-file event order does not matter).
- Lookup: a batch tests each distinct key against each rename (`referenceMayMatchRename`), not each note.
- Measured on the author's vault (30.2k notes, 13.2k with query comments): 1.2k notes hold references, 273 distinct keys; parsing all notes ≈ 0.25 s CPU (disk reads excluded), lookup ≈ 1 ms.

### Batching

Rename events (a folder rename fires one per descendant plus one for the folder) are queued; after `RENAME_BATCH_DELAY_MS` of quiet the queue is collapsed (`A→B, B→C` = `A→C`, no-ops dropped) and processed as one batch, serialized after any previous batch. Per affected note, only the renames concerning it are applied, inside one `vault.process` call (reads the latest content, so Obsidian's own link updates are kept). The note is marked via `filesToIgnoreFileEvents` before the write, then re-serialized with `processFile(file, force=true)` unless automatic updates are disabled.

`RENAME_SETTLE_RECHECK_MS` later, the batch is reapplied to the notes it wrote (idempotent), in case a concurrent writer (e.g. Obsidian's link updater working from older content) overwrote the change. Skipped if another rename happened since, so renaming back is never undone.

## Validation (#89)

- Pure: `src/app/utils/validate-queries.fn.ts`: `findValidatableQueries` (block queries of a supported type and inline expressions, whitespace-normalized like `findQueries`, blockquote markers stripped), `validateQuery` (unresolved positive FROM sources via `findUnresolvedFromSources`, self-references via `findQueryReferences`), `fixSelfReferences` (via `rewriteQueryComments`, optionally limited to one query).
- Runtime: `src/app/query-validator.ts` (`QueryValidator`): reads notes with `cachedRead` in chunks, resolves with `metadataCache.getFirstLinkpathDest` / `vault.getAbstractFileByPath`. `runQueries` adds Dataview errors: `dataviewApi.query` for block queries, `serializeInlineQuery` for inline ones, one note at a time. Dataview's public API has no parse-only entry point (bundling its parser would add ~300 KB), so errors cannot be detected without running queries; hence opt-in.
- UI: `src/app/ui/query-validation-modal.ts`; styles in `src/styles.src.css` (`dvs-validation-*`).
- API: `src/app/api.ts` (`DataviewSerializerApi`), exposed as `plugin.api`; user docs in `docs/api.md`.
