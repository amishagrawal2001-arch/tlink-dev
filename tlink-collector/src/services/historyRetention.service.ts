import { Injectable } from '@angular/core'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CollectorProfile, CollectorSample } from '../api'

/**
 * On-disk retention for collector samples.
 *
 * Storage layout:
 *   <userData>/collector-history/<profileId>/YYYY-MM-DD.jsonl
 *
 * Each line is `{"p":<path>,"t":<timestampNs>,"v":<value>}` — short
 * keys because these files can get big on a 15s Prometheus scrape of
 * a hundreds-of-series endpoint, and JSON keys are the biggest wire
 * overhead on a per-sample basis.
 *
 * Retention is per-profile via `savedHistoryDays` on
 * `CollectorProfileOptions`:
 *   - undefined / 0  → disabled, no reads or writes to disk
 *   - N > 0          → keep the last N days of files, prune older
 *
 * Writes are buffered so a dense scrape (10 Hz mock, or a Prometheus
 * endpoint serving thousands of series) doesn't hammer the fs —
 * flushes every 2 s or 500 samples, whichever comes first. Flushes
 * append to today's file; midnight rollover is handled by the write
 * key including the date.
 *
 * Loading is one-shot on tab open — reads the last N days worth of
 * files for a profile into a callback that hydrates latestByPath.
 * Kept synchronous per-file (streaming JSONL is overkill for tens of
 * MB) but chunked across files so a 30-day load doesn't block for
 * seconds.
 *
 * Mirrors GnmiHistoryRetentionService — kept as a sibling rather than
 * generalized across plugins because the schema may drift (collector
 * samples may grow source-specific metadata that gNMI notifications
 * never need).
 */
@Injectable({ providedIn: 'root' })
export class CollectorHistoryRetentionService {
    private buffers = new Map<string, string[]>()
    private flushTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private static readonly FLUSH_AT_LINES = 500
    private static readonly FLUSH_INTERVAL_MS = 2000

    private rootDir (): string {
        try {
            const nodeReq = (window as unknown as { require?: (m: string) => unknown }).require
            const electron = nodeReq ? nodeReq('@electron/remote') : null
            const appDataPath = (electron as { app?: { getPath: (n: string) => string } } | null)?.app?.getPath('userData')
            if (appDataPath) { return path.join(appDataPath, 'collector-history') }
        } catch {
            // @electron/remote may not be available in some contexts;
            // fall through to homedir fallback.
        }
        return path.join(os.homedir(), '.tlink', 'collector-history')
    }

    private profileDir (profile: CollectorProfile): string {
        const dir = path.join(this.rootDir(), this.sanitizeId(profile.id))
        try { fs.mkdirSync(dir, { recursive: true }) } catch { /* already exists */ }
        return dir
    }

    private sanitizeId (id: string): string {
        return id.replace(/[^a-zA-Z0-9._-]/g, '_')
    }

    private dateKey (ms: number): string {
        return new Date(ms).toISOString().slice(0, 10)
    }

    /**
     * Enqueue one sample for on-disk retention. No-op when the profile
     * hasn't opted in via `savedHistoryDays`. Cheap — appends to an
     * in-memory buffer and schedules a flush.
     */
    record (profile: CollectorProfile, s: CollectorSample): void {
        const days = profile.options.savedHistoryDays ?? 0
        if (days <= 0) { return }
        if (s.kind !== 'update') { return }
        const t = typeof s.value
        if (t !== 'number' && t !== 'string' && t !== 'boolean') { return }

        const key = this.sanitizeId(profile.id)
        const buf = this.buffers.get(key) ?? []
        buf.push(JSON.stringify({ p: s.path, t: s.timestampNs, v: s.value }))
        this.buffers.set(key, buf)

        if (buf.length >= CollectorHistoryRetentionService.FLUSH_AT_LINES) {
            this.flush(profile)
            return
        }
        if (!this.flushTimers.has(key)) {
            const timer = setTimeout(() => {
                this.flushTimers.delete(key)
                this.flush(profile)
            }, CollectorHistoryRetentionService.FLUSH_INTERVAL_MS)
            this.flushTimers.set(key, timer)
        }
    }

    /**
     * Force-flush a profile's buffer to disk. Safe to call on tab-close
     * via ngOnDestroy so the last few samples survive. Groups the
     * buffered lines by date so a batch that crosses midnight lands in
     * the correct daily files.
     */
    flush (profile: CollectorProfile): void {
        const key = this.sanitizeId(profile.id)
        const buf = this.buffers.get(key)
        if (!buf?.length) { return }
        const dir = this.profileDir(profile)
        const byDate = new Map<string, string[]>()
        for (const line of buf) {
            const m = /"t":(\d+)/.exec(line)
            const ts = m ? Number(m[1]) : Date.now() * 1_000_000
            const dateKey = this.dateKey(Math.floor(ts / 1_000_000))
            const list = byDate.get(dateKey) ?? []
            list.push(line)
            byDate.set(dateKey, list)
        }
        for (const [dateKey, lines] of byDate) {
            const filePath = path.join(dir, `${dateKey}.jsonl`)
            try {
                fs.appendFileSync(filePath, lines.join('\n') + '\n')
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(`[collector-history] failed to write ${filePath}: ${(err as Error).message}`)
            }
        }
        this.buffers.delete(key)
        const timer = this.flushTimers.get(key)
        if (timer) {
            clearTimeout(timer)
            this.flushTimers.delete(key)
        }
    }

