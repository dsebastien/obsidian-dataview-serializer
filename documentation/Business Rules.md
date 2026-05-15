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

Conversion and removal commands (`convert-dataview-query-at-cursor`, `convert-all-dataview-queries-in-file`, `remove-all-queries-in-current-file`, `insert-dataview-serializer-block`) are NOT subject to this rule: they only manipulate marker syntax, they do not run Dataview queries.
