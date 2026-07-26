/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Injector, Input, NgZone, OnDestroy } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tlink-core'
import { GnmiCapabilities, GnmiNotification, GnmiProfile, GnmiStreamMode, GnmiSubscribeMode } from '../api'
import { GnmiService, GnmiSubscribeHandle } from '../services/gnmi.service'
import { FormattedValue, GnmiValueFormatterService } from '../services/valueFormatter.service'

/** Center-pane view mode. Wire is the original per-notification log. */
export type ViewMode = 'wire' | 'latest' | 'graphical'

/**
 * One row rendered in the live-stream table. We keep a monotonic id so
 * Angular's *ngFor trackBy can cheaply diff after a large batch of
 * updates without recomputing keys, and cache a truncated preview so
 * the row doesn't re-JSON-stringify on every change detection pass.
 */
interface StreamRow {
    id: number
    timestampNs: number
    path: string
    value: unknown
    valuePreview: string
    kind: 'update' | 'delete'
    subscriptionId: string
}

/**
 * One deduped path in Latest values / Graphical views. Holds the
 * current value, previous value (for delta), a bounded numeric-only
 * history buffer for the sparkline / chart, and the last-updated
 * timestamp so the row can render "N seconds ago".
 *
 * Non-numeric values still populate lastValue/prevValue but skip the
 * history buffer — a sparkline over strings would be meaningless.
 */
interface LatestEntry {
    path: string
    lastValue: unknown
    prevValue: unknown
    lastTimestampNs: number
    firstTimestampNs: number
    updateCount: number
    /** Cached formatted view. Recomputed on each update; template reads. */
    formatted: FormattedValue
    /** Cached formatted previous value — used to detect a text-level Δ for non-numeric kinds. */
    prevFormatted: FormattedValue
    /** Numeric history for the sparkline, oldest first. Bounded by MAX_HISTORY. */
    history: number[]
}

/** One row rendered in the Latest-values view — path + entry + group. */
interface LatestRow {
    entry: LatestEntry
    /** Short path (last two segments) for the row's leading column. */
    shortPath: string
}

/**
 * A group of Latest rows sharing the same parent path + list-key.
 * All /components/component[name=RE0:CPU0]/cpu/utilization/state/*
 * leaves collapse into one group so 8 CPUs × 7 leaves render as 8
 * distinct sections instead of 56 flat rows.
 */
interface LatestGroup {
    /** Stable id — used for *ngFor trackBy. */
    id: string
    /** Group header prefix, e.g. .../cpu/utilization/state. */
    prefixPath: string
    /** List-key chip, e.g. RE0:CPU0. Null when the group has no key. */
    key: string | null
    rows: LatestRow[]
}

/** A candidate metric for the Graphical view — one leaf shared by ≥2 components. */
interface GraphMetric {
    /** Suffix segment used as the metric label (e.g. "instant"). */
    leaf: string
    /** Full unique leaf pattern — parent-relative, used for matching. */
    signature: string
    /** How many components emit this leaf right now. */
    componentCount: number
}

/** One card in the Graphical view — a component's history for the selected metric. */
interface GraphCard {
    /** List-key value shown as the card title (falls back to full path when there's no key). */
    label: string
    entry: LatestEntry
}

/**
 * User-configured entry in the left pane. Owns the underlying
 * GnmiSubscribeHandle so we can tear it down when the row is removed
 * without going through the service.
 */
interface ActiveSubscription {
    id: string
    path: string
    mode: GnmiSubscribeMode
    streamMode: GnmiStreamMode
    sampleIntervalSec: number
    running: boolean
    receiveCount: number
    handle: GnmiSubscribeHandle | null
    lastError?: string
}

