# Usage

This plugin automatically serializes configured Dataview queries present in your notes. The queries will be serialized when you save the note (with a minimum of 5 seconds between updates to the same file to avoid update loops).

The following files are automatically ignored by the plugin:
- Non-markdown files
- Empty files
- Excalidraw files
- Canvas.md files
- Files in folders configured as "Folders to ignore"

The queries need to be wrapped in a very specific structure for the plugin to recognize them. There are three query types available, each with different update behavior:

| Syntax | Behavior |
|--------|----------|
| `<!-- QueryToSerialize: <query> -->` | Automatic updates (default) |
| `<!-- QueryToSerializeManual: <query> -->` | Manual-only updates |
| `<!-- QueryToSerializeOnce: <query> -->` | Write-once (never auto-updates after first serialization) |
| `<!-- QueryToSerializeOnceAndEject: <query> -->` | Write-once and eject (serializes once, then removes all tags leaving only the output) |

Those tags are HTML comments, which are supported by Markdown, and Obsidian. Those are only visible in the source view, meaning that they disappear in the Reading mode. Moreover, the "code" that is within HTML comments is not interpreted by Obsidian. This means that even if you use a tag within a query, it won't be seen by Obsidian as an actual tag.

Here's an example query:

```
<!-- QueryToSerialize: LIST FROM #quotes WHERE public_note = true SORT file.name ASC -->
```

You can also write multi-line queries for better readability:

```
<!-- QueryToSerialize: LIST
FROM #quotes
WHERE public_note = true
SORT file.name ASC -->
```

Multi-line queries are normalized to a single line in the serialized output marker, but the original multi-line format is preserved in the query definition.

If the above line is present in one of your notes, this plugin will detect it, and will replace it by the following:

```
<!-- QueryToSerialize: LIST FROM #quotes WHERE public_note = true SORT file.name ASC -->
<!-- SerializedQuery: LIST FROM #quotes WHERE public_note = true SORT file.name ASC -->
- [[20 years from now, the only people who will remember that you worked late are your kids]]
- [[A beautiful book is a victory won in all the battlefields of human thought.md|A beautiful book is a victory won in all the battlefields of human thought]]
- [[A busy mind accelerates the perceived passage of time. Buy more time by cultivating peace of mind]]
...
<!-- SerializedQuery: END -->
```

As you can see above, the result of the query gets added as Markdown below the query. Notice that the serialized version is surrounded by `<!-- SerializedQuery: <query> -->` and `<!-- SerializedQuery END -->`. Those allow the plugin to know what to replace. They should not be removed.

Whenever you update that note, the query will be executed and serialized, replacing the previous serialized version.

Note that a single note can include multiple queries. As soon as a file is modified, this plugin reads it and tries to locate queries to serialize. It starts by removing all the serialized queries, recognized by the `<!--SerializedQuery: END -->`line. Then, it serializes all the found queries to Markdown and saves the file again.

There is a minimal delay between the executions of this plugin, to avoid issues with file synchronization systems.

### Per-Query Update Control

You can control when individual queries are updated by using different query syntaxes. This allows you to mix automatic and manual queries in the same file.

#### Automatic Updates (Default)

```
<!-- QueryToSerialize: LIST FROM #project -->
```

This is the standard behavior. The query is automatically re-serialized whenever the file is modified.

#### Manual-Only Updates

```
<!-- QueryToSerializeManual: LIST FROM #archive -->
```

Manual queries are **skipped during automatic updates**. They will only be updated when you:
- Use the "Scan and serialize all Dataview queries" command
- Use the "Scan and serialize Dataview queries in current file" command
- Click the inline refresh button next to the query

This is useful for queries that are expensive to run or that you only want to update occasionally.

#### Write-Once Updates

```
<!-- QueryToSerializeOnce: TABLE file.ctime FROM "Templates" -->
```

Write-once queries are serialized **only once**. After the first serialization, they will never be automatically updated again. Like manual queries, you can still force an update using commands or the refresh button.

