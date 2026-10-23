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
