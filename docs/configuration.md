# Configuration

In the settings of the plugin, you can configure:

## General Settings

- **Disable automatic updates**: When enabled, the plugin will not automatically serialize queries when files are created, modified, or renamed. You can still manually serialize queries using the command palette. This is useful if you prefer full control over when queries are updated.

- **Show refresh button**: When enabled, a refresh button will be displayed next to each serialized Dataview query in the editor. Clicking this button will refresh only that specific query.

- **Show error notifications**: When enabled, a notification popup will be displayed when a query fails to serialize. This helps you identify and fix invalid queries. Errors show the problematic query and the error message from Dataview.

- **Debug logging**: When enabled, verbose debug messages will be logged to the browser console. This is useful for troubleshooting issues with the plugin. When disabled (default), only warnings and errors are logged, keeping the console clean.

- **Enable DataviewJS queries**: When enabled (default), the plugin will process DataviewJS queries in addition to standard Dataview DQL queries. DataviewJS queries allow you to write JavaScript code using the Dataview API. When disabled, DataviewJS queries will be ignored during serialization.

## Output Settings

- **Add trailing newline**: When enabled, an empty line will be added between the serialized content and the END marker. This is useful for static site generators like Jekyll that require blank lines after tables or lists.

- **Link format**: Controls how internal links are formatted in the serialized output. Options:
  - **Use Obsidian setting**: Respects your vault's "New link format" preference (Settings → Files and links → New link format). If Obsidian is set to "Relative path" or "Absolute path", the plugin will preserve full paths.
  - **Shortest path when possible** (default): Simplifies links when the filename is unique in the vault. For example, `[[folder/note.md|note]]` becomes `[[note]]` if there's only one file named `note.md`.
  - **Absolute path**: Always uses the full path to the file. This ensures consistency when syncing vaults across devices using Git or other tools, preventing commit noise from link format differences.

## Folder Settings

- **Folders to scan**: The folders that should be scanned when the "Scan and serialize all Dataview queries" command is executed.

- **Folders to ignore**: The folders that should be excluded when processing files. Files in these folders will not have their queries serialized.

- **Folders to force update**: Folders containing files that should be updated when ANY file in the vault changes. This is useful for index files or dashboards that contain queries aggregating data from elsewhere in your vault.

### Understanding "Folders to force update"

By default, when you modify a file, only that file's queries are re-serialized. However, if you have an "index" or "dashboard" file that contains queries like `LIST FROM #project` or `TABLE file.name FROM "Daily Notes"`, those queries depend on other files in your vault.

By adding the folder containing your index files to "Folders to force update", those files will be re-processed whenever any file in your vault changes. This ensures your index files stay up-to-date.

**Example use case:**
- You have a file at `Index/Projects.md` containing `<!-- QueryToSerialize: LIST FROM #project -->`
- Add `Index` to "Folders to force update"
- Now whenever you add the `#project` tag to any note, your `Projects.md` index will automatically update

**Note:** The force update uses a 10-second debounce delay to avoid overwhelming the system with updates when many files change rapidly.