/**
 * Session tab for one gNMI target.
 *
 * State model:
 *   - `subscriptions` — user-configured entries in the left pane.
 *     Each owns its own gnmic subprocess via `handle`. Simpler than
 *     multiplexing paths through a single subprocess (attribution +
 *     lifecycle become trivial), at the cost of one TCP connection
 *     per subscription. Fine for typical 5-20 subscription counts.
 *   - `stream` — ring buffer of the last MAX_STREAM_ROWS notifications
 *     across ALL subscriptions, newest first. Older rows drop off the
 *     end silently; a "receive N since clear" counter tells the user
 *     how much they've dropped in the header.
 *   - `paused` — freezes stream-list updates for the UI but keeps
 *     receiving in the background; `pendingSincePause` shows the
 *     backlog count and drains on resume.
 *
 * The three panes bind straight to arrays on this component — no
 * observables, no store. Angular's default change detection handles
 * ~10 updates/sec fine; if we ever push past that we can switch to
 * OnPush + explicit markForCheck.
 */
@Component({
    selector: 'gnmi-session-tab',
    templateUrl: './gnmiSessionTab.component.pug',
    styleUrls: ['./gnmiSessionTab.component.scss'],
})
export class GnmiSessionTabComponent extends BaseTabComponent implements OnDestroy {
    @Input() profile: GnmiProfile

    /** Maximum notifications kept in the live-stream ring buffer. */
    private static readonly MAX_STREAM_ROWS = 1000
    /** Truncate rendered value strings past this length. Full value stays available in row-detail. */
    private static readonly VALUE_PREVIEW_LEN = 240
    /** Sparkline / chart-card history depth per path. */
    private static readonly MAX_HISTORY = 40

    // ─── Left pane state ────────────────────────────────────────────
    subscriptions: ActiveSubscription[] = []
    newSubPath = ''

    // ─── RPC control pane state ─────────────────────────────────────
    mode: GnmiSubscribeMode = 'STREAM'
    streamMode: GnmiStreamMode = 'SAMPLE'
    sampleIntervalSec = 10
    capabilities: GnmiCapabilities | null = null
    capabilitiesError = ''
    capabilitiesLoading = false

    // ─── Center pane state ──────────────────────────────────────────
    /** Which view is showing in the center pane. */
    viewMode: ViewMode = 'wire'
    stream: StreamRow[] = []
    filter = ''
    paused = false
    pendingSincePause = 0
    selectedRow: StreamRow | null = null
    totalReceived = 0
    /** Rolling messages-per-second, updated on a 1-Hz timer. */
    receiveRate = 0

    /**
     * Dedupe map for Latest / Graphical views — one entry per unique
     * path with its current value + numeric history for the sparkline.
     * Populated in `onNotification` alongside the wire-log push, so
     * the two views stay in sync without a second data flow.
     *
     * Public for the template to read via getters (Angular templates
     * can't access private fields on the component instance).
     */
    latestByPath = new Map<string, LatestEntry>()

    /**
     * When the user hasn't picked a metric for the Graphical view, we
     * auto-select the first numeric leaf that ≥2 subscribed components
     * share. Sticky once set so the auto-selection doesn't jitter as
     * new subscriptions land — user can override with graphicalMetric.
     */
    graphicalMetric: string | null = null

    // Internal counters/timers.
    private rowIdSeq = 0
    private prevTotalForRate = 0
    private rateTimer: ReturnType<typeof setInterval> | null = null
    /**
     * When paused, notifications accumulate here and merge into `stream`
     * on resume — so the user doesn't lose the burst that landed while
     * they were reading a specific row.
     */
    private pausedBuffer: StreamRow[] = []
    /**
     * Latest values / Graphical views are computed getters. They can
     * recompute up to once per notification (~10Hz worst case) which
     * is cheap for our data shapes but starts adding up as the map
     * grows. Cache the last derivation and invalidate on new data.
     */
    private latestGroupsCache: { seq: number; groups: LatestGroup[] } = { seq: -1, groups: [] }
    private graphicalCache: { seq: number; metric: string | null; cards: GraphCard[] } =
        { seq: -1, metric: null, cards: [] }

    private latestDirtySeq = 0

    private gnmi: GnmiService
    private notifications: NotificationsService
    private formatter: GnmiValueFormatterService
    private zone: NgZone

