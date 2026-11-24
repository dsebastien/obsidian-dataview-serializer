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
// Each write fires one file event
const fileEvents = report.notes.reduce((total, note) => total + note.writes, 0)
```

It runs like an automatic update, without the throttles:

- The cooldown, "Folders to scan" and the ignored folders do not apply. The per-note ignore flag does.
- Manual queries, and once queries that already have output, are not run again.
- It runs even when automatic updates are disabled. DataviewJS queries run only when DataviewJS support is on; otherwise they keep their output and are listed in `skipped`.
- It reads the notes from disk, not from Obsidian's cache.
- A query that returns nothing clears its existing result block, so the note always holds the current result. A query that was never serialized and returns nothing is left as it is (it shows nothing either way): a once query stays open, a once-and-eject query (block or DataviewJS) is not ejected. An inline query that returns nothing shows `-`.
- Only the first copy of a query is serialized when the same query text appears more than once in a note; the later copies keep their output and are listed in `skipped`.
- A query marker inside a result block is part of that output (a task that holds an inline query, say), not a live query: it is left alone.
- It changes nothing outside the result blocks: a query line keeps its trailing spaces, and the end of the note keeps its final line end, or its lack of one.
- A note with a failing query is not written at all, not even the output of its other queries. The same goes for an output that cannot be put in its place, and for a query followed by a stale result block (a second block, or an old one separated from it by a blank line): the note is `failed`, so you can remove the extra block by hand.
- It waits for other runs on the same note (a file event, a command) to finish first.
- It shows no notice.

**Before you call it, let Obsidian save and index your own edits.** Dataview indexes a saved note a moment later. `refreshNotes` waits up to about 5 seconds for Dataview to index every saved note of the vault, and, from 2 seconds into the wait, asks Dataview to index again the notes that stay behind (up to 50 per wait). If Dataview is still behind, nothing runs, `state` is `dataview-index-busy`, and `stalePaths` names the first notes still behind. They can be any notes of the vault, not only the notes of the call. If the same note stays stale call after call, save it again (an edit is enough) or restart Obsidian, so that Dataview indexes it anew.

**Notes of one call that list each other.** When a refresh writes a note, a list in another note of the same call may not show the change yet: Dataview has not indexed the write. So, after a pass that wrote something, `refreshNotes` waits for Dataview (5 seconds plus 50 ms per note written, at most 30 seconds) and runs another pass over the notes of the call, until a pass writes nothing (at most 3 passes). `writes` counts the writes of every pass.

If the passes do not settle, that is if the last pass still wrote a note (the third pass, or a pass after which Dataview stayed behind), no later pass shows that write to the other notes. So every note with queries that ran in that last pass, changed or not, gets an error that starts with `Not settled` and is listed in `unsettledPaths`: it may list an older version of a note written then. Two causes:

- A chain of notes that list each other, longer than the passes (N2 lists N1, N3 lists N2, N4 lists N3, and so on), or Dataview staying behind. Call `refreshNotes` again.
- A note that changes on every run, for example one that shows the current time (`<!-- IQ: =date(now) -->`) or its own modification time. It writes in every pass, so it never settles, and it marks every note of its call that ran in the last pass. Refresh it alone, or refresh the other notes without it.

**How long it can take.** Up to about 5 seconds of index wait before the first pass; then for each of up to 3 passes: the queries (a DataviewJS query stops after 5 seconds; a block or inline query has no time limit), any wait for other runs on the same note (no time limit), and an index wait of up to 30 seconds. A call that writes nothing runs one pass.

**When the outcome is `conflict`**, the note changed while it was refreshed (you, a sync, another plugin). Call `refreshNotes` again for that note.

`paths` must be an array; anything else rejects with a `TypeError`. An entry that is not a string is `not-found`. Each path must be the exact vault path of the note: a path that differs only in its form (a non-breaking space for a space, decomposed accents, extra slashes) is `not-found`, because it can name another note.

Returns:

```js
{
    state: 'ready',
    notes: [
        // Exactly one entry per given path, in the same order (duplicates kept)
        {
            path: 'Projects/Dashboard.md', // as given
            resolvedPath: 'Projects/Dashboard.md', // the note found, or null
            outcome: 'updated',
            writes: 1, // times this call wrote the note's file
            errors: [],
            skipped: [
                {
                    query: 'LIST FROM [[Old goal]]',
                    reason: 'Unresolved FROM references: [[Old goal]]. The previous output was kept.'
                }
            ]
        }
    ]
    // stalePaths: with 'dataview-index-busy' only
    // unsettledPaths: with 'ready' only, when some notes did not settle
}
```

States (checked in this order; anything but `ready` means nothing ran and every note is `not-run`):

- `disabled-on-device`: the plugin is disabled on this device.
- `dataview-not-loaded`: Dataview is disabled or reloading.
- `dataview-index-not-ready`: Dataview is still indexing the vault, which happens just after Obsidian starts. Queries run at that time return incomplete results.
- `dataview-index-busy`: Dataview has not indexed the latest saved version of every note, after waiting about 5 seconds (recent edits, a sync). Queries would run against old data. `stalePaths` lists the first notes still behind.
- `ready`: the notes were processed.

Outcomes (with several passes: the last pass's, and `updated` if any pass wrote):

- `updated`: the note had queries to run, none failed, and the new output was written (or the note already held exactly that text).
- `unchanged`: the note had queries to run, none failed, and the note already held their output.
- `no-queries`: the note holds no query that a refresh runs (none at all, or only manual queries and once queries that already have output), or is empty.
- `ignored`: the per-note ignore flag excludes the note, or the serializer never processes that kind of file: a note named `Canvas.md`, or an Excalidraw drawing (recognized only while the Excalidraw plugin runs; otherwise the drawing is processed like any note).
- `not-found`: there is no Markdown file at exactly that path.
- `conflict`: the note changed during the refresh, so the write was refused and the newer version kept. Call again.
- `failed`: a query failed, an output could not be put in its place, a stale result block follows a query, or an error occurred. The last pass wrote nothing; an earlier pass can have written the note, see `writes`. `errors` lists the failures; an error that is not tied to a query has `query: ''`.
- `not-run`: `state` is not `ready`.

`writes` is how many times this call wrote the note's file: 0 when never, up to 3 with several passes, also when the final outcome is `failed`. Each write fires one file event.

`skipped` lists the queries left untouched on purpose, which keep their previous output: a query whose FROM source does not exist (see **Skip queries that reference missing notes or folders** in [Configuration](configuration.md#general-settings)), a DataviewJS query while DataviewJS support is off, or a later copy of a query. A note can be `updated` or `unchanged` and still have skipped queries: check `skipped` when every query must have run.

`resolvedPath` is the vault path of the note the entry is about (`null` for `not-found` and `not-run`). Two entries with the same path are processed once and both show that note.
