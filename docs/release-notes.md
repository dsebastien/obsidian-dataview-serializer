# Release Notes

## 3.1.0 (2026-08-30)

### Features

* **build:** fail the build on a lockfile the catalog review cannot parse
* **build:** make the rule floor check that it is still wired in
* **build:** refuse commits that loosen the rules instead of fixing the finding
* **plugin:** add the {{isoyear}} path placeholder

## 3.0.1 (2026-08-29)

### Bug Fixes

* **build:** move the command-id exemption out of the source file

## 3.0.0 (2026-08-28)

### ⚠ BREAKING CHANGES

* **plugin:** requires Obsidian 1.13.0 (minAppVersion bumped from 1.8.7).

`getSettingDefinitions()` replaces `display()` — all-or-nothing, so the whole
404-line tab is now declarative. Obsidian owns navigation, focus and ARIA, and
every setting name and description is indexed by the settings search.

The write path changed with it. Every control used to `produce()` a new settings
object and then call `saveSettings()`, so a failed write left memory ahead of
disk and the control showing a value that was never stored. Edits now go through
a serialized, persist-then-commit `updateSettings`: memory is swapped only after
saveData() resolves, and writes queue so each mutation derives from the previous
committed state. That matters here because adding a folder and flipping a toggle
are one click apart, and the old code would have dropped the first of two
overlapping edits.

The three folder lists become native `type: 'list'` groups, so delete comes from
the framework rather than a hand-rolled Remove button per row. `onDelete` reads
the LIVE array and resolves the entry by value before writing — the index it
receives can be stale by the time the write runs. Adding keeps its inline search
box rather than moving to the framework's `addItem` affordance, because the
point of that box is the FolderSuggest completion.

Side effects preserved and now sequenced after the write: registering and
unregistering the file-event handlers, and `setDebugMode`. The device-local
disable is deliberately NOT routed through `updateSettings` — it lives in
device-local storage and is never synced — and turning automatic updates back on
no longer resurrects handlers on a device where the plugin is switched off.

Covered by settings-write.spec.ts (13 tests: queue, rollback, validation, and
handler sequencing) plus the collection's settings guard spec. Both regressions
were checked against a deliberately broken `updateSettings` to confirm the tests
actually fail. Verified in a live vault: pane renders, folder add and delete
round-trip, an invalid link format is rejected without touching the store, all
six command ids unchanged, and data.json byte-identical afterwards.

### Features

* **plugin:** declare settings via getSettingDefinitions (Obsidian 1.13)

### Bug Fixes

* **build:** lint against the catalog's ruleset, and fix what it found
* **plugin:** a failed dv.execute() must not erase the query it came from

## 2.15.1 (2026-08-19)

### Bug Fixes

* **plugin:** harden the DataviewJS abandonment guard and skip reads for rejected files
* **plugin:** keep cached editor widgets and folder index from serving stale state

### Performance Improvements

* **plugin:** reduce vault scans and editor rebuild cost (11 items)

## 2.15.0 (2026-08-19)

### Features

* **plugin:** show what's new in a tab instead of a modal dialog

### Bug Fixes

* **logging:** restore console output when debug logging is enabled

## 2.14.0 (2026-07-29)

### Features

* **plugin:** surface support CTAs everywhere users can see them

### Bug Fixes

* **plugin:** keep serialized output inside callouts and blockquotes

## 2.13.0 (2026-07-29)

### Features

* **plugin:** aggregate what's new dialogs across simultaneously updated plugins

## 2.12.0 (2026-07-29)

### Features

* **plugin:** add Knowii community to the what's new dialog and harden it

## 2.11.0 (2026-07-29)

### Features

* **plugin:** add Knowii community to the what's new dialog and harden it

## 2.10.0 (2026-07-29)

### Features

* **plugin:** support date placeholders in folders to force update

## 2.9.0 (2026-07-27)

### Features

* **plugin:** show a what's new dialog once after plugin updates

## 2.8.1 (2026-07-18)

### Bug Fixes

* **plugin:** remove disallowed no-explicit-any casts flagged by catalog review

## 2.8.0 (2026-07-17)

### Features

* **plugin:** add device-local "disable on this device" toggle

## 2.7.0 (2026-05-15)

### Features

* **all:** added a way to force ignore dataview serializer queries in a note

## 2.6.4 (2026-05-14)