    constructor (injector: Injector) {
        super(injector)
        this.gnmi = injector.get(GnmiService)
        this.notifications = injector.get(NotificationsService)
        this.formatter = injector.get(GnmiValueFormatterService)
        this.zone = injector.get(NgZone)
        // NB: title is set in ngOnInit, deferred a microtask, to sidestep
        // ExpressionChangedAfterItHasBeenCheckedError. Setting it here
        // AND in ngOnInit trips the check because the parent tab-header
        // reads it between the two writes.
    }

    ngOnInit (): void {
        // profile is @Input — declared present but Angular may not
        // have bound it yet when this fires. Guard defensively.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const label = this.profile ? `gNMI · ${this.profile.name}` : 'gNMI'
        // Defer to next microtask so the parent tab-header has already
        // committed its initial read; setting synchronously here throws
        // NG0100 (ExpressionChangedAfterItHasBeenCheckedError).
        void Promise.resolve().then(() => this.setTitle(label))
        // Kick off a Capabilities fetch in the background so the right
        // pane has something to show. Non-blocking — user can already
        // add subscriptions while this races.
        void this.loadCapabilities()

        // 1-Hz timer to compute msg/s. Runs outside Angular's zone so
        // it doesn't trigger a change-detection pass just for the
        // rate number — we manually invalidate via zone.run.
        this.zone.runOutsideAngular(() => {
            this.rateTimer = setInterval(() => {
                const delta = this.totalReceived - this.prevTotalForRate
                this.prevTotalForRate = this.totalReceived
                if (delta !== this.receiveRate) {
                    this.zone.run(() => { this.receiveRate = delta })
                }
            }, 1000)
        })
    }

    ngOnDestroy (): void {
        for (const sub of this.subscriptions) {
            sub.handle?.kill()
        }
        if (this.rateTimer) {
            clearInterval(this.rateTimer)
        }
    }

    // ─── Subscription lifecycle ─────────────────────────────────────

    async addSubscription (): Promise<void> {
        const path = this.newSubPath.trim()
        if (!path) { return }
        this.newSubPath = ''
        const sub: ActiveSubscription = {
            id: `${Date.now()}-${Math.floor((this.rowIdSeq + 1) % 1000)}`,
            path,
            mode: this.mode,
            streamMode: this.streamMode,
            sampleIntervalSec: this.sampleIntervalSec,
            running: false,
            receiveCount: 0,
            handle: null,
        }
        this.subscriptions = [...this.subscriptions, sub]
        this.startSubscription(sub)
    }

    removeSubscription (sub: ActiveSubscription): void {
        sub.handle?.kill()
        this.subscriptions = this.subscriptions.filter(s => s !== sub)
    }

    toggleSubscription (sub: ActiveSubscription): void {
        if (sub.running) {
            sub.handle?.kill()
            sub.handle = null
            sub.running = false
        } else {
            this.startSubscription(sub)
        }
    }

    private startSubscription (sub: ActiveSubscription): void {
        try {
            const handle = this.gnmi.subscribe(this.profile, {
                mode: sub.mode,
                subscriptions: [{
                    path: sub.path,
                    streamMode: sub.streamMode,
                    sampleIntervalNs: sub.sampleIntervalSec * 1_000_000_000,
                }],
            })
            sub.handle = handle
            sub.running = true
            sub.lastError = undefined

            handle.on('notification', (n: GnmiNotification) => {
                this.zone.run(() => this.onNotification(n, sub))
            })
            handle.on('sync', () => {
                // Nothing user-facing yet — could add a "sync received"
                // marker in the stream table in a future iteration.
            })
            handle.on('error', (err: Error & { transient?: boolean }) => {
                this.zone.run(() => {
                    sub.lastError = err.message
                    if (!err.transient) {
                        this.notifications.error(`gNMI subscribe error: ${err.message}`)
                    }
                })
            })
            handle.on('close', (code: number | null) => {
                this.zone.run(() => {
                    sub.running = false
                    sub.handle = null
                    if (code && code !== 0 && !sub.lastError) {
                        sub.lastError = `gnmic exited with code ${code}`
                    }
                })
            })
        } catch (err) {
            sub.lastError = (err as Error).message
            this.notifications.error(`Failed to start subscription: ${sub.lastError}`)
        }
    }