This is useful for:
- Capturing a snapshot of data at a specific point in time
- Queries where you want the initial result preserved
- Reducing processing overhead for static content

#### Write-Once and Eject Updates

```
<!-- QueryToSerializeOnceAndEject: LIST FROM #daily-notes LIMIT 5 -->
```

Write-once-and-eject queries are serialized **only once**, and then all surrounding tags are removed, leaving only the serialized output. After ejection, the query definition is gone, so it can never be updated again.

Before ejection:
```
<!-- QueryToSerializeOnceAndEject: LIST FROM #daily-notes LIMIT 5 -->
```

After ejection:
```
- [[2024-01-15]]
- [[2024-01-14]]
- [[2024-01-13]]
- [[2024-01-12]]
- [[2024-01-11]]
```

This is useful for:
- Template files where you want the query to populate once when a new note is created, then become static content
- One-time data insertion where the query mechanism should disappear after execution
- Creating "snapshot" content that blends seamlessly with regular markdown

#### Example: Mixed Query Types

You can use different query types in the same file:

```markdown
# My Dashboard

## Active Projects (auto-updates)
<!-- QueryToSerialize: LIST FROM #project AND !#archived -->

## Archived Projects (manual refresh only)
<!-- QueryToSerializeManual: LIST FROM #project AND #archived -->

## Initial Setup Date (never changes)
<!-- QueryToSerializeOnce: LIST FROM "Setup" LIMIT 1 -->

## Template Content (ejects after first run)
<!-- QueryToSerializeOnceAndEject: TABLE file.name, file.ctime FROM "Templates" LIMIT 3 -->
```

## Alternative Syntax

In addition to the original syntax documented above, the plugin supports an alternative, more descriptive syntax using the `dataview-serializer-` prefix. This alternative syntax is designed to be more discoverable for newcomers who might encounter these queries in shared vaults.

### Block Query Alternative Syntax

| Original | Alternative |
|----------|-------------|
| `<!-- QueryToSerialize: <query> -->` | `<!-- dataview-serializer-query: <query> -->` |
| `<!-- QueryToSerializeManual: <query> -->` | `<!-- dataview-serializer-query-manual: <query> -->` |
| `<!-- QueryToSerializeOnce: <query> -->` | `<!-- dataview-serializer-query-once: <query> -->` |
| `<!-- QueryToSerializeOnceAndEject: <query> -->` | `<!-- dataview-serializer-query-once-and-eject: <query> -->` |
| `<!-- SerializedQuery: <query> -->` | `<!-- dataview-serializer-result: <query> -->` |
| `<!-- SerializedQuery END -->` | `<!-- dataview-serializer-result-end -->` |

### Inline Query Alternative Syntax

| Original | Alternative |
|----------|-------------|
| `<!-- IQ: =<expr> -->result<!-- /IQ -->` | `<!-- dataview-serializer-iq: =<expr> -->result<!-- /dataview-serializer-iq -->` |
| `<!-- IQManual: =<expr> -->result<!-- /IQ -->` | `<!-- dataview-serializer-iq-manual: =<expr> -->result<!-- /dataview-serializer-iq -->` |
| `<!-- IQOnce: =<expr> -->result<!-- /IQ -->` | `<!-- dataview-serializer-iq-once: =<expr> -->result<!-- /dataview-serializer-iq -->` |
| `<!-- IQOnceAndEject: =<expr> -->result<!-- /IQ -->` | `<!-- dataview-serializer-iq-once-and-eject: =<expr> -->result<!-- /dataview-serializer-iq -->` |

### Key Points

- **Both syntaxes work simultaneously**: You don't need to choose one or the other. The plugin recognizes both.
- **No deprecation**: The original syntax is not deprecated and will continue to work indefinitely.
- **Syntax consistency**: When a query uses the alternative syntax, its result markers will also use the alternative format. Each query maintains consistent markers.
- **Mixed usage**: You can use both syntaxes in the same file. Each query will use its own consistent markers.
- **Conversion commands**: The conversion commands (e.g., "Convert Dataview query at cursor") currently generate the original syntax for maximum compatibility.

