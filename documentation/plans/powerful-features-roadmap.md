# Powerful Features Roadmap

## Summary

A collection of high-impact feature ideas to significantly enhance the Obsidian Dataview Serializer plugin's capabilities, user experience, and performance.

## Feature Overview

| Feature                          | Impact | Complexity | Category      |
| -------------------------------- | ------ | ---------- | ------------- |
| Query Dashboard & Analytics      | HIGH   | MEDIUM     | UX            |
| Smart Caching & Change Detection | HIGH   | MEDIUM     | Performance   |
| Query Templates/Presets          | HIGH   | HIGH       | Functionality |
| Scheduled/Timed Updates          | MEDIUM | MEDIUM     | Automation    |
| Query Result Diffing             | MEDIUM | MEDIUM     | UX            |
| External Data Sources            | HIGH   | HIGH       | Functionality |
| Conditional Query Execution      | MEDIUM | MEDIUM     | Functionality |
| Query Validation & Preview       | MEDIUM | LOW        | UX            |
| Cross-Query Dependencies         | HIGH   | HIGH       | Functionality |
| Export Capabilities              | LOW    | LOW        | Functionality |
| Query Snippets Library           | MEDIUM | LOW        | UX            |
| Custom Output Formatters         | HIGH   | MEDIUM     | Functionality |
| Result History & Snapshots       | MEDIUM | MEDIUM     | Data          |
| Query Performance Profiler       | MEDIUM | LOW        | DevEx         |
| Batch Query Operations           | MEDIUM | LOW        | Automation    |
| Query Notifications              | LOW    | LOW        | Automation    |
| Live Preview Mode                | HIGH   | HIGH       | UX            |
| Query Inheritance                | MEDIUM | HIGH       | Functionality |
| Obsidian Sync Conflict Handler   | MEDIUM | MEDIUM     | Integration   |
| Query Bookmarks                  | LOW    | LOW        | UX            |

---

## Feature Details

### 1. Query Dashboard & Analytics

**Impact:** HIGH | **Complexity:** MEDIUM

A modal or sidebar view showing all serialized queries across the vault.

**Capabilities:**

- List all queries with their locations (file path + line number)
- Show query status: last updated timestamp, stale indicator, error state
- Display execution time statistics per query
- Quick navigation: click to jump to query location
- Bulk operations: update all stale, re-run failed, refresh all

**Implementation Approach:**

- Create `QueryDashboardModal` extending Obsidian's `Modal`
- Scan vault for all query markers on modal open
- Store query metadata (last run, duration, status) in plugin data
- Add command: "Open query dashboard"

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────┐
│ Query Dashboard                              [Refresh] │
├─────────────────────────────────────────────────────────┤
│ ✓ Projects/Index.md:15      LIST...    2min ago   45ms │
│ ✓ Daily/2026-01-25.md:8     TABLE...   5min ago   120ms│
│ ⚠ Archive/Old.md:22         LIST...    Stale      --   │
│ ✗ Reports/Q1.md:45          TABLE...   Error      --   │
├─────────────────────────────────────────────────────────┤
│ [Update Stale] [Re-run Failed] [Update All]            │
└─────────────────────────────────────────────────────────┘
```

---

### 2. Smart Caching with Change Detection

**Impact:** HIGH | **Complexity:** MEDIUM

Skip unnecessary file writes by detecting when query output hasn't changed.

**Capabilities:**

- Hash query results before writing
- Compare hash with previous result hash
- Skip file modification if output identical
- Track which source files affect which queries
- Targeted cache invalidation based on file changes

**Implementation Approach:**

- Store result hashes in plugin data: `Map<queryId, hash>`
- Generate queryId from file path + query marker position
- Use fast hashing (e.g., simple string hash or xxHash)
- Before writing, compare new hash with stored hash
- Invalidate relevant caches on file change events

**Benefits:**

- Reduces unnecessary file writes (better for sync, git)
- Improves performance for unchanged queries
- Cleaner modification timestamps

---

### 3. Query Templates/Presets

**Impact:** HIGH | **Complexity:** HIGH

Define reusable query patterns with parameters for common use cases.

**Syntax Options:**

Option A - Definition + Usage:

```markdown
<!-- QueryTemplate: recentNotes(folder, limit) -->

