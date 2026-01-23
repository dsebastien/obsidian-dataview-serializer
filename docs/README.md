# Overview

Welcome to the official documentation of the Dataview Serializer plugin for Obsidian.

This plugin gives you the power of [Dataview](https://github.com/blacksmithgu/obsidian-dataview), but generates Markdown. Thanks to this, the output of your queries is saved in the notes, and the links actually appear on the Graph, making it even more useful.

Turning Dataview queries into Markdown also ensures that the generated content appears on Obsidian Publish websites, which is not the case with the Dataview plugin.

### Features

- **Automatic serialization**: Dataview queries are automatically serialized to Markdown when files are saved
- **Per-query update control**: Control when individual queries update using different query types (auto, manual-only, or write-once)
- **Inline refresh button**: Refresh individual queries directly from the editor
- **Force update folders**: Configure specific folders (like index files) to update when any file in your vault changes
- **Idempotency protection**: Prevents unnecessary file modifications and infinite update loops
- **Manual mode**: Option to disable automatic updates and only serialize queries on demand
- **Command palette integration**: Commands to serialize all queries, current file queries, or insert new query blocks

Currently, this plugin is only compatible with `LIST` and `TABLE` queries. `CALENDAR` and `TASK` queries are not supported.

### About

This plugin is an [open source project](https://github.com/dsebastien/obsidian-dataview-serializer), created by [Sébastien Dubois](https://dsebastien.net/).

[Sebastien](https://www.dsebastien.net/about/) is a Knowledge Management expert, and [community founder](https://store.dsebastien.net/knowii-community). You can find his newsletter [here](https://newsletter.dsebastien.net/). Sebastien has also created the [Obsidian Starter Kit](https://obsidianstarterkit.com), a popular template for Obsidian, as well as various projects, [products](https://store.dsebastien.net/) and [courses](https://knowledge-management-for-beginners.com/).
