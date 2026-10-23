/**
 * Notices for queries skipped because their FROM clause references a missing
 * note or folder.
 *
 * A broken query is re-skipped on every automatic run (every edit of its note,
 * forced folders, the periodic timer), so automatic runs only report a given
 * skip once per cooldown. Manual runs always report: the user just asked.
 * Each run produces at most one notice, however many queries it skipped.
 */

/** A query left untouched because some of its sources do not resolve */
export interface SkippedQuery {
    filePath: string
    query: string
    /** Unresolved sources, as written in the query (e.g. `[[Old name]]`) */
    unresolved: string[]
}

/** Skips listed individually in a notice before summarizing the rest */
const MAX_LISTED_SKIPS = 3

const skipKey = (skip: SkippedQuery): string =>
    `${skip.filePath}\u0000${skip.query}\u0000${skip.unresolved.join('\u0000')}`

export class UnresolvedReferenceNoticeThrottle {
    private lastNotified = new Map<string, number>()

    constructor(
        private readonly cooldownMs: number,
        private readonly now: () => number = () => Date.now()
    ) {}

    /**
     * The skips worth reporting for this run, recorded as reported.
     *
     * @param skipped every skip of the run
     * @param isManualTrigger manual runs report everything
     */
    select(skipped: SkippedQuery[], isManualTrigger: boolean): SkippedQuery[] {
        const now = this.now()
        const selected: SkippedQuery[] = []

        for (const skip of skipped) {
            const key = skipKey(skip)
            const last = this.lastNotified.get(key)
            if (isManualTrigger || last === undefined || now - last >= this.cooldownMs) {
                selected.push(skip)
                this.lastNotified.set(key, now)
            }
        }

        return selected
    }
}

const fileNameOf = (filePath: string): string => filePath.split('/').pop() || filePath

/** One notice summarizing every skip of a run */
export function buildUnresolvedReferencesNotice(skipped: SkippedQuery[]): string {
    if (skipped.length === 1) {
        const skip = skipped[0]!
        return `Dataview Serializer: a query in "${fileNameOf(skip.filePath)}" references missing ${skip.unresolved.join(', ')}. Its previous result was kept. Was a note or folder renamed?`
    }

    const lines = skipped
        .slice(0, MAX_LISTED_SKIPS)
        .map((skip) => `- ${fileNameOf(skip.filePath)}: ${skip.unresolved.join(', ')}`)
    if (skipped.length > MAX_LISTED_SKIPS) {
        lines.push(`- …and ${skipped.length - MAX_LISTED_SKIPS} more`)
    }

    return `Dataview Serializer: ${skipped.length} queries skipped: unresolved references. Their previous results were kept.\n${lines.join('\n')}`
}
