# Query Processing Performance Optimization Plan

## Summary

Optimize the Obsidian Dataview Serializer plugin's query processing performance through caching, parallel processing, and regex compilation improvements.

## Identified Bottlenecks (by Impact)

| Bottleneck                                 | Impact | Location                            | Status  |
| ------------------------------------------ | ------ | ----------------------------------- | ------- |
| Sequential file processing                 | HIGH   | `plugin.ts:136-282`                 | ✅ DONE |
| No caching for vault files/link uniqueness | HIGH   | `serialize-query.fn.ts:59,92`       | Pending |
| Regex recompilation per call               | MEDIUM | `find-inline-queries.fn.ts:154-157` | Pending |
| Regex per query in processFile             | MEDIUM | `plugin.ts:752-866`                 | Pending |
| Inefficient string indentation             | LOW    | `serialize-query.fn.ts:203-207`     | Pending |

## Implementation Plan

### Phase 1: Pre-compile Static Regex Patterns

**File:** `src/app/utils/find-inline-queries.fn.ts`

Move regex compilation outside the function. Currently creates 8 new RegExp objects per `findInlineQueries()` call.

```typescript
// Pre-compile regex patterns at module level
const COMPILED_INLINE_PATTERNS = INLINE_QUERY_FLAGS.map(
    ({ flag, updateMode, syntaxVariant, endMarker }) => {
        const escapedFlagOpen = escapeRegExp(flag)
        const escapedFlagClose = escapeRegExp(INLINE_QUERY_FLAG_CLOSE)
        const escapedEnd = escapeRegExp(endMarker)
        return {
            regex: new RegExp(
                `${escapedFlagOpen}(=[^-]*(?:-(?!->)[^-]*)*)${escapedFlagClose}([\\s\\S]*?)${escapedEnd}`,
                'g'
            ),
            updateMode,
            flag,
            syntaxVariant
        }
    }
)
```

Then in `findInlineQueries()`, iterate over `COMPILED_INLINE_PATTERNS` and reset `regex.lastIndex = 0` before each use.

---

### Phase 2: Vault File Cache

**New file:** `src/app/cache/vault-file-cache.ts`

Cache vault file list and filename uniqueness map to avoid repeated scans.

```typescript
export class VaultFileCache {
    private allFiles: TFile[] | null = null
    private nameUniqueness: Map<string, boolean> | null = null
    private lastUpdate = 0
    private maxAge: number

    constructor(
        private app: App,
        maxAgeMs = 1000
    ) {
        this.maxAge = maxAgeMs
    }

    invalidate(): void {
        this.allFiles = null
        this.nameUniqueness = null
    }

    getAllFiles(): TFile[] {
        if (!this.allFiles || this.isStale()) {
            this.allFiles = this.app.vault.getFiles()
            this.lastUpdate = Date.now()
        }
        return this.allFiles
    }

    getNameUniquenessMap(): Map<string, boolean> {
        if (!this.nameUniqueness || this.isStale()) {
            const counts = new Map<string, number>()
            for (const file of this.getAllFiles()) {
                counts.set(file.name, (counts.get(file.name) || 0) + 1)
            }
            this.nameUniqueness = new Map()
            for (const [name, count] of counts) {
                this.nameUniqueness.set(name, count <= 1)
            }
        }
        return this.nameUniqueness
    }

    isNameUnique(name: string): boolean {
        return this.getNameUniquenessMap().get(name) ?? true
    }

    private isStale(): boolean {
        return Date.now() - this.lastUpdate > this.maxAge
    }
}
```

**Modify:** `src/app/utils/serialize-query.fn.ts`

- Accept `VaultFileCache` instance as parameter
- Replace `params.app.vault.getFiles()` with `cache.getAllFiles()`
- Replace `isNameUnique()` filter logic with `cache.isNameUnique(name)`

**Modify:** `src/app/plugin.ts`

- Create cache instance in plugin class
- Invalidate on file create/delete/rename events
- Pass cache to `serializeQuery()`

---

### Phase 3: Optimize String Indentation

**File:** `src/app/utils/serialize-query.fn.ts` lines 202-208

```typescript
// Before (3 operations: split, map, join)
if (params.indentation && serializedQuery) {
    const lines = serializedQuery.split('\n')
    const indentedLines = lines.map((line) => params.indentation + line)
    serializedQuery = indentedLines.join('\n')
}

// After (1 operation)
if (params.indentation && serializedQuery) {
    serializedQuery = params.indentation + serializedQuery.replace(/\n/g, '\n' + params.indentation)
}
```

---

### Phase 4: Cache Query-Specific Regex Patterns

**File:** `src/app/plugin.ts`

Add a module-level regex cache for query-specific patterns:

```typescript
const queryRegexCache = new Map<string, RegExp>()

function getQueryRegex(key: string, patternBuilder: () => string, flags: string): RegExp {
    const cacheKey = `${key}:${flags}`
    let regex = queryRegexCache.get(cacheKey)
    if (!regex) {
        regex = new RegExp(patternBuilder(), flags)
        queryRegexCache.set(cacheKey, regex)
    }
    regex.lastIndex = 0 // Reset for global patterns
    return regex
}
```

Use for the 3 regexes created per query in `processFile()`:

- `alreadySerializedRegex` (line 752)
- `existingSerializedRegex` (line 798)
- `queryToSerializeRegex` (line 862)

---

## Completed

### Parallel Batch Processing (formerly Phase 3)

**Implemented:** `src/app/utils/batch-processor.ts`

- Created `processInBatches<T, R>()` utility function
- Processes items in parallel batches of 5
- Updated `processRecentlyUpdatedFiles()`, `processForceUpdateFiles()`, and `serialize-all-dataview-queries` command

---

## Files to Modify

| File                                      | Changes                               | Status  |
| ----------------------------------------- | ------------------------------------- | ------- |
| `src/app/utils/batch-processor.ts`        | Parallel batch utility                | ✅ DONE |
| `src/app/utils/find-inline-queries.fn.ts` | Pre-compile regex patterns            | Pending |
| `src/app/utils/serialize-query.fn.ts`     | Use vault cache, optimize indentation | Pending |
| `src/app/plugin.ts`                       | Add caches, regex cache               | Pending |
| `src/app/cache/vault-file-cache.ts`       | **NEW** - Vault file caching          | Pending |

## Verification

1. **Run existing tests:** `bun test`
2. **Manual testing:**
    - Create vault with 100+ files containing queries
    - Time `serialize-all-dataview-queries` command before/after
    - Verify idempotency (running twice produces same output)
3. **Check TypeScript:** `bun run tsc:watch`
4. **Lint/format:** `bun run format && bun run lint`

## Expected Improvements

- **Serialize-all command:** 50-70% faster for large vaults (parallel + caching)
- **Single file processing:** 30-50% faster for files with multiple queries (regex cache + vault cache)
- **Memory:** Slight increase (~5-10%) due to caches (bounded by cache invalidation)
