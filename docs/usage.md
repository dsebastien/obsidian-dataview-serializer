# Usage

This plugin automatically serializes configured Dataview queries present in your notes. The queries will be serialized when you save the note (with a minimum of 5 seconds between updates to the same file to avoid update loops).

The following files are automatically ignored by the plugin:
- Non-markdown files
- Empty files
- Excalidraw files
- Canvas.md files
- Files in folders configured as "Folders to ignore"

The queries need to be wrapped in a very specific structure for the plugin to recognize those `<!-- QueryToSerialize: <query> -->`.

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

### Inline Refresh Button

When enabled in settings, a refresh button (🔄) appears next to each serialized Dataview query in the editor. Clicking this button will:

- Re-execute only that specific query
- Update the serialized output immediately
- Not affect other queries in the file

This is useful when you want to quickly update a single query without waiting for automatic updates or running a command.

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