    /**
     * Load the last `savedHistoryDays` days of retained samples for a
     * profile, invoking `onSample` for each. Caller uses this in
     * ngOnInit to hydrate latestByPath before new samples arrive.
     * Order matches wire order (oldest first per file, files iterated
     * oldest to newest).
     */
    load (profile: CollectorProfile, onSample: (path: string, timestampNs: number, value: unknown) => void): void {
        const days = profile.options.savedHistoryDays ?? 0
        if (days <= 0) { return }
        const dir = this.profileDir(profile)
        let entries: string[] = []
        try {
            entries = fs.readdirSync(dir)
        } catch {
            return
        }
        const cutoff = new Date()
        cutoff.setUTCDate(cutoff.getUTCDate() - days)
        const cutoffKey = cutoff.toISOString().slice(0, 10)

        const files = entries
            .filter(n => n.endsWith('.jsonl'))
            .filter(n => n.slice(0, 10) >= cutoffKey)
            .sort()

        for (const f of files) {
            const filePath = path.join(dir, f)
            let content = ''
            try {
                content = fs.readFileSync(filePath, 'utf8')
            } catch {
                continue
            }
            for (const line of content.split('\n')) {
                if (!line) { continue }
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const row: any = JSON.parse(line)
                    if (row && typeof row.p === 'string' && typeof row.t === 'number') {
                        onSample(row.p, row.t, row.v)
                    }
                } catch { /* skip malformed */ }
            }
        }
    }

    /**
     * Total on-disk size + file count for one profile's history.
     * Cheap enough to call from the Settings UI on demand — just a
     * readdir + stat per file, no I/O beyond that.
     */
    sizeOf (profile: CollectorProfile): { totalBytes: number; fileCount: number; oldestDate: string | null } {
        const dir = path.join(this.rootDir(), this.sanitizeId(profile.id))
        let entries: string[] = []
        try {
            entries = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'))
        } catch {
            return { totalBytes: 0, fileCount: 0, oldestDate: null }
        }
        let totalBytes = 0
        for (const f of entries) {
            try {
                const stat = fs.statSync(path.join(dir, f))
                totalBytes += stat.size
            } catch { /* skip inaccessible */ }
        }
        const sorted = entries.sort()
        const oldestDate = sorted.length ? sorted[0].slice(0, 10) : null
        return { totalBytes, fileCount: entries.length, oldestDate }
    }

    /**
     * Delete every retained file for a profile. Also flushes any
     * in-memory buffer for this profile so nothing gets written back
     * seconds later. Idempotent — safe to call when nothing's there.
     *
     * Returns the count of files removed so the UI can report it.
     */
    clearAll (profile: CollectorProfile): number {
        const key = this.sanitizeId(profile.id)
        const timer = this.flushTimers.get(key)
        if (timer) {
            clearTimeout(timer)
            this.flushTimers.delete(key)
        }
        this.buffers.delete(key)

        const dir = path.join(this.rootDir(), this.sanitizeId(profile.id))
        let entries: string[] = []
        try {
            entries = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'))
        } catch {
            return 0
        }
        let removed = 0
        for (const f of entries) {
            try {
                fs.unlinkSync(path.join(dir, f))
                removed += 1
            } catch { /* skip */ }
        }
        return removed
    }

    /**
     * Delete files older than `savedHistoryDays` days for a profile.
     * Runs on tab open right after load(); keeps disk usage bounded
     * even for profiles the user leaves running for weeks.
     */
    prune (profile: CollectorProfile): void {
        const days = profile.options.savedHistoryDays ?? 0
        if (days <= 0) { return }
        const dir = this.profileDir(profile)
        let entries: string[] = []
        try {
            entries = fs.readdirSync(dir)
        } catch {
            return
        }
        const cutoff = new Date()
        cutoff.setUTCDate(cutoff.getUTCDate() - days)
        const cutoffKey = cutoff.toISOString().slice(0, 10)
        for (const f of entries) {
            if (!f.endsWith('.jsonl')) { continue }
            if (f.slice(0, 10) < cutoffKey) {
                try { fs.unlinkSync(path.join(dir, f)) } catch { /* ignore */ }
            }
        }
    }
}