### Example with Alternative Syntax

```markdown
<!-- dataview-serializer-query: LIST FROM #project -->
<!-- dataview-serializer-result: LIST FROM #project -->
- [[Project A]]
- [[Project B]]
<!-- dataview-serializer-result-end -->
```

## Inline Expressions

In addition to block queries (LIST, TABLE, TASK), this plugin also supports **inline Dataview expressions**. These are expressions like `=this.name`, `=this.file.ctime`, or `=embed(this.portrait)` that evaluate to a single value.

### Inline Query Syntax

Inline queries use a compact syntax that works within regular text without disrupting readability:

| Syntax | Behavior |
|--------|----------|
| `<!-- IQ: =expression -->result<!-- /IQ -->` | Automatic updates |
| `<!-- IQManual: =expression -->result<!-- /IQ -->` | Manual-only updates |
| `<!-- IQOnce: =expression -->result<!-- /IQ -->` | Write-once (never auto-updates after first serialization) |
| `<!-- IQOnceAndEject: =expression -->result<!-- /IQ -->` | Write-once and eject (serializes once, then removes markers) |

### Examples

**Simple field access:**
```markdown
Character name: <!-- IQ: =this.name -->John Smith<!-- /IQ -->
```

**File metadata:**
```markdown
Created: <!-- IQ: =this.file.ctime -->2024-01-15<!-- /IQ -->
```

**Embedded images:**
```markdown
Portrait: <!-- IQ: =embed(this.portrait) -->![[portrait.png]]<!-- /IQ -->
```

**In tables:**
```markdown
| Property | Value |
|----------|-------|
| Name | <!-- IQ: =this.name -->John<!-- /IQ --> |
| Age | <!-- IQ: =this.age -->30<!-- /IQ --> |
```

### Converting Raw Inline Queries

If you have existing raw Dataview inline queries (using the `` `=expression` `` format), you can convert them to the serialized format using the "Convert Dataview query at cursor" or "Convert all Dataview queries in current file" commands. These commands will automatically detect inline expressions and convert them to the appropriate inline serialized format.

Before conversion:
```markdown
Name: `=this.name`
```

After conversion:
```markdown
Name: <!-- IQ: =this.name --><!-- /IQ -->
```

### Inline Query Features

- **Compact syntax**: Uses `IQ` prefix for minimal visual impact
- **Table support**: Pipe characters in results are automatically escaped
- **All update modes**: Same update control as block queries (auto, manual, once, once-and-eject)
- **Refresh button**: Small inline refresh button appears next to each query when enabled
- **Supports all Literal types**: Handles strings, numbers, dates, durations, links, arrays, and objects

### Inline Refresh Button

When enabled in settings, a refresh button (🔄) appears next to each serialized Dataview query in the editor (for all query types, including inline queries). Clicking this button will:

- Re-execute only that specific query
- Update the serialized output immediately
- Not affect other queries in the file

This is useful when you want to quickly update a single query without waiting for automatic updates or running a command. It also provides a way to manually refresh `QueryToSerializeManual` and `QueryToSerializeOnce` queries.

## DataviewJS Queries

In addition to standard Dataview DQL queries, this plugin supports **DataviewJS queries**. DataviewJS allows you to write JavaScript code that uses the Dataview API to create complex, dynamic outputs.

### DataviewJS Query Syntax

DataviewJS queries use HTML comment markers similar to block queries, but with a `JS` suffix:

| Syntax | Behavior |
|--------|----------|
| `<!-- DataviewJSToSerialize: <js-code> -->` | Automatic updates |
| `<!-- DataviewJSToSerializeManual: <js-code> -->` | Manual-only updates |
| `<!-- DataviewJSToSerializeOnce: <js-code> -->` | Write-once (never auto-updates) |
| `<!-- DataviewJSToSerializeOnceAndEject: <js-code> -->` | Write-once and eject |