LIST FROM "{{folder}}" SORT file.mtime DESC LIMIT {{limit}}

<!-- /QueryTemplate -->

<!-- UseTemplate: recentNotes("Projects", 10) -->
<!-- SerializedQuery: recentNotes("Projects", 10) -->

...results...

<!-- SerializedQuery END -->
```

Option B - External template file:

```markdown
<!-- UseTemplate: templates/recent-notes | folder="Projects", limit=10 -->
```

**Implementation Approach:**

- Parse template definitions from designated file or inline
- Store templates in plugin settings or dedicated `.md` file
- Parameter substitution using simple `{{param}}` syntax
- Template inheritance/composition for advanced users

**Use Cases:**

- Consistent "recent files" queries across notes
- Standard project dashboards
- Reusable report formats

---

### 4. Scheduled/Timed Updates

**Impact:** MEDIUM | **Complexity:** MEDIUM

Automatically update queries on a configurable schedule.

**Capabilities:**

- Per-query schedule: `<!-- QueryToSerialize[hourly]: ... -->`
- Global schedule in settings (e.g., update all every 6 hours)
- Update on Obsidian startup option
- Update specific folders on schedule

**Implementation Approach:**

- Use `window.setInterval` with `this.registerInterval()`
- Store last update timestamps in plugin data
- Check schedules on interval tick
- Add setting: "Update interval" (off, 1h, 6h, 12h, 24h)

**Schedule Syntax:**

```markdown
<!-- QueryToSerialize[daily]: LIST FROM "Projects" -->
<!-- QueryToSerialize[hourly]: TABLE ... -->
<!-- QueryToSerialize[startup]: LIST ... -->
```

---

### 5. Query Result Diffing

**Impact:** MEDIUM | **Complexity:** MEDIUM

Show what changed between query updates.

**Capabilities:**

- Visual diff modal before committing changes
- Optional: append changelog section to result
- Highlight added/removed items
- "Accept" or "Cancel" update flow

**Implementation Approach:**

- Store previous result in memory during update
- Use diff algorithm (e.g., diff-match-patch or simple line diff)
- Create `QueryDiffModal` with side-by-side or inline view
- Add setting: "Show diff before update" (off, always, on manual only)

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────┐
│ Query Changes                                          │
├─────────────────────────────────────────────────────────┤
│ - [[Old Project]]                                      │
│ + [[New Project]]                                      │
│   [[Unchanged Project]]                                │
│ + [[Another New One]]                                  │
├─────────────────────────────────────────────────────────┤
│ 2 additions, 1 removal                                 │
│                              [Cancel]  [Apply Changes] │
└─────────────────────────────────────────────────────────┘
```

---

### 6. External Data Sources

**Impact:** HIGH | **Complexity:** HIGH

Fetch and serialize data from sources outside the vault.

**Capabilities:**

- Fetch JSON/CSV from URLs
- Read local files outside vault
- Combine external data with Dataview results
- Caching with TTL for external requests

**Syntax:**

```markdown
<!-- ExternalQuery: https://api.example.com/data.json | jq ".items[] | .name" -->
<!-- SerializedQuery: ... -->

<!-- ExternalQuery: file:///path/to/data.csv | csv -->
```

**Implementation Approach:**

- Use `fetch()` for HTTP requests (with timeout)
- Use Obsidian's `requestUrl()` for better compatibility
- Support transformers: JSON path, CSV parsing, simple filters
- Cache responses with configurable TTL
- Security: allowlist domains in settings

**Considerations:**

- Mobile compatibility (network restrictions)
- Security (no arbitrary code execution)
- Rate limiting / request caching

---

### 7. Conditional Query Execution

**Impact:** MEDIUM | **Complexity:** MEDIUM

