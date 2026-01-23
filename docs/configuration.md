# Configuration

In the settings of the plugin, you can configure:

## General Settings

- **Disable automatic updates**: When enabled, the plugin will not automatically serialize queries when files are created, modified, or renamed. You can still manually serialize queries using the command palette. This is useful if you prefer full control over when queries are updated.

- **Show refresh button**: When enabled, a refresh button will be displayed next to each serialized Dataview query in the editor. Clicking this button will refresh only that specific query.

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