## 2.6.3 (2026-05-13)

## 2.6.2 (2026-05-13)

## 2.6.1 (2026-04-28)

### Bug Fixes

* **plugin:** allow forced folder files to re-process after cooldown expires

## 2.6.0 (2026-03-27)

### Features

* **all:** fixed bug with link format setting
* **all:** updated workflows

## 2.5.2 (2026-03-10)

### Bug Fixes

* **all:** fix EOF limitation

## 2.5.1 (2026-03-10)

### Bug Fixes

* **all:** fixed bug with regex queries

## 2.5.0 (2026-02-21)

### Features

* **all:** added command to remove all dataview serializer queries
* **all:** added validate and release scripts
* **all:** improved notes
* **all:** updated release
* **all:** updated scripts

## 2.4.5 (2026-01-28)

### Bug Fixes

* **all:** removed Tailwind CSS reset to avoid side-effects

### Performance Improvements

* **all:** precompile regular expressions
## 2.4.4 (2026-01-25)

### Bug Fixes

* **all:** ensure previous serialized queries are cleaned up correctly
## 2.4.3 (2026-01-25)

### Bug Fixes

* **all:** added a fix for absolute paths ignoring setting for tables
## 2.4.2 (2026-01-25)

### Features

* **all:** added support for DataviewJS queries

### Bug Fixes

* **all:** removed node path module usage to fix iOS issue
## 2.4.1 (2026-01-25)

### Bug Fixes

* **all:** fixed  matching for single-line queries where there are spaces before the end marker
## 2.4.0 (2026-01-24)

### Features

* **all:** added a notice for invalid queries with the file path
* **all:** added query serialization batching to improve perf
## 2.3.2 (2026-01-24)

### Features

* **all:** added support for alternative syntax
* **all:** added support for inline queries
## 2.3.1 (2026-01-24)

### Bug Fixes

* **all:** implemented a fix for [#47](https://github.com/dsebastien/obsidian-dataview-serializer/issues/47)
## 2.3.0 (2026-01-24)

### Features

* **all:** added support for TASK queries
## 2.2.0 (2026-01-24)

### Features

* **all:** added a setting to control how links are generated in serialized queries
* **all:** added setting to add an extra new line before the end marker
* **all:** added support for converting dataview queries
* **all:** added support for multiline queries
* **all:** improved query rendering

### Bug Fixes

* **all:** fix query matching
* **all:** fixed matching issue with idempotency checks vs initial serialized query removal
## 2.0.0 (2026-01-24)

### Features

* **all:** added command to serialize queries in the current file
* **all:** added debug mode and error notices for invalid queries
* **all:** added support for forcing updates to specific folders
* **all:** added support for manual and 'once' queries
* **all:** added support for queries that disappear once serialized (ie only keep the output)
* **all:** improved look and feel of queries
* **all:** improved manual query refresh button
* **all:** skip serialization of queries that would cause needless file modifications
* **plugin:** add inline refresh button for Dataview queries

### Bug Fixes

* **all:** wait for all plugins to be loaded to avoid loading this plugin before Dataview
## 1.9.0 (2026-01-06)
## 1.8.1 (2025-08-03)
## 1.8.0 (2025-05-23)
## 1.7.3 (2025-05-23)
## 1.7.2 (2025-05-23)
## 1.7.1 (2025-05-23)
## 1.7.0 (2025-05-23)
## 1.6.0 (2025-05-23)
## 1.5.1 (2024-11-26)

### Reverts

* Revert "feat: Enable updates to all files, not just recently modified"
## 1.5.0 (2024-11-26)

### Features

* Enable updates to all files, not just recently modified
## 1.4.1 (2024-10-27)
## 1.4.0 (2024-10-09)
## 1.3.0 (2024-08-25)
## 1.2.0 (2024-07-04)
## 1.1.5 (2024-07-04)
## 1.1.4 (2024-06-05)
## 1.1.3 (2024-06-05)
## 1.1.2 (2024-05-23)
## 1.1.1 (2024-05-22)
## 1.1.0 (2024-05-22)
## 1.0.5 (2024-05-18)
## 1.0.4 (2024-05-16)
## 1.0.3 (2024-05-14)
## 1.0.2 (2024-05-14)
## 1.0.1 (2024-05-14)
## 1.0.0 (2024-05-13)