Only execute queries when certain conditions are met.

**Syntax Options:**

```markdown
<!-- QueryToSerialize[if: this.status = "active"]: LIST ... -->
<!-- QueryToSerialize[if: date(today) > this.deadline]: TABLE ... -->
<!-- QueryToSerialize[if: file.folder = "Active"]: LIST ... -->
```

**Implementation Approach:**

- Parse condition from query marker
- Evaluate condition using Dataview's expression evaluator
- Skip query execution if condition is false
- Show "skipped" indicator in dashboard

**Use Cases:**

- Only show overdue tasks when they exist
- Conditional sections based on note metadata
- Time-based query activation

---

### 8. Query Validation & Preview

**Impact:** MEDIUM | **Complexity:** LOW

Validate query syntax and preview results without serializing.

**Capabilities:**

- Syntax validation command: highlight errors in query
- Preview command: show results in modal without writing to file
- Syntax highlighting for queries in HTML comments (via CodeMirror extension)

**Implementation Approach:**

- Add command: "Validate query at cursor"
- Add command: "Preview query at cursor"
- Use Dataview API to parse/validate without executing
- Display results in read-only modal

**Benefits:**

- Faster iteration on complex queries
- Catch syntax errors before saving
- Safe experimentation

---

### 9. Cross-Query Dependencies

**Impact:** HIGH | **Complexity:** HIGH

Reference one query's output in another query.

**Syntax:**

```markdown
<!-- QueryToSerialize[id: active-projects]: LIST FROM "Projects" WHERE status = "active" -->
<!-- SerializedQuery: active-projects -->

...

<!-- SerializedQuery END -->

<!-- QueryToSerialize[uses: active-projects]: TABLE ... FROM @active-projects -->
```

**Implementation Approach:**

- Assign IDs to queries via syntax extension
- Build dependency graph before processing
- Topological sort for execution order
- Pass results between queries via temporary storage
- Detect and error on circular dependencies

**Use Cases:**

- Filter results of one query with another
- Build aggregations from multiple sources
- Create layered dashboards

---

### 10. Export Capabilities

**Impact:** LOW | **Complexity:** LOW

Export serialized results to external formats.

**Capabilities:**

- Export to CSV, JSON, or plain text
- Copy to clipboard in various formats
- Save to external file (outside vault)
- Bulk export all queries

**Implementation Approach:**

- Add commands: "Export query to CSV", "Export query to JSON"
- Parse serialized markdown back to structured data
- Use Obsidian's file system APIs or clipboard API
- Add export button next to refresh button (optional)

---

### 11. Query Snippets Library

**Impact:** MEDIUM | **Complexity:** LOW

A built-in library of common query patterns users can insert with a command.

**Capabilities:**

- Command palette: "Insert query snippet"
- Searchable list of common patterns
- User can add custom snippets
- Snippets include placeholder text for customization

**Built-in Snippets:**

```markdown
# Recent files in folder

LIST FROM "{{folder}}" SORT file.mtime DESC LIMIT {{10}}

# Tasks due this week

TASK FROM "{{folder}}" WHERE due <= date(eow) AND !completed

# Files with specific tag

LIST FROM #{{tag}} SORT file.name ASC

# Table of projects by status

TABLE status, priority, due FROM "Projects" SORT status ASC
```

**Implementation Approach:**

- Store snippets in settings (default + user-defined)
- Create `SnippetPickerModal` with fuzzy search
- Insert at cursor position with placeholders selected
- Add command: "Insert serialized query snippet"

---

### 12. Custom Output Formatters

**Impact:** HIGH | **Complexity:** MEDIUM

User-defined templates for how query results are rendered.

**Capabilities:**

- Define output format per query or globally
- Template variables: `{{item}}`, `{{index}}`, `{{count}}`
- Support different formats: bullet, numbered, callout, card
- Conditional formatting based on data

**Syntax:**

