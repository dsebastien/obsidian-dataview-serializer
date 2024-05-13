# Obsidian Dataview Serializer

Obsidian plugin that gives you the power of [Dataview](https://github.com/blacksmithgu/obsidian-dataview), but generates Markdown, making it compatible with Obsidian Publish, and making the links appear on the Graph.

This plugin was inspired by the [Waypoint plugin](https://github.com/IdreesInc/Waypoint), which does vaguely similar, but without providing as much flexibility.

## Features

Automatically serialize Dataview queries to Markdown. Currently, this plugin is only compatible with `LIST` and `TABLE` queries. `CALENDAR` and `TASK` queries are not supported.

## Configuration

In the settings of the plugin, you can configure:

- Folders to scan: the folders that should be scanned when the "Scan and serialize all Dataview queries" command is executed
- Folders to ignore: the folders that should be excluded when processing files

## Usage

This plugin automatically serializes configured [Dataview](https://github.com/blacksmithgu/obsidian-dataview) queries present in your notes. The queries will be serialized when you save the note (it happens at most once every 3 seconds).

The queries need to be wrapped in a very specific structure for the plugin to recognize those `%% QueryToSerialize: <query> %%`.

Here's an example:

`%% QueryToSerialize: LIST FROM #quotes WHERE public_note = true SORT file.name ASC %%`

If the above line is present in one of your notes, this plugin will detect it, and will replace it by the following:

```
%% QueryToSerialize: LIST FROM #quotes WHERE public_note = true SORT file.name ASC %%
%% SerializedQuery: LIST FROM #quotes WHERE public_note = true SORT file.name ASC %%
- [[20 years from now, the only people who will remember that you worked late are your kids]]
- [[A beautiful book is a victory won in all the battlefields of human thought.md|A beautiful book is a victory won in all the battlefields of human thought]]
- [[A busy mind accelerates the perceived passage of time. Buy more time by cultivating peace of mind]]
...
%% SerializedQuery: END %%
```

As you can see above, the result of the query gets added as Markdown below the query. Notice that the serialized version is surrounded by `%% SerializedQuery: <query> %%` and `%% SerializedQuery END %%`. Those allow the plugin to know what to replace. They should not be removed.

Whenever you update that note, the query will be executed and serialized, replacing the previous serialized version.

Note that a single note can include multiple queries.
