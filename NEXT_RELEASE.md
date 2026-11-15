### Force update triggers

**Folders to force update** re-serializes your index notes after a change to any file in the vault. With the new **Force update triggers** setting, it runs only when one of the notes or folders you list (or a note inside those folders) is created, modified, renamed or moved. Notes that have nothing to do with your indexes no longer re-run their queries.

Leave the list empty and nothing changes. Triggers take the same date placeholders, such as `{{year}}`.

### Custom views with dv.view()

Serialized DataviewJS queries can now call `dv.view(path, input)`, as in Dataview. What the view renders through `dv.list()`, `dv.table()` and the other supported methods is serialized like the query's own output. A `view.css` file is not applied, and a view that builds HTML through `dv.container` has nothing to render into.

Also handy: a marker comment cannot contain `--`, but a view script can.

### Results keep updating after Dataview reloads

After Dataview was disabled and re-enabled, or updated, serialized results stopped changing until you restarted Obsidian. No more. The plugin now uses the Dataview that is loaded at that moment, and while Dataview is disabled, your notes are left untouched.

### Hide query text covers single-line DataviewJS queries

With **Hide query text** on, single-line DataviewJS queries now collapse in Live Preview, like single-line DQL queries.

Thanks to @demrom, who contributed every change in this release.