```markdown
<!-- QueryToSerialize[format: callout]: LIST FROM "Projects" -->
<!-- QueryToSerialize[format: numbered]: LIST FROM "Tasks" -->
<!-- QueryToSerialize[format: custom:myformat]: LIST FROM ... -->
```

**Custom Format Definition (in settings):**

```yaml
myformat:
    wrapper: "> [!note] {{title}}\n{{items}}"
    item: '> - {{link}} ({{status}})'
    empty: '> No items found'
```

**Implementation Approach:**

- Add `outputFormat` field to query detection
- Create formatter registry with built-in formatters
- Allow custom formatters in settings (YAML/JSON)
- Template engine with simple variable substitution

---

### 13. Result History & Snapshots

**Impact:** MEDIUM | **Complexity:** MEDIUM

Track query results over time for comparison and rollback.

**Capabilities:**

- Automatic snapshots on each update (configurable retention)
- Compare current vs historical results
- Rollback to previous result
- View change timeline for a query

**Implementation Approach:**

- Store snapshots in plugin data: `Map<queryId, Snapshot[]>`
- Configurable retention: last N snapshots or time-based
- Add command: "View query history"
- Create `QueryHistoryModal` with timeline view

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────┐
│ Query History: Projects/Index.md:15                    │
├─────────────────────────────────────────────────────────┤
│ ● Today 10:30 AM     5 items  (+1, -0)     [Restore]  │
│ ○ Yesterday 3:15 PM  4 items  (+0, -2)     [Restore]  │
│ ○ Jan 23, 9:00 AM    6 items  (baseline)   [Restore]  │
├─────────────────────────────────────────────────────────┤
│                                      [Compare Selected] │
└─────────────────────────────────────────────────────────┘
```

---

### 14. Query Performance Profiler

**Impact:** MEDIUM | **Complexity:** LOW

Identify slow queries and optimization opportunities.

**Capabilities:**

- Measure execution time for each query
- Show breakdown: Dataview execution vs serialization vs file write
- Identify queries that would benefit from caching
- Suggest optimizations (e.g., add LIMIT, use specific folder)

**Implementation Approach:**

- Add timing instrumentation to query processing
- Store performance data in memory (session-based)
- Add command: "Show query performance report"
- Display in dashboard or dedicated modal

**Performance Report:**

```
┌─────────────────────────────────────────────────────────┐
│ Query Performance Report                               │
├─────────────────────────────────────────────────────────┤
│ Slowest Queries:                                       │
│ 1. Reports/All.md:10    2.3s  (scanning entire vault)  │
│ 2. Index.md:45          890ms (no LIMIT clause)        │
│ 3. Daily/Today.md:8     120ms (optimal)                │
│                                                         │
│ Recommendations:                                        │
│ • Query #1: Add folder filter to reduce scan scope     │
│ • Query #2: Add LIMIT to reduce result processing      │
└─────────────────────────────────────────────────────────┘
```

---

### 15. Batch Query Operations

**Impact:** MEDIUM | **Complexity:** LOW

Apply operations to multiple queries at once.

**Capabilities:**

- Select queries by criteria (folder, status, type)
- Bulk update mode (auto → manual, etc.)
- Bulk refresh selected queries
- Bulk delete serialized results (clear all)

**Commands:**

- "Convert all auto queries to manual in current file"
- "Refresh all queries in folder"
- "Clear all serialized results in vault"
- "Convert all legacy syntax to alternative syntax"

**Implementation Approach:**

- Add query selection UI to dashboard
- Implement batch modification functions
- Add confirmation dialogs for destructive operations
- Progress indicator for large batch operations

---

### 16. Query Notifications

**Impact:** LOW | **Complexity:** LOW

Get notified when query results change significantly.

**Capabilities:**

- Configure thresholds: "notify if > 5 items added/removed"
- Notification types: Obsidian notice, system notification
- Summary of changes in notification
- Click notification to jump to query

**Syntax:**

```markdown
<!-- QueryToSerialize[notify: changes > 3]: LIST FROM "Inbox" -->
```

**Implementation Approach:**

- Compare result counts before/after
- Use Obsidian's `Notice` API for in-app notifications
- Optional: use system notifications for background updates
- Add setting: notification preferences

---

### 17. Live Preview Mode

**Impact:** HIGH | **Complexity:** HIGH

See query results update in real-time as you type the query.

**Capabilities:**

- Split view: query editor + live results
- Debounced updates as you modify the query
- Syntax highlighting in query editor
- Error highlighting for invalid queries

**Implementation Approach:**

- Create `LiveQueryView` as Obsidian leaf
- Use CodeMirror extension for syntax highlighting
- Debounce query execution (300ms)
- Display results in scrollable pane

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────┐
│ Live Query Editor                              [Save]  │
├──────────────────────────┬──────────────────────────────┤
│ LIST FROM "Projects"     │ • [[Project A]]             │
│ WHERE status = "active"  │ • [[Project B]]             │
│ SORT file.mtime DESC     │ • [[Project C]]             │
│ LIMIT 10                 │                              │
│ █                        │ 3 results (45ms)            │
└──────────────────────────┴──────────────────────────────┘
```

