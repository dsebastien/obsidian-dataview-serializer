# Usage

This plugin automatically serializes configured Dataview queries present in your notes. The queries will be serialized when you save the note (it happens at most once every 3 seconds).

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

Note that a single note can include multiple queries. As soon as a file is modified, this plugin reads it and tries to located queries to serialize. It starts by removing all the serialized queries, recognized by the `<!--SerializedQuery: END -->`line. Then, it serializes all the found queries to Markdown and saves the file again.

There is a minimal delay between the executions of this plugin, to avoid issues with file synchronization systems.
