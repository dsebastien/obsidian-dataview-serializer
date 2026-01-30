# Release Notes

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