#### Alternative Syntax

| Original | Alternative |
|----------|-------------|
| `<!-- DataviewJSToSerialize: <js-code> -->` | `<!-- dataview-serializer-js: <js-code> -->` |
| `<!-- DataviewJSToSerializeManual: <js-code> -->` | `<!-- dataview-serializer-js-manual: <js-code> -->` |
| `<!-- DataviewJSToSerializeOnce: <js-code> -->` | `<!-- dataview-serializer-js-once: <js-code> -->` |
| `<!-- DataviewJSToSerializeOnceAndEject: <js-code> -->` | `<!-- dataview-serializer-js-once-and-eject: <js-code> -->` |

### Basic Examples

**Simple list:**
```markdown
<!-- dataview-serializer-js:
dv.list(dv.pages("#project").file.link)
-->
<!-- dataview-serializer-js-result -->
- [[Project A]]
- [[Project B]]
<!-- dataview-serializer-js-result-end -->
```

**Table with computed columns:**
```markdown
<!-- dataview-serializer-js:
dv.table(
  ["Name", "Status", "Days Old"],
  dv.pages("#task")
    .map(p => [
      p.file.link,
      p.status,
      Math.floor((Date.now() - p.file.ctime) / (1000 * 60 * 60 * 24))
    ])
)
-->
```

**Multi-line JavaScript (recommended for complex queries):**
```markdown
<!-- dataview-serializer-js:
const projects = dv.pages("#project")
  .where(p => p.status !== "archived")
  .sort(p => p.priority, "desc");

dv.header(2, "Active Projects");
dv.table(
  ["Project", "Priority", "Due Date"],
  projects.map(p => [p.file.link, p.priority, p.due])
);
-->
```

### Supported dv Methods

**Rendering methods** (output is captured and converted to markdown):

