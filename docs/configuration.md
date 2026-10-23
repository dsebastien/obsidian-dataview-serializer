---
title: Configuration
nav_order: 3
---

# Configuration

In the settings of the plugin, you can configure:

## Device Settings

- **Disable on this device**: When enabled, the plugin is fully disabled on the current device only. It performs no automatic or manual serialization, registers no file-event listeners, hides the per-query refresh buttons, and its commands do nothing (they show a brief notice instead). This is useful when you want the plugin active on your desktop but completely inactive on, for example, your phone or tablet.

  Unlike every other setting, this one is **stored locally on the device** and is **never synced** to your other devices (it is not written to the plugin's `data.json`). Flip it on wherever you want the plugin to stay inert; your other devices are unaffected. The change takes effect immediately — no reload required.

- **Periodic full serialization**: When enabled, the plugin re-serializes every query in your [Folders to scan](#folder-settings) on a timer, without you touching anything. Off by default. See [Periodic full serialization](#periodic-full-serialization) below.

- **Interval (minutes)**: How often the periodic full serialization runs. Shown only while the timer is enabled. Whole minutes, minimum 5, default 30.

Both timer settings are **stored locally on the device** and **never synced**, like "Disable on this device".

### Periodic full serialization

Automatic updates are event-driven: when a note changes, only that note is re-serialized. An index note or MoC whose queries read _other_ notes goes stale until you edit it, use [Folders to force update](#understanding-folders-to-force-update), or run "Scan and serialize all Dataview queries". The timer runs that same full scan for you every X minutes.

Each run behaves like an automatic update, applied to every file in scope:

- **Scope**: the files in "Folders to scan", or the whole vault when that list is empty. Folders listed in "Folders to force update" are covered whenever they fall inside that scope.
- **Skipped**: files in "Folders to ignore", notes with the [`dataview_serializer_ignore`](#per-note-ignore-flag) flag, empty files, Excalidraw and `Canvas.md` files, and files serialized in the last 5 seconds.
- **Query modes**: [manual-only](usage.md#manual-only-updates) queries are not run, and [write-once](usage.md#write-once-updates) queries are not run again once serialized. The timer is not a manual trigger.
- **Writes**: a file is rewritten only when its serialized output actually changed, so sync tools see no churn from unchanged notes.
- **Silent**: no progress notice. Query errors are shown only when "Show error notifications" is on.
- **No pile-up**: if a run is still going when the next one is due, that tick is skipped.
- **Independent of "Disable automatic updates"**: the timer is its own opt-in. With event-driven updates off, the timer can be your only automatic path, for example to update notes every 30 minutes instead of on every edit.
- **"Disable on this device" wins**: while the plugin is disabled on a device, its timer does nothing.

Changes apply immediately: no reload needed. The first run happens one interval after Obsidian starts or after you enable the timer.

**Multi-device vaults:** enable the timer on one device only (typically your desktop). If several devices run it against a synced vault, they all rewrite the same notes and can cause sync conflicts. Since the setting is device-local, enabling it on your desktop leaves your phone and laptop unaffected.

**Large vaults:** a full scan runs Dataview for every query in scope. If runs feel heavy, raise the interval or narrow "Folders to scan" to the folders holding your index notes.

## General Settings

- **Disable automatic updates**: When enabled, the plugin will not automatically serialize queries when files are created, modified, or renamed. You can still manually serialize queries using the command palette. This is useful if you prefer full control over when queries are updated. The [periodic full serialization](#periodic-full-serialization) timer is not affected by this setting.

- **Show refresh button**: When enabled, a refresh button will be displayed next to each serialized Dataview query in the editor. Clicking this button will refresh only that specific query.

- **Hide query text**: When enabled, single-line query definitions are hidden in Live Preview, leaving only the query type badge and the refresh button. Place the cursor on the line to show and edit the query. Source mode and Reading view are unaffected. Enabled by default.

- **Show error notifications**: When enabled, a notification popup will be displayed when a query fails to serialize. This helps you identify and fix invalid queries. Errors show the problematic query and the error message from Dataview.

- **Skip queries that reference missing notes or folders**: Enabled by default. Obsidian does not update links inside the HTML comments that hold your queries, so after renaming a note or folder a query such as `LIST FROM #type/plan AND [[Old name]]` silently returns nothing, and its list would be replaced by an empty one. With this setting on, a query whose `FROM` clause links to a note (`[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`) or names a folder or file (`"Projects/Active"`) that does not exist is left untouched: its previous result is kept, and a notification lists the missing references so you can fix the query. Negated sources (`!"Archive"`, `-[[Note]]`), tags, `[[]]` (this note) and `""` (whole vault) are never checked. Manual runs (commands, refresh buttons) always notify; automatic runs notify only when "Show error notifications" is on, and report the same broken query at most once every 10 minutes. DataviewJS queries are not checked. Turn it off to get the previous behavior.

- **Update queries when notes or folders are renamed**: Enabled by default. When you rename or move a note or folder, the links (`[[Old name]]`, `[[Folder/Old name|alias]]`) and quoted `FROM` paths (`"Old folder"`, `"Old folder/Sub"`, negated ones included) that pointed at it are rewritten in every query (block, inline, alternative syntax, and the `SerializedQuery` header), then the queries are re-serialized (unless automatic updates are disabled). One notification summarizes the changes. Notes with the per-note ignore flag and notes in ignored folders are not touched. DataviewJS queries are not rewritten. The plugin keeps a small in-memory index of which notes reference what, built in the background at startup, so renames stay fast in large vaults. Not active when the plugin is disabled on the device. See [Renaming notes and folders](usage.md#renaming-notes-and-folders).

- **Debug logging**: When enabled, verbose debug messages will be logged to the browser console. This is useful for troubleshooting issues with the plugin. When disabled (default), the plugin writes nothing to the console, keeping it clean and avoiding the cost of logging during large vault scans.

- **Enable DataviewJS queries**: When enabled (default), the plugin will process DataviewJS queries in addition to standard Dataview DQL queries. DataviewJS queries allow you to write JavaScript code using the Dataview API. When disabled, DataviewJS queries will be ignored during serialization.

## Output Settings

- **Add trailing newline**: When enabled, an empty line will be added between the serialized content and the END marker. This is useful for static site generators like Jekyll that require blank lines after tables or lists.

- **Link format**: Controls how internal links are formatted in the serialized output. Options:
  - **Use Obsidian setting**: Respects your vault's "New link format" preference (Settings → Files and links → New link format) and your "Use \[\[Wikilinks\]\]" preference. If Obsidian is set to "Relative path" or "Absolute path", the plugin will preserve full paths. If "Use \[\[Wikilinks\]\]" is disabled (i.e., your vault uses standard Markdown links), serialized output will use `[display](path)` format instead of `[[path|display]]`.
  - **Shortest path when possible** (default): Simplifies links when the filename is unique in the vault. For example, `[[folder/note.md|note]]` becomes `[[note]]` if there's only one file named `note.md`. Always uses wikilink syntax.
  - **Absolute path**: Always uses the full path to the file, with wikilink syntax. This ensures consistency when syncing vaults across devices using Git or other tools, preventing commit noise from link format differences.

## Folder Settings

- **Folders to scan**: The folders that should be scanned when the "Scan and serialize all Dataview queries" command or the [periodic full serialization](#periodic-full-serialization) timer runs. Leave empty to scan the whole vault. Automatic updates triggered by file changes are not limited by this list: they process the file that changed, wherever it is.

- **Folders to ignore**: The folders that should be excluded when processing files. Files in these folders will not have their queries serialized.

- **Folders to force update**: Folders containing files that should be updated when ANY file in the vault changes. This is useful for index files or dashboards that contain queries aggregating data from elsewhere in your vault.

### Understanding "Folders to force update"

By default, when you modify a file, only that file's queries are re-serialized. However, if you have an "index" or "dashboard" file that contains queries like `LIST FROM #project` or `TABLE file.name FROM "Daily Notes"`, those queries depend on other files in your vault.

By adding the folder containing your index files to "Folders to force update", those files will be re-processed whenever any file in your vault changes. This ensures your index files stay up-to-date.

**Example use case:**
- You have a file at `Index/Projects.md` containing `<!-- QueryToSerialize: LIST FROM #project -->`
- Add `Index` to "Folders to force update"
- Now whenever you add the `#project` tag to any note, your `Projects.md` index will automatically update

**Note:** Force updates are debounced by 10 seconds, much longer than the 500 ms used for regular updates. Since a change anywhere in the vault can trigger a rebuild of every dashboard, a bulk operation (a sync pulling down hundreds of notes, a rename cascade) would otherwise rebuild them hundreds of times over. See [Update timing](usage.md#update-timing) for the rest of the timing rules.

### Date placeholders in "Folders to force update"

Paths in "Folders to force update" can contain date placeholders. They are resolved against the current date **every time** the force update runs, so a path like `Daily/{{year}}/{{month}}` always points at the current month's folder — no manual maintenance when the month rolls over.

This is mainly useful with Periodic Notes / Calendar style vaults: instead of force-updating an entire year of daily notes, you force-update only the notes that are still "current".

**Available placeholders** (case-insensitive, shown for 2026-07-23):

| Placeholder | Resolves to | Example |
|---|---|---|
| `{{year}}` | Calendar year | `2026` |
| `{{isoyear}}` | ISO week-numbering year — the year `{{week}}` counts within | `2026` |
| `{{quarter}}` | Quarter | `Q3` |
| `{{month}}` | Month number | `07` |
| `{{monthName}}` | Short month name | `Jul` |
| `{{week}}` | ISO week number (padded) | `30` |

> Pair `{{week}}` with `{{isoyear}}`, not `{{year}}`. A week can straddle New Year: 2024-12-30 is week 01 of 2025, so `{{year}}/{{week}}` files it under `2024/01`, away from the rest of its own week. Use `{{year}}` where the calendar year is what you mean, such as `Monthly/{{year}}`.
| `{{date}}` | Full date | `2026-07-23` |
| `{{day}}` | Day of the month | `23` |

**Offsets** — add `+n` or `-n` to shift the date by the placeholder's own unit. Useful to keep the previous period in scope for a while:

| Pattern | Resolves to |
|---|---|
| `{{month-1}}` | Previous month → `06` |
| `{{week+1}}` | Next ISO week → `31` |
| `{{date-7}}` | Seven days ago → `2026-07-16` |
| `{{year-1}}` | Previous year → `2025` |

**Custom formats** — add a colon followed by a [date-fns format string](https://date-fns.org/docs/format) to override the default rendering. Literal text must be single-quoted:

| Pattern | Resolves to |
|---|---|
| `{{date:MM-MMM}}` | `07-Jul` |
| `{{month:MMMM}}` | `July` |
| `{{month-1:MMMM}}` | `June` |
| `{{week:RRRR-'CW'II}}` | `2026-CW30` |

**Examples:**

| Configured path | Effect |
|---|---|
| `Daily/{{year}}/{{month}}-{{monthName}}` | Only the current month's folder (`Daily/2026/07-Jul`) |
| `Daily/{{year}}/{{month-1}}-{{monthName-1}}` | Only the previous month's folder (add it alongside the one above for overlap) |
| `Daily/{{year}}/{{month}}-{{monthName}}/{{date}}` | Only today's daily note |
| `Weekly/{{week:RRRR-'CW'II}}` | Only the current week's note |

Notes:

- Matching is a path prefix match, exactly as for static paths. `Daily/2026/07` therefore also matches `Daily/2026/07-Jul/…`.
- Unknown placeholders (typos) and invalid date formats are left as-is, so nothing is force-updated instead of silently matching the wrong folder. The settings tab shows what each configured entry currently resolves to.
- Placeholders are supported in "Folders to force update" only — "Folders to scan" and "Folders to ignore" take static paths.

## Per-note ignore flag

Individual notes can opt out of serialization by setting the `dataview_serializer_ignore` property in their frontmatter:

```yaml
---
dataview_serializer_ignore: true
---
```

When this property is truthy, the plugin skips the note entirely: no queries inside it will be serialized, even when running the "Scan and serialize" commands manually. See [Ignoring a specific note](usage.md#ignoring-a-specific-note) for accepted values.
