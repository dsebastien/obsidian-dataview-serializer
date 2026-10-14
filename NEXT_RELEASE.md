### Periodic full serialization

Index notes and MoCs whose queries read other notes no longer have to wait for you to touch them. Turn on **Periodic full serialization** in the plugin settings and every query in your folders to scan is re-serialized every X minutes (30 by default, 5 minimum).

The timer behaves like an automatic update: folders to ignore, the `dataview_serializer_ignore` flag, and manual-only queries are respected. It stays silent, and it only rewrites notes whose output actually changed. It works even with automatic updates disabled.

The setting is stored on each device and never synced. Turn it on on one device, typically your desktop, so several devices don't rewrite the same notes and cause sync conflicts.

### Folders to scan now limits "Scan and serialize all"

The **Folders to scan** setting was saved but ignored: the "Scan and serialize all Dataview queries" command always processed the whole vault. It now covers only the folders you list, or the whole vault when the list is empty. If you had folders listed there, the command will now skip notes outside them.
