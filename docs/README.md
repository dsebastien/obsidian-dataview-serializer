---
title: Overview
nav_order: 1
permalink: /
---

# Overview

Welcome to the official documentation of the Dataview Serializer plugin for Obsidian.

This plugin gives you the power of [Dataview](https://github.com/blacksmithgu/obsidian-dataview), but generates Markdown. Thanks to this, the output of your queries is saved in the notes, and the links actually appear on the Graph, making it even more useful.

Turning Dataview queries into Markdown also ensures that the generated content appears on Obsidian Publish websites, which is not the case with the Dataview plugin.

### Features

- **Automatic serialization**: Dataview queries are automatically serialized to Markdown when files are saved
- **Block queries**: Support for LIST, TABLE, and TASK queries
- **Inline expressions**: Support for inline Dataview expressions like `=this.name`, `=this.file.ctime`, `=embed(this.portrait)`
- **Per-query update control**: Control when individual queries update using different query types (auto, manual-only, or write-once)
- **Inline refresh button**: Refresh individual queries directly from the editor
- **Force update folders**: Configure specific folders (like index files) to update when any file in your vault changes
- **Idempotency protection**: Prevents unnecessary file modifications and infinite update loops
- **Manual mode**: Option to disable automatic updates and only serialize queries on demand
- **Command palette integration**: Commands to serialize all queries, current file queries, or insert new query blocks

Currently, this plugin supports:
- **Block queries**: `LIST`, `TABLE`, and `TASK` queries. `CALENDAR` queries are not supported.
- **Inline expressions**: Any valid Dataview inline expression (e.g., `=this.field`, `=embed(this.link)`).

**Note:** TASK queries have their checkbox markers stripped in the serialized output to prevent feedback loops. The result will be a regular list instead of a task list. See the [Usage documentation](usage.md#task-query-behavior) for details.

### Installation

#### Community plugins (recommended)

1. In Obsidian, go to **Settings → Community plugins**.
2. Disable **Restricted mode** if it's enabled.
3. Select **Browse**, search for **Dataview Serializer**, install it, then enable it.

You can also browse the catalog on the [Obsidian Community](https://community.obsidian.md/) website.

#### Manual installation

If the plugin isn't listed in the community catalog yet (or you want a specific version):

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/dsebastien/obsidian-dataview-serializer/releases).
2. Copy them into `<Vault>/.obsidian/plugins/dataview-serializer/`.
3. Reload Obsidian and enable **Dataview Serializer** in **Settings → Community plugins**.

#### BRAT (bleeding edge)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tool) installs plugins straight from a GitHub repo and keeps them updated automatically. Use this if you want the latest commits — **things might break**.

1. Install **Obsidian42 - BRAT** from **Settings → Community plugins → Browse** and enable it.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Paste `https://github.com/dsebastien/obsidian-dataview-serializer`.
4. Select the latest version and confirm.
5. Enable **Dataview Serializer** in **Settings → Community plugins**.

### About

This plugin is an [open source project](https://github.com/dsebastien/obsidian-dataview-serializer), created by [Sébastien Dubois](https://dsebastien.net/).

[Sebastien](https://www.dsebastien.net/about/) is a Knowledge Management expert, and [community founder](https://store.dsebastien.net/knowii-community). You can find his newsletter [here](https://newsletter.dsebastien.net/). Sebastien has also created the [Obsidian Starter Kit](https://obsidianstarterkit.com), a popular template for Obsidian, as well as various projects, [products](https://store.dsebastien.net/) and [courses](https://knowledge-management-for-beginners.com/).