---

### 18. Query Inheritance

**Impact:** MEDIUM | **Complexity:** HIGH

Define base queries that others can extend or override.

**Capabilities:**

- Define base query in parent note or template
- Child notes inherit and can override parameters
- Useful for consistent project/area dashboards
- Supports property overrides

**Syntax:**

```markdown
# In Templates/Project.md

<!-- BaseQuery[id: project-tasks]: TASK FROM "{{folder}}" WHERE !completed -->

# In Projects/MyProject.md (inherits from template)

<!-- QueryExtends: project-tasks | folder="Projects/MyProject" -->
```

**Implementation Approach:**

- Resolve inheritance chain on query execution
- Support parameter overrides
- Detect circular inheritance
- Cache resolved queries for performance

---

### 19. Obsidian Sync Conflict Handler

**Impact:** MEDIUM | **Complexity:** MEDIUM

Gracefully handle sync conflicts for serialized queries.

**Capabilities:**

- Detect when sync creates conflicting versions
- Merge strategy: keep newest, keep both, manual resolve
- Avoid re-serializing immediately after sync
- Conflict notification with resolution options

**Implementation Approach:**

- Hook into Obsidian's sync events (if available)
- Detect conflicting result markers
- Add setting: sync conflict strategy
- Create `ConflictResolverModal` for manual resolution

**Conflict Strategies:**

- **Auto-newer**: Keep the most recently updated version
- **Auto-local**: Always keep local changes
- **Auto-remote**: Always accept remote changes
- **Manual**: Show conflict modal for user decision

---

### 20. Query Bookmarks

**Impact:** LOW | **Complexity:** LOW

Quick access to frequently used queries.

**Capabilities:**

- Bookmark queries for quick refresh
- Access from command palette or status bar
- Organize bookmarks into groups
- One-click refresh for bookmarked queries

**Implementation Approach:**

- Store bookmarks in plugin settings
- Add command: "Bookmark query at cursor"
- Add command: "Refresh bookmarked query" (with picker)
- Optional: status bar icon showing bookmark count

---

## Implementation Priority

### Phase 1: Quick Wins (Low complexity, High value)

1. Query Validation & Preview
2. Export Capabilities
3. Smart Caching (hash-based skip)
4. Query Snippets Library
5. Query Performance Profiler
6. Query Bookmarks
7. Batch Query Operations

### Phase 2: Core Enhancements

8. Query Dashboard & Analytics
9. Query Result Diffing
10. Conditional Query Execution
11. Query Notifications
12. Custom Output Formatters
13. Result History & Snapshots
14. Obsidian Sync Conflict Handler

### Phase 3: Advanced Features

15. Scheduled/Timed Updates
16. Query Templates/Presets
17. External Data Sources
18. Cross-Query Dependencies
19. Live Preview Mode
20. Query Inheritance

---

## Files to Create/Modify