| Method | Output |
|--------|--------|
| `dv.list(values)` | Bullet list |
| `dv.table(headers, rows)` | Markdown table |
| `dv.taskList(tasks)` | Task list (checkboxes stripped) |
| `dv.paragraph(text)` | Plain text block |
| `dv.header(level, text)` | Markdown header (# to ######) |
| `dv.span(text)` | Inline text |
| `dv.el(tag, content, attrs)` | HTML element to markdown |
| `dv.execute(query)` | Executes DQL query and captures output |

**Query and data methods** (delegated to real Dataview API):

- `dv.pages(source)`, `dv.pagePaths(source)`, `dv.page(path)`, `dv.current()`
- `dv.query(source)`, `dv.queryMarkdown(source)`, `dv.tryQuery()`, `dv.tryQueryMarkdown()`
- `dv.evaluate(expr)`, `dv.tryEvaluate(expr)`

**Utility methods**:

- `dv.array(value)`, `dv.isArray(value)`
- `dv.date(text)`, `dv.duration(text)`
- `dv.fileLink(path, embed?, display?)`, `dv.sectionLink()`, `dv.blockLink()`
- `dv.compare(a, b)`, `dv.equal(a, b)`, `dv.clone(value)`, `dv.parse(value)`
- `dv.markdownList()`, `dv.markdownTable()`, `dv.markdownTaskList()`

**Async I/O methods**:

- `dv.io.load(path)` - Load file contents as string
- `dv.io.csv(path)` - Load and parse CSV file
- `dv.io.normalize(path)` - Normalize relative path to absolute

**Properties**:

- `dv.luxon` - Luxon DateTime library
- `dv.func`, `dv.value`, `dv.widget` - Dataview internals

### Using dv.fileLink()

`dv.fileLink()` returns a **Link object**, not a string. To output a link, you must pass it to a rendering method:

```markdown
<!-- dataview-serializer-js:
// This does nothing (just creates a Link object):
dv.fileLink("2021-08-08")

// This outputs the link:
dv.paragraph(dv.fileLink("2021-08-08"))
// → [[2021-08-08]]

// With display text:
dv.span(dv.fileLink("note", false, "My Note"))
// → [[note|My Note]]

// As an embed:
dv.paragraph(dv.fileLink("image.png", true))
// → ![[image.png]]

// In a list:
dv.list([
  dv.fileLink("note1"),
  dv.fileLink("note2")
])
// → - [[note1]]
// → - [[note2]]
-->
```

### Using dv.el() for Custom Formatting

`dv.el()` lets you create HTML elements that are converted to markdown:

```markdown
<!-- dataview-serializer-js:
dv.el("h2", "Section Title")        // → ## Section Title
dv.el("p", "A paragraph of text")   // → A paragraph of text
dv.el("strong", "Bold text")        // → **Bold text**
dv.el("em", "Italic text")          // → *Italic text*
dv.el("code", "const x = 1")        // → `const x = 1`
dv.el("a", "Click here", { href: "https://example.com" })  // → [Click here](https://example.com)
dv.el("hr")                         // → ---
-->
```

Supported tags: `p`, `div`, `span`, `h1`-`h6`, `b`, `strong`, `i`, `em`, `code`, `pre`, `a`, `img`, `br`, `hr`, `blockquote`, `li`

### Using dv.execute() for Embedded DQL Queries

`dv.execute()` runs a standard DQL query and captures the output:

```markdown
<!-- dataview-serializer-js:
dv.header(2, "Recent Notes");
await dv.execute("LIST FROM #note SORT file.ctime DESC LIMIT 5");

dv.header(2, "Project Tasks");
await dv.execute("TASK FROM #project WHERE !completed");
-->
```

### Async/Await Support

DataviewJS queries support `async/await` for asynchronous operations:

```markdown
<!-- dataview-serializer-js:
// Load external data
const content = await dv.io.load("data/config.json");
const config = JSON.parse(content);

dv.paragraph(`Current version: ${config.version}`);

// Load CSV data
const data = await dv.io.csv("data/items.csv");
dv.table(
  ["Name", "Value"],
  data.map(row => [row.name, row.value])
);
-->
```

### Not Supported

The following methods are **not supported** in serialized DataviewJS:

| Method | Reason |
|--------|--------|
| `dv.view(path)` | Requires external template files |
| `dv.executeJs(code)` | Nested JavaScript execution not allowed |

### Known Limitations

1. **`--` operator forbidden**: HTML comments cannot contain `--`. Use `i -= 1` instead of `i--`, or avoid `--` in string literals.

2. **5-second timeout**: JavaScript execution times out after 5 seconds to prevent infinite loops.

3. **No DOM access**: The `dv` object is a proxy that captures output. Direct DOM manipulation is not available.

### Enabling/Disabling DataviewJS

DataviewJS support can be toggled in Settings → Dataview Serializer → "Enable DataviewJS queries". When disabled, DataviewJS queries will be ignored during serialization.

### Idempotency Protection

The plugin includes built-in protection against unnecessary file modifications. Before updating a serialized query, the plugin compares the new result with the existing serialized content. If they are identical, the file is not modified.

This provides several benefits:
- **Prevents infinite update loops**: If a query produces the same output, the file won't be re-saved, preventing cascading updates
- **Reduces disk writes**: Files are only written when the query results actually change
- **Better sync compatibility**: Fewer unnecessary file modifications means fewer sync conflicts

### Commands

#### Manual scan of all queries

The plugin includes a command you can use to scan and update all the Dataview queries to serialize in the entire vault: Hit CTRL/CMD + P then type "Scan and serialize all Dataview queries" to invoke it.

#### Scan current file

To serialize only the queries in the currently open file, use the command "Scan and serialize Dataview queries in current file". This is useful when you want to refresh a specific file without processing the entire vault.

#### Add a new Dataview Serializer query

The plugin includes a command called "Insert Dataview serializer block" that can be used to quickly add a new Dataview Serializer query to the current note.

#### Convert existing Dataview queries

If you have existing Dataview queries in your notes (using the standard ` ```dataview ``` ` codeblock syntax or inline `` `= expression` `` queries), you can convert them to the serialized format using these commands:

**Convert Dataview query at cursor to serialized format**

This command converts a Dataview query at the current cursor position to the serialized format. It works in two modes:

- **With selection**: If you have text selected, all Dataview queries within the selection will be converted
- **Without selection**: The query containing the cursor (codeblock or inline) will be converted

Example - Before:
````markdown
```dataview
LIST FROM #project
```
````

After:
```markdown
<!-- QueryToSerialize: LIST FROM #project -->
```

**Convert all Dataview queries in current file to serialized format**

This command scans the entire current file and converts all Dataview codeblocks and inline queries to the serialized format. This is useful when migrating an existing note to use the Dataview Serializer plugin.

Both commands:
- Support ` ```dataview ``` ` codeblocks and inline `` `= expression` `` queries
- Only convert supported query types (LIST, TABLE, and TASK). Unsupported types (CALENDAR) are skipped and reported
- Preserve indentation from the original query
- Normalize multi-line queries to single-line format in the serialized output

### Error Handling

When a query fails to serialize (due to invalid syntax or other Dataview errors), the plugin provides helpful feedback:

- **Error notifications**: When enabled in settings, a notification popup appears showing:
  - The file containing the error
  - The problematic query (truncated if too long)
  - The error message from Dataview

- **Batch processing**: When scanning multiple files, the plugin shows up to 3 individual error notifications plus a summary if there are more errors.

- **Refresh button errors**: When clicking the inline refresh button on a query with an error, you'll see a specific error message for that query.

### TASK Query Behavior

When serializing TASK queries, the plugin **strips the checkbox markers** (`[ ]`, `[x]`, etc.) from the output. This means:

- `- [ ] Incomplete task` becomes `- Incomplete task`
- `- [x] Completed task` becomes `- Completed task`

**Why?** This is necessary to prevent feedback loops. Without stripping checkboxes, the serialized tasks would be recognized as actual tasks by Dataview on subsequent runs, causing duplicates to accumulate with each update.

**Caveat:** The serialized output of TASK queries will be a regular Markdown list, not a task list. You will lose the visual indication of task completion status (checkboxes). If you need to preserve checkbox states, consider using a LIST query with task metadata fields instead.

### Syncing Vaults Across Devices

If you sync your vault across multiple devices using Git or other sync tools, you may encounter issues with internal links having different formats on different devices. For example:

- Desktop: `[[2025-04-01]]`
- Mobile: `[[30 Journal/31 Daily/2025-04/2025-04-01.md|2025-04-01]]`

This can cause unnecessary commit noise as links keep changing back and forth.

To solve this, go to Settings → Dataview Serializer and change the **Link format** setting to one of:

- **Use Obsidian setting**: Respects your vault's "New link format" preference. Make sure this setting is the same across all your devices.
- **Absolute path**: Always uses the full path, ensuring consistent output regardless of Obsidian's settings or file uniqueness.

Using "Absolute path" guarantees that all devices produce identical serialized output, eliminating sync conflicts.

### Troubleshooting

If you're experiencing issues with the plugin:

1. **Enable debug logging**: Go to Settings → Dataview Serializer → enable "Debug logging". This will output detailed information to the browser console (open with Ctrl/Cmd+Shift+I → Console tab).

2. **Check for query errors**: Enable "Show error notifications" to see when queries fail. Common issues include:
   - Invalid Dataview syntax
   - References to non-existent fields or folders
   - Queries that depend on other plugins not being loaded

3. **Console warnings**: Even with debug logging disabled, warnings and errors are always logged to the console. Check there for any issues the plugin encounters.

4. **Link format inconsistencies**: If you're seeing different link formats when syncing across devices, see the "Syncing Vaults Across Devices" section above.