    // ─── Notification handling ──────────────────────────────────────

    private onNotification (n: GnmiNotification, sub: ActiveSubscription): void {
        this.totalReceived += 1
        sub.receiveCount += 1

        const row: StreamRow = {
            id: ++this.rowIdSeq,
            timestampNs: n.timestampNs,
            path: n.path,
            value: n.value,
            valuePreview: this.formatValuePreview(n.value, n.kind),
            kind: n.kind,
            subscriptionId: sub.id,
        }

        // Latest / Graphical are DE-duped views over the same stream.
        // Feed them every notification, even when the wire log is paused,
        // so switching modes shows current state instead of a stale snapshot.
        this.updateLatestEntry(n)

        if (this.paused) {
            this.pausedBuffer.push(row)
            this.pendingSincePause = this.pausedBuffer.length
            return
        }
        this.pushRow(row)
    }

    /**
     * Merge one notification into the deduped Latest map. Existing
     * entries roll their history buffer; new paths seed a fresh entry.
     * Kept private + narrow so onNotification stays readable.
     */
    private updateLatestEntry (n: GnmiNotification): void {
        const existing = this.latestByPath.get(n.path)
        const formatted = this.formatter.format(n.value, n.path)
        if (existing) {
            existing.prevValue = existing.lastValue
            existing.prevFormatted = existing.formatted
            existing.lastValue = n.value
            existing.formatted = formatted
            existing.lastTimestampNs = n.timestampNs
            existing.updateCount += 1
            if (typeof n.value === 'number' && Number.isFinite(n.value)) {
                existing.history.push(n.value)
                if (existing.history.length > GnmiSessionTabComponent.MAX_HISTORY) {
                    existing.history.shift()
                }
            }
        } else {
            const entry: LatestEntry = {
                path: n.path,
                lastValue: n.value,
                prevValue: n.value,
                lastTimestampNs: n.timestampNs,
                firstTimestampNs: n.timestampNs,
                updateCount: 1,
                formatted,
                prevFormatted: formatted,
                history: typeof n.value === 'number' && Number.isFinite(n.value) ? [n.value] : [],
            }
            this.latestByPath.set(n.path, entry)
        }
        this.latestDirtySeq += 1
    }

    private pushRow (row: StreamRow): void {
        // Newest first at index 0; drop from tail past MAX_STREAM_ROWS.
        this.stream = [row, ...this.stream].slice(0, GnmiSessionTabComponent.MAX_STREAM_ROWS)
    }

