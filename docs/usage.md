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

Those tags are HTML comments, which are supported by Markdown, and Obsidian. Those are only visible in the source view, meaning that they disappear in the Reading mode. Moreover, the "code" that is within HTML comments is not interpreted by Obsidian. This means that even if you use a tag within a query, it won't be seen by Obsidian as an actual tag.

Here's an example query:

```
<!-- QueryToSerialize: LIST FROM #quotes WHERE public_note = true SORT file.name ASC -->
```

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

WARNING: For now, the queries can only be put on a single line. Take a look at [this issue](https://github.com/dsebastien/obsidian-dataview-serializer/issues/12) for details/updates.

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
```

### Inline Refresh Button

When enabled in settings, a refresh button (🔄) appears next to each serialized Dataview query in the editor (for all query types). Clicking this button will:

- Re-execute only that specific query
- Update the serialized output immediately
- Not affect other queries in the file

This is useful when you want to quickly update a single query without waiting for automatic updates or running a command. It also provides a way to manually refresh `QueryToSerializeManual` and `QueryToSerializeOnce` queries.

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

### Error Handling

When a query fails to serialize (due to invalid syntax or other Dataview errors), the plugin provides helpful feedback:

- **Error notifications**: When enabled in settings, a notification popup appears showing:
  - The file containing the error
  - The problematic query (truncated if too long)
  - The error message from Dataview

- **Batch processing**: When scanning multiple files, the plugin shows up to 3 individual error notifications plus a summary if there are more errors.

- **Refresh button errors**: When clicking the inline refresh button on a query with an error, you'll see a specific error message for that query.

### Troubleshooting

If you're experiencing issues with the plugin:

1. **Enable debug logging**: Go to Settings → Dataview Serializer → enable "Debug logging". This will output detailed information to the browser console (open with Ctrl/Cmd+Shift+I → Console tab).

2. **Check for query errors**: Enable "Show error notifications" to see when queries fail. Common issues include:
   - Invalid Dataview syntax
   - References to non-existent fields or folders
   - Queries that depend on other plugins not being loaded

3. **Console warnings**: Even with debug logging disabled, warnings and errors are always logged to the console. Check there for any issues the plugin encounters.
