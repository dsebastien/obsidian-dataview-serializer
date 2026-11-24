---
title: API
nav_order: 4
---

# API

The plugin exposes a small API for scripts (Templater, QuickAdd, the developer console) and AI agents:

```js
const api = app.plugins.plugins['dataview-serializer'].api
```

Results are plain objects, safe to log or serialize as JSON.

## `validateQueries(options?)`

Runs the same checks as the [Validate all queries](usage.md#validate-all-queries) command, without opening the modal. Read-only.

```js
const report = await api.validateQueries()
// Only some notes, and also run each query through Dataview (slow):
const detailed = await api.validateQueries({
    paths: ['Projects/Dashboard.md'],
    runQueries: true
})
```

Options:

- `runQueries` (default `false`): also run every query through Dataview and report its errors. Slow on large vaults.
- `paths`: only validate these notes (vault paths). Default: every note in scope ("Folders to scan", minus ignored folders and notes with the per-note ignore flag).

Returns:

```js
{
    notesScanned: 1200,
    queriesScanned: 1450,
    ranQueries: false,
    problemCount: 3,
    notes: [
        {
            path: 'Goals/Plan.md',
            issues: [
                {
                    query: 'LIST FROM #type/plan AND [[Old goal]]',
                    queryType: 'block', // or 'inline'
                    problems: [
                        {
                            type: 'unresolved-link', // 'unresolved-path' | 'self-reference' | 'dataview-error'
                            reference: '[[Old goal]]', // absent for 'dataview-error'
                            message: '[[Old goal]] does not resolve to any note'
                        }
                    ]
                }
            ]
        }
    ]
}
```

`self-reference` problems also carry `fixable: true` when `fixSelfReferences` can replace them.

## `fixSelfReferences(path, query?)`

Replaces the self-references written by name (`[[My note]]` inside `My note`) in the queries of a note with `[[]]`, updates the `SerializedQuery` header, then re-serializes the queries (unless automatic updates are disabled). Links with a `#heading` or `#^block` part are left alone.

```js
const fixed = await api.fixSelfReferences('People/Alice.md')
// Only one query, using the text reported by validateQueries:
await api.fixSelfReferences('People/Alice.md', 'LIST FROM [[Alice]]')
```

Returns the number of queries changed: `0` when nothing matched, when the note is excluded (ignore flag, ignored folder), or when the plugin is disabled on this device.

## `refreshNotes(paths)`

Re-serializes the queries of the given notes now, and reports exactly what happened to each one. Made for tools that must know which notes are up to date before they use them, such as a publishing tool that refreshes the notes it is about to publish.

```js
const report = await api.refreshNotes(['Projects/Dashboard.md', 'People/Alice.md'])
if (report.state !== 'ready') {
    // Nothing ran: see "States" below. For the index states, try again a little later.
}
// Up to date: every query of the note ran (or the note has none), nothing failed or was skipped
const refreshed = report.notes.filter(
    (note) =>
        ['updated', 'unchanged', 'no-queries'].includes(note.outcome) &&
        note.errors.length === 0 &&
        note.skipped.length === 0
)
```

It runs like an automatic update, without the throttles:

- The cooldown, "Folders to scan" and the ignored folders do not apply. The per-note ignore flag does.
- Manual queries, and once queries that already have output, are not run again.
- It runs even when automatic updates are disabled. DataviewJS queries run only when DataviewJS support is on; otherwise they keep their output and are listed in `skipped`.
- It reads the notes from disk, not from Obsidian's cache.
- An empty result replaces the previous output (an empty block), so the note always holds the current result. A once-and-eject query with an empty result is ejected.
- A note with a failing query is not written at all, not even the output of its other queries.
- It waits for other runs on the same note (a file event, a command) to finish first.
- It shows no notice.

**Before you call it, let Obsidian save and index your own edits.** Dataview indexes a saved note a moment later. `refreshNotes` waits up to about 5 seconds for Dataview to index every saved note of the vault; if Dataview is still behind, nothing runs and `state` is `dataview-index-busy`.

`paths` must be an array; anything else rejects with a `TypeError`.

Returns:

```js
{
    state: 'ready',
    notes: [
        // Exactly one entry per given path, in the same order (duplicates kept)
        {
            path: 'Projects/Dashboard.md', // as given
            resolvedPath: 'Projects/Dashboard.md', // the note it found, or null
            outcome: 'updated',
            errors: [],
            skipped: [
                {
                    query: 'LIST FROM [[Old goal]]',
                    reason: 'Unresolved FROM references: [[Old goal]]. The previous output was kept.'
                }
            ]
        }
    ]
}
```

States (checked in this order; anything but `ready` means nothing ran and every note is `not-run`):

- `disabled-on-device`: the plugin is disabled on this device.
- `dataview-not-loaded`: Dataview is disabled or reloading.
- `dataview-index-not-ready`: Dataview is still indexing the vault, which happens just after Obsidian starts. Queries run at that time return incomplete results.
- `dataview-index-busy`: Dataview has not indexed the latest saved version of every note, after waiting about 5 seconds (recent edits, a sync). Queries would run against old data.
- `ready`: the notes were processed.

Outcomes:

- `updated`: the note had queries to run, none failed, and the new output was written (or the note already held exactly that text).
- `unchanged`: the note had queries to run, none failed, and the note already held their output.
- `no-queries`: the note holds no query that a refresh runs (none at all, or only manual and once queries that are not run again), or is empty.
- `ignored`: the per-note ignore flag excludes the note, or the serializer never processes that kind of file (a note named `Canvas.md`, an Excalidraw drawing).
- `not-found`: there is no Markdown file at that path.
- `conflict`: the note changed during the refresh, so the write was refused and the newer version kept.
- `failed`: a query failed or an error occurred. Nothing was written. `errors` lists the failures; an error that is not tied to a query has `query: ''`.
- `not-run`: `state` is not `ready`.

`skipped` lists the queries left untouched on purpose, which keep their previous output: a query whose FROM source does not exist (see **Skip queries that reference missing notes or folders** in [Configuration](configuration.md#general-settings)), or a DataviewJS query while DataviewJS support is off. A note can be `updated` or `unchanged` and still have skipped queries: check `skipped` when every query must have run.

`resolvedPath` is the vault path of the note the entry is about (`null` for `not-found` and `not-run`). The exact path is looked up first; if no note has it, the path is normalized as Obsidian does (non-breaking spaces become spaces, Unicode is composed), so `resolvedPath` can differ from `path`. Two paths that lead to the same note are processed once and both entries show that note.
