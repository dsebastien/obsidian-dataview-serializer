# Query Processing Performance Optimization Plan

## Summary

Optimize the Obsidian Dataview Serializer plugin's query processing performance through caching and string manipulation improvements.

## Status

Most of this plan shipped with PR #68 (perf pass, 2026-08), though with a simpler design than originally sketched below. What shipped:

- **Vault file-name index** — `src/app/utils/vault-name-index.fn.ts` builds a `Map<fileName, occurrenceCount>` in one vault walk. `serializeQuery()` consults it through a lazy `getVaultNameIndex` provider, so the index is built at most once per file-processing pass (and not at all when no link needs shortening). This replaces the per-link `vault.getFiles().filter(...)` scan. The originally planned `VaultFileCache` class (TTL-based, plugin-lifetime, event-invalidated) was **not** implemented — the per-pass index is simpler and cannot serve stale data across passes. Revisit the long-lived cache only if profiling shows index construction itself is a bottleneck in very large vaults.
- **Single-pass link rewriting** — `rewriteLinks()` in `serialize-query.fn.ts` rebuilds the output from match offsets instead of one `String.replace` per link (which was quadratic and could hit the wrong occurrence).
- **Cheap rejection gates** — `hasInlineQueryMarker()` and the `COMMENT_OPENER` prefilter in `refresh-button-extension.ts` skip parsing for lines/files without HTML comments; `shouldFileBeIgnored()` performs all metadata-only rejections (type, canvas, Excalidraw, frontmatter opt-out, cooldown, ignored folders) before reading file content, and reads through `cachedRead`.
- **Editor widget reuse** — CodeMirror widgets have stable identity via `eq()` (query, type, and refresh-button setting), so unchanged badges/buttons keep their DOM across rebuilds.
- **Indentation** — superseded: indentation runs through `applyIndentation()` (`blockquote.fn.ts`), which is blockquote-aware; the plan's single-`replace` micro-optimization no longer applies to the current code shape.

## Remaining Work

| Item                                                     | Impact     | Notes                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache query-specific replacement regexes                 | LOW-MEDIUM | `buildBlockQueryReplacementRegex` / `buildDataviewJSReplacementRegex` (`serialized-block-regexes.fn.ts`) still construct regexes per query per pass. A module-level `Map<cacheKey, RegExp>` keyed on the query text + flags would remove that. Only worth doing if profiling shows regex construction matters. |
| `vault.read()` vs `cachedRead()` before `vault.modify()` | —          | `processFile()` bases its rewrite on `cachedRead` (pre-dating PR #68). Obsidian docs recommend `read()` when the content feeds a subsequent write. Consider `vault.process()` for an atomic read-modify-write if stale-cache writes are ever observed in the wild.                                             |

## Verification

1. **Run existing tests:** `bun test`
2. **Manual testing:**
    - Create vault with 100+ files containing queries
    - Time `serialize-all-dataview-queries` command before/after
    - Verify idempotency (running twice produces same output)
3. **Check TypeScript:** `bun run tsc:watch`
4. **Lint/format:** `bun run format && bun run lint`