| Feature                  | New Files                                  | Modified Files                    |
| ------------------------ | ------------------------------------------ | --------------------------------- |
| Query Dashboard          | `src/app/ui/query-dashboard-modal.ts`      | `plugin.ts` (commands)            |
| Smart Caching            | `src/app/cache/result-cache.ts`            | `plugin.ts`, `serialize-*.ts`     |
| Query Templates          | `src/app/templates/template-engine.ts`     | `plugin.ts`, `find-queries.fn.ts` |
| Scheduled Updates        | `src/app/scheduler/update-scheduler.ts`    | `plugin.ts`, `settings.ts`        |
| Result Diffing           | `src/app/ui/query-diff-modal.ts`           | `plugin.ts`                       |
| External Data Sources    | `src/app/external/data-fetcher.ts`         | `plugin.ts`, new query type       |
| Conditional Execution    | --                                         | `find-queries.fn.ts`, `plugin.ts` |
| Validation & Preview     | `src/app/ui/query-preview-modal.ts`        | `plugin.ts`                       |
| Cross-Query Dependencies | `src/app/graph/dependency-graph.ts`        | `plugin.ts`, `find-queries.fn.ts` |
| Export Capabilities      | `src/app/export/exporter.ts`               | `plugin.ts`                       |
| Query Snippets           | `src/app/ui/snippet-picker-modal.ts`       | `plugin.ts`, `settings.ts`        |
| Custom Formatters        | `src/app/formatters/formatter-registry.ts` | `serialize-*.ts`, `settings.ts`   |
| Result History           | `src/app/history/snapshot-manager.ts`      | `plugin.ts`, `settings.ts`        |
| Performance Profiler     | `src/app/profiler/query-profiler.ts`       | `plugin.ts`, `serialize-*.ts`     |
| Batch Operations         | `src/app/batch/batch-operations.ts`        | `plugin.ts`                       |
| Query Notifications      | `src/app/notifications/notifier.ts`        | `plugin.ts`, `settings.ts`        |
| Live Preview             | `src/app/views/live-query-view.ts`         | `plugin.ts`                       |
| Query Inheritance        | `src/app/inheritance/resolver.ts`          | `find-queries.fn.ts`, `plugin.ts` |
| Sync Conflict Handler    | `src/app/sync/conflict-handler.ts`         | `plugin.ts`, `settings.ts`        |
| Query Bookmarks          | `src/app/bookmarks/bookmark-manager.ts`    | `plugin.ts`, `settings.ts`        |

---

## Open Questions

1. **Templates**: Should templates be stored in settings, a dedicated file, or inline in notes?
2. **External data**: What security model for URL fetching? Allowlist? User confirmation?
3. **Scheduling**: Per-query schedules vs global schedules vs both?
4. **Dashboard**: Modal vs sidebar leaf vs separate view?
5. **Dependencies**: How to handle circular dependency errors gracefully?
6. **Snippets**: Ship with how many built-in snippets? Allow community snippet sharing?
7. **Formatters**: YAML vs JSON for custom formatter definitions?
8. **History**: How many snapshots to retain by default? Storage impact for large vaults?
9. **Sync conflicts**: Can we reliably detect Obsidian Sync events? Fallback strategies?
10. **Live preview**: Performance impact of continuous query execution? Throttling strategy?
11. **Inheritance**: How deep can inheritance chains go? Performance implications?
12. **Notifications**: System notifications require permissions - graceful fallback?

## Feature Combinations

Some features work well together and could share infrastructure:

| Feature A             | Feature B            | Shared Component              |
| --------------------- | -------------------- | ----------------------------- |
| Dashboard             | Bookmarks            | Query index/registry          |
| History               | Diffing              | Snapshot storage, diff engine |
| Validation            | Live Preview         | Query parser, error handling  |
| Templates             | Snippets             | Template engine, picker UI    |
| Caching               | Performance Profiler | Timing infrastructure         |
| Conditional Execution | Notifications        | Condition evaluation engine   |
