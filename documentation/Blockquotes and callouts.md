# Blockquotes and callouts

How the plugin keeps serialized output inside a Markdown blockquote or callout.

Reference: [#64](https://github.com/dsebastien/obsidian-dataview-serializer/issues/64)

## The constraint

A blockquote is held together line by line. Any line that does not start with `>` ends the
quote — including an empty line. So every line the plugin writes under a query living in a
callout must repeat that prefix: the result markers, the content, and the blank separators.

## Where the prefix comes from

`findQueries` / `findDataviewJSQueries` already record an `indentation` field: everything on
the query line before the opening flag. For `> <!-- QueryToSerialize: … -->` that is `"> "`.

`getBlockquotePrefix(indentation)` (`src/app/utils/blockquote.fn.ts`) extracts the leading
blockquote structure with `/^[ \t]*(?:>[ \t]*)+/`:

| indentation    | prefix   | meaning                       |
| -------------- | -------- | ----------------------------- |
| `""`           | `""`     | top level                     |
| `"    "`       | `""`     | whitespace indentation        |
| `"> "`         | `"> "`   | callout / blockquote          |
| `"> > "`       | `"> > "` | nested                        |
| `"  > "`       | `"  > "` | quote inside an indented list |
| `"Some text "` | `""`     | query mid-line                |

**An empty prefix means "not in a blockquote" and every code path then behaves exactly as it
did before this feature existed.** That is the invariant that keeps the change safe: the new
behavior is reachable only when the indentation actually contains a `>`.

## Pieces

| Module                           | Responsibility                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| `blockquote.fn.ts`               | Prefix primitives (extract, strip, apply, regex fragment)          |
| `build-serialized-block.fn.ts`   | Assembles definition + markers + content into the replacement text |
| `serialized-block-regexes.fn.ts` | Builds the regexes that find an existing block                     |

`buildSerializedBlock` is the single place that emits a result block; both the block-query and
the DataviewJS paths in `plugin.ts` go through it. The regexes live outside `plugin.ts` so the
tests exercise the patterns the plugin actually runs, not a copy of them.

### Blank lines

`getBlankLinePrefix` returns the prefix with its trailing space trimmed (`">"`), used for the
separator lines and — via `applyIndentation` — for empty lines inside the Dataview output.
Trailing whitespace is deliberately avoided. Outside a blockquote this returns `""`, so blank
lines stay blank.

### Matching an existing block

`buildBlockquotePrefixPattern` returns:

- `""` outside a blockquote — matching stays byte-for-byte as strict as before.
- `[ \t]*(?:>[ \t]*)*` inside one — deliberately tolerant, so it matches the current prefix, a
  hand-edited variant, **or no prefix at all**. That last case is what lets a block written by
  an older version be replaced instead of a second one being appended next to it.

### Idempotency

Two things are compared before deciding a query is unchanged:

1. **Content** — both sides run through `stripLinePrefix` first. Without it the quoted blank
   line `>` is not whitespace and identical results would look different forever.
2. **Structure** — `startPrefix` and `endPrefix` returned by `matchExistingSerializedBlock`
   must equal the prefix that would be written now.

The structure half exists because a note broken by an older version usually has _correct
content_ with _misplaced markers_. Comparing content alone would skip it, and the callout
would stay broken until the query result happened to change.

### Trailing blank line

`needsTrailingNewline` is `(indentation.length > 0 && blockquotePrefix === '') || addTrailingNewline`.
The `indentation.length > 0` rule was there for whitespace-indented content. Blockquotes are
excluded: the quoted blank line that already ends the content preserves the structure, so
adding another one only inserts empty space inside the callout. The result is that callout
output has the same shape as top-level output.

## Query text extraction

For multi-line definitions the blockquote markers are stripped per line before the query (or
the JavaScript) is assembled — otherwise `>` ends up inside the query text or the executed
code. This happens in three places, all guarded by "is the opening line quoted?":

- `find-queries.fn.ts` — `extractMultiLineQuery`
- `find-dataviewjs-queries.fn.ts` — `extractJSCode`
- `refresh-button-extension.ts` — its own copy, which needs editor positions. Without it the
  refresh button on a quoted multi-line query passes a `targetQuery` containing `>` and
  matches nothing.

`originalQueryDefinition` keeps the raw lines, so replacement still matches the file verbatim.

## Removal

`remove-all-queries.fn.ts` anchored its definition patterns with `^[ \t]*<!--`, which never
matched a quoted definition — "Remove all queries" silently left them behind. The patterns are
now `^[ \t]*(?:>[ \t]*)*<!--`.

## Editor styling

`.dvs-query-line`, `.dvs-results-start-line` and `.dvs-results-end-line` force
`padding-left` (`@apply !pl-2`). That overrides CodeMirror's blockquote hanging indent, which
pushes the `>` prefix out of the line box — where `overflow: hidden` clips it. In source mode
the markers then _look_ like they escape the callout, which is exactly the symptom the fix is
meant to remove.

Those overrides are therefore scoped with `:not(.HyperMD-quote)` in `src/styles.src.css`.
Inside a quote, CodeMirror owns the indentation. Any future layout rule on these classes needs
the same treatment.

## What cannot be unit-tested

`blockquote-serialization.spec.ts` replays `processFile`'s block-query flow over a document
with a canned Dataview result, which covers the file content. It cannot cover rendering. The
CSS clipping above was invisible to every test and only showed up in a live vault, so any
change here needs a manual pass over the three view modes (Reading, Live Preview, Source).