    private formatValuePreview (value: unknown, kind: 'update' | 'delete'): string {
        if (kind === 'delete') { return '(deleted)' }
        if (value === null || value === undefined) { return 'null' }
        if (typeof value === 'string') {
            return value.length > GnmiSessionTabComponent.VALUE_PREVIEW_LEN
                ? value.slice(0, GnmiSessionTabComponent.VALUE_PREVIEW_LEN) + '…'
                : value
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value)
        }
        let json = ''
        try {
            json = JSON.stringify(value)
        } catch {
            json = '[uninspectable]'
        }
        return json.length > GnmiSessionTabComponent.VALUE_PREVIEW_LEN
            ? json.slice(0, GnmiSessionTabComponent.VALUE_PREVIEW_LEN) + '…'
            : json
    }

    // ─── Center pane controls ───────────────────────────────────────

    togglePause (): void {
        this.paused = !this.paused
        if (!this.paused && this.pausedBuffer.length) {
            // Drain oldest first so relative order in the visible list
            // matches the wire order.
            for (let i = this.pausedBuffer.length - 1; i >= 0; i--) {
                this.pushRow(this.pausedBuffer[i])
            }
            this.pausedBuffer = []
            this.pendingSincePause = 0
        }
    }

    clearStream (): void {
        this.stream = []
        this.selectedRow = null
        this.pausedBuffer = []
        this.pendingSincePause = 0
        // Wipe deduped state too — Clear should reset ALL views, not
        // just the wire log, or the user is left with a "current" view
        // that shows stale-post-clear values.
        this.latestByPath.clear()
        this.graphicalMetric = null
        this.latestDirtySeq += 1
    }

    /** Switch center-pane mode. Kept as a method (not just a bound property) so we can clear per-mode transient state (row selection, filter, etc.) on switch. */
    setViewMode (mode: ViewMode): void {
        if (mode === this.viewMode) { return }
        this.viewMode = mode
        this.selectedRow = null
    }

    /** Serialize the current stream (or full buffer if paused) as JSONL for the clipboard. */
    async exportStream (): Promise<void> {
        const rows = this.paused
            ? [...this.pausedBuffer.reverse(), ...this.stream]
            : this.stream
        const jsonl = rows
            .map(r => JSON.stringify({
                timestamp_ns: r.timestampNs,
                path: r.path,
                kind: r.kind,
                value: r.value,
            }))
            .join('\n')
        try {
            await navigator.clipboard.writeText(jsonl)
            this.notifications.info(`${rows.length} rows copied to clipboard as JSONL`)
        } catch (err) {
            this.notifications.error(`Copy failed: ${(err as Error).message}`)
        }
    }

    /**
     * Client-side filter — substring match against path + preview.
     * Kept simple; a regex mode can layer on top later.
     */
    get filteredStream (): StreamRow[] {
        const f = this.filter.trim().toLowerCase()
        if (!f) { return this.stream }
        return this.stream.filter(r =>
            r.path.toLowerCase().includes(f) || r.valuePreview.toLowerCase().includes(f),
        )
    }

    selectRow (row: StreamRow): void {
        this.selectedRow = this.selectedRow === row ? null : row
    }

    /**
     * JSON.stringify with indentation for the row-detail panel. Handles
     * primitives too so a scalar value doesn't blow up JSON.stringify's
     * "top-level primitives are fine but ugly" behavior.
     */
    get selectedRowJson (): string {
        if (!this.selectedRow) { return '' }
        const v = this.selectedRow.value
        if (v === null || v === undefined) { return 'null' }
        if (typeof v !== 'object') { return JSON.stringify(v) }
        try {
            return JSON.stringify(v, null, 2)
        } catch {
            return '[uninspectable]'
        }
    }

    // ─── Right pane: Capabilities panel ─────────────────────────────

    async loadCapabilities (): Promise<void> {
        this.capabilitiesLoading = true
        this.capabilitiesError = ''
        try {
            this.capabilities = await this.gnmi.capabilities(this.profile)
        } catch (err) {
            this.capabilitiesError = (err as Error).message
        } finally {
            this.capabilitiesLoading = false
        }
    }

    // ─── Formatting helpers used by the template ────────────────────

    formatTimestamp (ns: number): string {
        const ms = Math.floor(ns / 1_000_000)
        const d = new Date(ms)
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        const ss = String(d.getSeconds()).padStart(2, '0')
        const mss = String(d.getMilliseconds()).padStart(3, '0')
        return `${hh}:${mm}:${ss}.${mss}`
    }

    trackRowById = (_: number, r: StreamRow): number => r.id
    trackSubById = (_: number, s: ActiveSubscription): string => s.id
    trackLatestGroup = (_: number, g: LatestGroup): string => g.id
    trackLatestRow = (_: number, r: LatestRow): string => r.entry.path
    trackGraphCard = (_: number, c: GraphCard): string => c.entry.path

    // ─── Latest values view (derived) ───────────────────────────────

    /**
     * Group the deduped Latest entries by their parent path + list-key.
     * Sorting: groups by list-key alphabetically (so RE0:CPU0 comes
     * before CPU1), rows within a group by leaf name (so `avg`, `instant`,
     * `max`, `min` land in a consistent order across groups). Result
     * is cached against `latestDirtySeq` so we don't re-sort on every
     * change-detection tick.
     */
    get latestGroups (): LatestGroup[] {
        if (this.latestGroupsCache.seq === this.latestDirtySeq) {
            return this.filterLatestGroups(this.latestGroupsCache.groups)
        }
        const buckets = new Map<string, { key: string | null; prefix: string; rows: LatestRow[] }>()
        for (const entry of this.latestByPath.values()) {
            const prefix = this.formatter.parentPath(entry.path)
            const key = this.formatter.lastListKey(entry.path)
            const bucketId = `${prefix} ${key ?? ''}`
            let bucket = buckets.get(bucketId)
            if (!bucket) {
                bucket = { key, prefix, rows: [] }
                buckets.set(bucketId, bucket)
            }
            bucket.rows.push({
                entry,
                shortPath: this.formatter.shortPath(entry.path, 1),
            })
        }
        const groups: LatestGroup[] = [...buckets.entries()].map(([id, b]) => ({
            id,
            prefixPath: b.prefix,
            key: b.key,
            rows: b.rows.sort((a, b2) =>
                this.formatter.leafName(a.entry.path).localeCompare(this.formatter.leafName(b2.entry.path))),
        }))
        groups.sort((a, b) => (a.key ?? '').localeCompare(b.key ?? '') || a.prefixPath.localeCompare(b.prefixPath))
        this.latestGroupsCache = { seq: this.latestDirtySeq, groups }
        return this.filterLatestGroups(groups)
    }

    /**
     * Apply the toolbar filter to the group list — same substring
     * match as the wire log. A group is included when any row matches;
     * matching rows within an otherwise-hidden group still get shown.
     */
    private filterLatestGroups (groups: LatestGroup[]): LatestGroup[] {
        const f = this.filter.trim().toLowerCase()
        if (!f) { return groups }
        const out: LatestGroup[] = []
        for (const g of groups) {
            const rows = g.rows.filter(r =>
                r.entry.path.toLowerCase().includes(f) ||
                r.entry.formatted.value.toLowerCase().includes(f),
            )
            if (rows.length) { out.push({ ...g, rows }) }
        }
        return out
    }

    /**
     * Build the SVG `d` attribute for a sparkline over the entry's
     * history. Returns two paths: the stroked line + the filled area
     * underneath (already CSS-styled). Coordinates map history[i] to
     * an x=0..100, y=0..22 box; y inverts so high values sit at top.
     * Returns null when there's <2 points — a one-sample line would
     * be misleading.
     */
    sparklinePaths (entry: LatestEntry): { line: string; fill: string; endX: number; endY: number } | null {
        const h = entry.history
        if (h.length < 2) { return null }
        const min = Math.min(...h)
        const max = Math.max(...h)
        const range = max - min || 1
        const dx = 100 / (h.length - 1)
        const pts = h.map((v, i) => {
            const x = i * dx
            // Leave 2px padding top+bottom (spark box is 22px tall).
            const y = 20 - ((v - min) / range) * 16
            return [x, y] as const
        })
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
        const fill = `M0 22 L${line.slice(1)} L100,22 Z`
        const [endX, endY] = pts[pts.length - 1]
        return { line, fill, endX, endY }
    }

    /**
     * Best-effort delta indicator string. Returns 'up' / 'down' / 'same'
     * plus the signed magnitude for numeric values; for non-numerics
     * it just reports 'changed' when the formatted string flipped.
     */
    deltaOf (entry: LatestEntry): { kind: 'up' | 'down' | 'same' | 'changed'; label: string } {
        const a = entry.lastValue
        const b = entry.prevValue
        if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
            const d = a - b
            if (d > 0) { return { kind: 'up', label: `▲ +${this.compactNumber(d)}` } }
            if (d < 0) { return { kind: 'down', label: `▼ ${this.compactNumber(d)}` } }
            return { kind: 'same', label: '·' }
        }
        if (entry.formatted.value !== entry.prevFormatted.value) {
            return { kind: 'changed', label: '≠' }
        }
        return { kind: 'same', label: '·' }
    }

    private compactNumber (n: number): string {
        if (Number.isInteger(n)) { return String(n) }
        return String(Number(n.toFixed(2)))
    }

    /**
     * Age of an entry as a compact string ("2s", "1m"). Recomputes on
     * every change-detection pass so the age ticks up while the tab
     * is open. Cheap — one Date.now() call per row.
     */
    ageLabel (entry: LatestEntry): string {
        const ms = Date.now() - Math.floor(entry.lastTimestampNs / 1_000_000)
        const s = Math.max(0, Math.round(ms / 1000))
        if (s < 60) { return `${s}s` }
        const m = Math.round(s / 60)
        if (m < 60) { return `${m}m` }
        return `${Math.round(m / 60)}h`
    }

    /** True when the row updated in the last ~5s. Drives the pulse dot. */
    isFresh (entry: LatestEntry): boolean {
        return Date.now() - Math.floor(entry.lastTimestampNs / 1_000_000) < 5000
    }

    // ─── Graphical view (derived) ───────────────────────────────────

    /**
     * List of leaves shared by ≥2 components — the picker options for
     * the Graphical metric. Sorted by component count so the "most
     * fanned-out" metric is first (usually the one the user wants).
     */
    get graphicalMetricCandidates (): GraphMetric[] {
        const counts = new Map<string, number>()
        for (const entry of this.latestByPath.values()) {
            const leaf = this.formatter.leafName(entry.path)
            counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
        }
        const out: GraphMetric[] = []
        for (const [leaf, componentCount] of counts) {
            if (componentCount >= 2) {
                out.push({ leaf, signature: leaf, componentCount })
            }
        }
        out.sort((a, b) => b.componentCount - a.componentCount || a.leaf.localeCompare(b.leaf))
        return out
    }

    /**
     * Auto-select the first numeric leaf when the user hasn't picked.
     * Numeric preference: entries with a populated history buffer beat
     * ones without. Runs on-demand from the template.
     */
    get selectedGraphicalMetric (): string | null {
        if (this.graphicalMetric) { return this.graphicalMetric }
        const candidates = this.graphicalMetricCandidates
        for (const cand of candidates) {
            const anyNumeric = [...this.latestByPath.values()].some(e =>
                this.formatter.leafName(e.path) === cand.leaf && e.history.length > 0,
            )
            if (anyNumeric) { return cand.leaf }
        }
        return candidates[0]?.leaf ?? null
    }

    /** Cards for the currently-selected metric — one per component that emits it. */
    get graphicalCards (): GraphCard[] {
        const metric = this.selectedGraphicalMetric
        if (!metric) { return [] }
        if (this.graphicalCache.seq === this.latestDirtySeq && this.graphicalCache.metric === metric) {
            return this.graphicalCache.cards
        }
        const cards: GraphCard[] = []
        for (const entry of this.latestByPath.values()) {
            if (this.formatter.leafName(entry.path) !== metric) { continue }
            if (!entry.history.length) { continue }
            const key = this.formatter.lastListKey(entry.path)
            cards.push({
                label: key ?? this.formatter.shortPath(entry.path, 2),
                entry,
            })
        }
        cards.sort((a, b) => a.label.localeCompare(b.label))
        this.graphicalCache = { seq: this.latestDirtySeq, metric, cards }
        return cards
    }

    /**
     * SVG path for a card's chart. Same coordinate space as the
     * sparkline but taller (0..50 y) and includes area fill.
     */
    chartPaths (entry: LatestEntry): { line: string; area: string; endX: number; endY: number; min: number; max: number } | null {
        const h = entry.history
        if (h.length < 2) { return null }
        const min = Math.min(...h)
        const max = Math.max(...h)
        const range = max - min || 1
        const dx = 100 / (h.length - 1)
        const pts = h.map((v, i) => {
            const x = i * dx
            const y = 46 - ((v - min) / range) * 40
            return [x, y] as const
        })
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
        const area = `M0 50 L${line.slice(1)} L100,50 Z`
        const [endX, endY] = pts[pts.length - 1]
        return { line, area, endX, endY, min, max }
    }
}
