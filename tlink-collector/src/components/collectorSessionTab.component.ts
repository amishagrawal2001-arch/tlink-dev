/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/max-params */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, NgZone, OnDestroy } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tlink-core'
import { CollectorProfile, CollectorSample } from '../api'
import { CollectorHandle, CollectorMockService } from '../services/mock.service'
import { CollectorValueFormatterService, FormattedValue } from '../services/valueFormatter.service'

/** Center-pane view mode. Wire is the original per-notification log. */
export type ViewMode = 'wire' | 'latest' | 'graphical'

/** One row in the live stream table. Newest-first ring buffer. */
interface StreamRow {
    id: number
    timestampNs: number
    path: string
    value: unknown
    valuePreview: string
    kind: 'update' | 'delete'
}

/** Deduped entry for the Latest / Graphical views — one per path. */
interface LatestEntry {
    path: string
    lastValue: unknown
    prevValue: unknown
    lastTimestampNs: number
    firstTimestampNs: number
    updateCount: number
    formatted: FormattedValue
    prevFormatted: FormattedValue
    history: number[]
    historyTs: number[]
}

interface LatestRow {
    entry: LatestEntry
    shortPath: string
}

interface LatestGroup {
    id: string
    prefixPath: string
    key: string | null
    rows: LatestRow[]
}

interface GraphMetric {
    leaf: string
    signature: string
    componentCount: number
}

interface GraphCard {
    label: string
    entry: LatestEntry
}

interface AxisTick {
    pos: number
    label: string
}

interface ExpandedChart {
    line: string
    area: string
    min: number
    max: number
    sampleCount: number
    windowSpanLabel: string
    useRate: boolean
    yTicks: AxisTick[]
    xTicks: AxisTick[]
    chartX0: number; chartX1: number
    chartY0: number; chartY1: number
    hover: ExpandedChartHover | null
}

interface ExpandedChartHover {
    x: number
    y: number
    value: string
    unit: string
    ago: string
}

/**
 * Session tab for one collector target. Three view modes mirror the
 * gNMI plugin so a user who's already navigated one plugin's telemetry
 * doesn't relearn:
 *   - Wire: per-sample log (raw stream)
 *   - Latest: one row per unique path with sparkline + delta + age
 *   - Graphical: chart card per host sharing the selected metric
 *
 * OnPush + throttled CD (10 Hz) — bursty mock at hostCount=50 emits
 * ~200 samples/sec; per-sample CD would drop frames.
 */
@Component({
    selector: 'collector-session-tab',
    templateUrl: './collectorSessionTab.component.pug',
    styleUrls: ['./collectorSessionTab.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorSessionTabComponent extends BaseTabComponent implements OnDestroy {
    @Input() profile: CollectorProfile

    private static readonly MAX_STREAM_ROWS = 1000
    private static readonly VALUE_PREVIEW_LEN = 240
    private static readonly CD_THROTTLE_MS = 100
    /** Per-path history depth for sparklines + charts. ~500 samples ≈ 1h at 8s. */
    private static readonly MAX_HISTORY = 500

    // ─── Public state (template bindings) ───────────────────────────
    running = false
    stream: StreamRow[] = []
    filter = ''
    paused = false
    pendingSincePause = 0
    totalReceived = 0
    receiveRate = 0
    lastError = ''
    now = Date.now()

    // ─── View mode + Latest / Graphical state ───────────────────────
    viewMode: ViewMode = 'wire'
    latestByPath = new Map<string, LatestEntry>()
    /**
     * Bumped on every sample so the derived-cache getters know when to
     * recompute. Public for the template's (ngModelChange) hooks on the
     * summary-strip selects — they nudge this to force a re-derive.
     */
    latestDirtySeq = 0
    graphicalMetric: string | null = null

    /** How many seconds of history the Graphical chart cards visualize. 0 = all retained. */
    chartWindowSec = 0
    chartWindowChoices: { label: string; sec: number }[] = [
        { label: '1m', sec: 60 },
        { label: '5m', sec: 300 },
        { label: '15m', sec: 900 },
        { label: '30m', sec: 1800 },
        { label: '1h', sec: 3600 },
        { label: 'All', sec: 0 },
    ]

    chartDisplay: 'auto' | 'value' | 'rate' = 'auto'
    chartDisplayChoices: { label: string; value: 'auto' | 'value' | 'rate' }[] = [
        { label: 'Auto', value: 'auto' },
        { label: 'Value', value: 'value' },
        { label: 'Rate', value: 'rate' },
    ]

    chartCardSize: 'compact' | 'normal' | 'large' = 'normal'
    chartCardSizeChoices: { label: string; value: 'compact' | 'normal' | 'large'; minPx: number }[] = [
        { label: 'Compact', value: 'compact', minPx: 170 },
        { label: 'Normal', value: 'normal', minPx: 210 },
        { label: 'Large', value: 'large', minPx: 340 },
    ]

    get chartCardMinPx (): number {
        return this.chartCardSizeChoices.find(c => c.value === this.chartCardSize)?.minPx ?? 210
    }

    expandedEntryPath: string | null = null
    hoverIndex: number | null = null

    // ─── Private plumbing ───────────────────────────────────────────
    private handle: CollectorHandle | null = null
    private rowIdSeq = 0
    private pausedBuffer: StreamRow[] = []
    private prevTotalForRate = 0
    private rateTimer: ReturnType<typeof setInterval> | null = null
    private pendingCheckTimer: ReturnType<typeof setTimeout> | null = null

    private latestGroupsCache: { seq: number; groups: LatestGroup[] } = { seq: -1, groups: [] }
    private graphicalCache: { seq: number; metric: string | null; cards: GraphCard[] } =
        { seq: -1, metric: null, cards: [] }

    private candidatesCache: { seq: number; list: GraphMetric[] } = { seq: -1, list: [] }

    private mock: CollectorMockService
    private notifications: NotificationsService
    private formatter: CollectorValueFormatterService
    private zone: NgZone
    private cdr: ChangeDetectorRef

    constructor (injector: Injector) {
        super(injector)
        this.mock = injector.get(CollectorMockService)
        this.notifications = injector.get(NotificationsService)
        this.formatter = injector.get(CollectorValueFormatterService)
        this.zone = injector.get(NgZone)
        this.cdr = injector.get(ChangeDetectorRef)
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    ngOnInit (): void {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const label = this.profile ? `Collector · ${this.profile.name}` : 'Collector'
        void Promise.resolve().then(() => this.setTitle(label))

        this.zone.runOutsideAngular(() => {
            this.rateTimer = setInterval(() => {
                const nextNow = Date.now()
                const delta = this.totalReceived - this.prevTotalForRate
                this.prevTotalForRate = this.totalReceived
                this.now = nextNow
                if (delta !== this.receiveRate) { this.receiveRate = delta }
                this.scheduleCheck()
            }, 1000)
        })

        this.start()
    }

    ngOnDestroy (): void {
        this.stop()
        if (this.rateTimer) { clearInterval(this.rateTimer) }
        if (this.pendingCheckTimer) { clearTimeout(this.pendingCheckTimer) }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────

    start (): void {
        this.stop()
        this.lastError = ''
        try {
            switch (this.profile.options.source) {
                case 'mock':
                    this.handle = this.mock.start(this.profile)
                    break
                case 'prometheus':
                    throw new Error('Prometheus source arrives in M3.2. Pick mock for now.')
                default:
                    throw new Error(`Unknown source: ${this.profile.options.source}`)
            }
            this.wireHandle(this.handle)
            this.running = true
        } catch (err) {
            this.lastError = (err as Error).message
            this.notifications.error(`Collector: ${this.lastError}`)
        }
        this.scheduleCheck()
    }

    stop (): void {
        this.handle?.stop()
        this.handle = null
        this.running = false
        this.scheduleCheck()
    }

    toggleRunning (): void {
        if (this.running) { this.stop() } else { this.start() }
    }

    private wireHandle (h: CollectorHandle): void {
        h.on('sample', (s: CollectorSample) => {
            this.onSample(s)
            this.scheduleCheck()
        })
        h.on('error', (err: Error) => {
            this.lastError = err.message
            this.notifications.error(`Collector error: ${err.message}`)
            this.scheduleCheck()
        })
    }

    // ─── Sample handling ────────────────────────────────────────────

    private onSample (s: CollectorSample): void {
        this.totalReceived += 1
        this.updateLatestEntry(s)
        const row: StreamRow = {
            id: ++this.rowIdSeq,
            timestampNs: s.timestampNs,
            path: s.path,
            value: s.value,
            valuePreview: this.formatValuePreview(s.value, s.kind),
            kind: s.kind,
        }
        if (this.paused) {
            this.pausedBuffer.push(row)
            this.pendingSincePause = this.pausedBuffer.length
            return
        }
        this.pushRow(row)
    }

    /**
     * Merge one sample into the deduped Latest map. Same shape as
     * GnmiSessionTabComponent.updateLatestEntry — just takes a
     * CollectorSample instead of a GnmiNotification. Kept in sync so
     * the two plugins evolve together.
     */
    private updateLatestEntry (s: CollectorSample): void {
        const existing = this.latestByPath.get(s.path)
        const formatted = this.formatter.format(s.value, s.path)
        const nowMs = Math.floor(s.timestampNs / 1_000_000)
        if (existing) {
            existing.prevValue = existing.lastValue
            existing.prevFormatted = existing.formatted
            existing.lastValue = s.value
            existing.formatted = formatted
            existing.lastTimestampNs = s.timestampNs
            existing.updateCount += 1
            if (typeof s.value === 'number' && Number.isFinite(s.value)) {
                existing.history.push(s.value)
                existing.historyTs.push(nowMs)
                if (existing.history.length > CollectorSessionTabComponent.MAX_HISTORY) {
                    existing.history.shift()
                    existing.historyTs.shift()
                }
            }
        } else {
            const numeric = typeof s.value === 'number' && Number.isFinite(s.value)
            const entry: LatestEntry = {
                path: s.path,
                lastValue: s.value,
                prevValue: s.value,
                lastTimestampNs: s.timestampNs,
                firstTimestampNs: s.timestampNs,
                updateCount: 1,
                formatted,
                prevFormatted: formatted,
                history: numeric ? [s.value as number] : [],
                historyTs: numeric ? [nowMs] : [],
            }
            this.latestByPath.set(s.path, entry)
        }
        this.latestDirtySeq += 1
    }

    private pushRow (row: StreamRow): void {
        this.stream = [row, ...this.stream].slice(0, CollectorSessionTabComponent.MAX_STREAM_ROWS)
    }

    private formatValuePreview (value: unknown, kind: 'update' | 'delete'): string {
        if (kind === 'delete') { return '(deleted)' }
        if (value === null || value === undefined) { return 'null' }
        if (typeof value === 'string') {
            return value.length > CollectorSessionTabComponent.VALUE_PREVIEW_LEN
                ? value.slice(0, CollectorSessionTabComponent.VALUE_PREVIEW_LEN) + '…'
                : value
        }
        if (typeof value === 'number' || typeof value === 'boolean') { return String(value) }
        let json = ''
        try { json = JSON.stringify(value) } catch { json = '[uninspectable]' }
        return json.length > CollectorSessionTabComponent.VALUE_PREVIEW_LEN
            ? json.slice(0, CollectorSessionTabComponent.VALUE_PREVIEW_LEN) + '…'
            : json
    }

    // ─── Toolbar controls ───────────────────────────────────────────

    togglePause (): void {
        this.paused = !this.paused
        if (!this.paused && this.pausedBuffer.length) {
            for (let i = this.pausedBuffer.length - 1; i >= 0; i--) {
                this.pushRow(this.pausedBuffer[i])
            }
            this.pausedBuffer = []
            this.pendingSincePause = 0
        }
        this.scheduleCheck()
    }

    clearStream (): void {
        this.stream = []
        this.pausedBuffer = []
        this.pendingSincePause = 0
        // Wipe deduped state too — Clear resets ALL views, or the user
        // is left with a "current" view that shows stale-post-clear values.
        this.latestByPath.clear()
        this.graphicalMetric = null
        this.expandedEntryPath = null
        this.latestDirtySeq += 1
        this.scheduleCheck()
    }

    setViewMode (mode: ViewMode): void {
        if (mode === this.viewMode) { return }
        this.viewMode = mode
        this.expandedEntryPath = null
        this.scheduleCheck()
    }

    async exportJsonl (): Promise<void> {
        const rows = this.paused ? [...this.pausedBuffer.reverse(), ...this.stream] : this.stream
        const jsonl = rows
            .map(r => JSON.stringify({ timestamp_ns: r.timestampNs, path: r.path, kind: r.kind, value: r.value }))
            .join('\n')
        try {
            await navigator.clipboard.writeText(jsonl)
            this.notifications.info(`${rows.length} rows copied as JSONL`)
        } catch (err) {
            this.notifications.error(`Copy failed: ${(err as Error).message}`)
        }
    }

    // ─── Template-facing helpers ────────────────────────────────────

    get filteredStream (): StreamRow[] {
        const f = this.filter.trim().toLowerCase()
        if (!f) { return this.stream }
        return this.stream.filter(r =>
            r.path.toLowerCase().includes(f) || r.valuePreview.toLowerCase().includes(f),
        )
    }

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
    trackLatestGroup = (_: number, g: LatestGroup): string => g.id
    trackLatestRow = (_: number, r: LatestRow): string => r.entry.path
    trackCandidateByLeaf = (_: number, m: GraphMetric): string => m.leaf
    trackWindowChoiceBySec = (_: number, c: { sec: number }): number => c.sec
    trackDisplayChoiceByValue = (_: number, c: { value: string }): string => c.value
    trackCardSizeByValue = (_: number, c: { value: string }): string => c.value
    trackGraphCard = (_: number, c: GraphCard): string => c.entry.path

    // ─── Latest values view (derived) ───────────────────────────────

    get latestGroups (): LatestGroup[] {
        if (this.latestGroupsCache.seq === this.latestDirtySeq) {
            return this.filterLatestGroups(this.latestGroupsCache.groups)
        }
        const buckets = new Map<string, { key: string | null; prefix: string; rows: LatestRow[] }>()
        for (const entry of this.latestByPath.values()) {
            const prefix = this.formatter.parentPath(entry.path)
            const key = this.formatter.lastListKey(entry.path)
            const bucketId = `${prefix} ${key ?? ''}`
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

    sparklinePaths (entry: LatestEntry): { line: string; fill: string; endX: number; endY: number } | null {
        const h = entry.history
        if (h.length < 2) { return null }
        const min = Math.min(...h)
        const max = Math.max(...h)
        const range = max - min || 1
        const dx = 100 / (h.length - 1)
        const pts = h.map((v, i) => {
            const x = i * dx
            const y = 20 - ((v - min) / range) * 16
            return [x, y] as const
        })
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
        const fill = `M0 22 L${line.slice(1)} L100,22 Z`
        const [endX, endY] = pts[pts.length - 1]
        return { line, fill, endX, endY }
    }

    deltaOf (entry: LatestEntry): { kind: 'up' | 'down' | 'same' | 'changed'; label: string } {
        if (this.shouldPlotRate(entry.path)) {
            return this.deltaOfRate(entry)
        }
        const a = entry.lastValue
        const b = entry.prevValue
        if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
            const d = a - b
            if (d > 0) {
                const f = this.formatter.format(d, entry.path)
                const unit = f.unit ? ` ${f.unit}` : ''
                return { kind: 'up', label: `▲ +${f.value}${unit}` }
            }
            if (d < 0) {
                const f = this.formatter.format(d, entry.path)
                const unit = f.unit ? ` ${f.unit}` : ''
                const signed = f.value.startsWith('-') ? f.value : `-${f.value}`
                return { kind: 'down', label: `▼ ${signed}${unit}` }
            }
            return { kind: 'same', label: '·' }
        }
        if (entry.formatted.value !== entry.prevFormatted.value) {
            return { kind: 'changed', label: '≠' }
        }
        return { kind: 'same', label: '·' }
    }

    private deltaOfRate (entry: LatestEntry): { kind: 'up' | 'down' | 'same' | 'changed'; label: string } {
        const h = entry.history
        const ts = entry.historyTs
        if (h.length < 3) { return { kind: 'same', label: '·' } }
        const n = h.length
        const rateAt = (i: number): number | null => {
            const dt = ts[i] - ts[i - 1]
            if (dt <= 0) { return null }
            const dv = h[i] - h[i - 1]
            if (dv < 0) { return null }
            return (dv / dt) * 1000
        }
        const cur = rateAt(n - 1)
        const prev = rateAt(n - 2)
        if (cur === null || prev === null) { return { kind: 'same', label: '·' } }
        const d = cur - prev
        if (d > 0) { return { kind: 'up', label: `▲ +${this.formatRateValue(d, entry.path)} ${this.rateUnit(entry.path)}` } }
        if (d < 0) { return { kind: 'down', label: `▼ ${this.formatRateValue(d, entry.path)} ${this.rateUnit(entry.path)}` } }
        return { kind: 'same', label: '·' }
    }

    private compactNumber (n: number): string {
        if (Number.isInteger(n)) { return String(n) }
        return String(Number(n.toFixed(2)))
    }

    ageLabel (entry: LatestEntry): string {
        const ms = this.now - Math.floor(entry.lastTimestampNs / 1_000_000)
        const s = Math.max(0, Math.round(ms / 1000))
        if (s < 60) { return `${s}s` }
        const m = Math.round(s / 60)
        if (m < 60) { return `${m}m` }
        return `${Math.round(m / 60)}h`
    }

    isFresh (entry: LatestEntry): boolean {
        return this.now - Math.floor(entry.lastTimestampNs / 1_000_000) < 5000
    }

    // ─── Graphical view (derived) ───────────────────────────────────

    get graphicalMetricCandidates (): GraphMetric[] {
        if (this.candidatesCache.seq === this.latestDirtySeq) {
            return this.candidatesCache.list
        }
        const counts = new Map<string, number>()
        for (const entry of this.latestByPath.values()) {
            if (!entry.history.length) { continue }
            const leaf = this.formatter.leafName(entry.path)
            counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
        }
        const out: GraphMetric[] = []
        for (const [leaf, componentCount] of counts) {
            out.push({ leaf, signature: leaf, componentCount })
        }
        out.sort((a, b) => b.componentCount - a.componentCount || a.leaf.localeCompare(b.leaf))
        this.candidatesCache = { seq: this.latestDirtySeq, list: out }
        return out
    }

    get selectedGraphicalMetric (): string | null {
        const candidates = this.graphicalMetricCandidates
        if (this.graphicalMetric && candidates.some(c => c.leaf === this.graphicalMetric)) {
            return this.graphicalMetric
        }
        if (!candidates.length) { return null }

        let best: { leaf: string; score: number } | null = null
        for (const cand of candidates) {
            let chartable = 0
            let varying = 0
            for (const entry of this.latestByPath.values()) {
                if (this.formatter.leafName(entry.path) !== cand.leaf) { continue }
                if (entry.history.length < 2) { continue }
                chartable += 1
                const [first] = entry.history
                for (let i = 1; i < entry.history.length; i++) {
                    if (entry.history[i] !== first) { varying += 1; break }
                }
            }
            const score = varying * 10_000 + chartable
            if (score > 0 && (!best || score > best.score)) {
                best = { leaf: cand.leaf, score }
            }
        }
        if (best) { return best.leaf }

        for (const cand of candidates) {
            const anyNumeric = [...this.latestByPath.values()].some(e =>
                this.formatter.leafName(e.path) === cand.leaf && e.history.length > 0,
            )
            if (anyNumeric) { return cand.leaf }
        }
        return candidates[0].leaf
    }

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

    chartPaths (entry: LatestEntry): {
        line: string; area: string; endX: number; endY: number;
        min: number; max: number
        minLabel: string; maxLabel: string
        windowSpanLabel: string
        sampleCount: number
        singleSample: boolean
        currentLabel: string
        currentUnit: string
        useRate: boolean
    } | null {
        const useRate = this.shouldPlotRate(entry.path)
        const [hRaw, tsRaw] = this.windowedHistory(entry)
        const [h, ts] = useRate ? this.toRateSeries(hRaw, tsRaw) : [hRaw, tsRaw]
        if (!h.length) { return null }
        const min = Math.min(...h)
        const max = Math.max(...h)
        const unit = useRate ? this.rateUnit(entry.path) : entry.formatted.unit
        const latest = h[h.length - 1]
        const latestLabel = useRate
            ? this.formatRateValue(latest, entry.path)
            : entry.formatted.value
        const axisLabel = (n: number): string => useRate
            ? this.formatRateValue(n, entry.path)
            : this.formatter.format(n, entry.path).value
        if (h.length === 1 || max === min) {
            const value = max
            const y = 25
            const spanMs = ts.length ? this.now - ts[0] : 0
            return {
                line: `M0,${y} L100,${y}`,
                area: `M0 50 L0,${y} L100,${y} L100,50 Z`,
                endX: 100, endY: y,
                min: value, max: value,
                minLabel: axisLabel(value), maxLabel: axisLabel(value),
                windowSpanLabel: this.humanizeSpan(spanMs),
                sampleCount: h.length,
                singleSample: true,
                currentLabel: latestLabel, currentUnit: unit,
                useRate,
            }
        }
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
        const spanMs = ts[ts.length - 1] - ts[0]
        return {
            line, area, endX, endY, min, max,
            minLabel: axisLabel(min), maxLabel: axisLabel(max),
            windowSpanLabel: this.humanizeSpan(spanMs),
            sampleCount: h.length,
            singleSample: false,
            currentLabel: latestLabel, currentUnit: unit,
            useRate,
        }
    }

    /**
     * True when a leaf should be plotted as rate under the current
     * chartDisplay setting. Auto-mode heuristic mirrors gNMI's counter
     * naming — `.../counters/*`, `-octets`, `-pkts`, etc. — plus the
     * two collector-native counters `requests_total` / `errors_total`
     * (Prometheus counters conventionally end in `_total`).
     */
    shouldPlotRate (path: string): boolean {
        if (this.chartDisplay === 'value') { return false }
        if (this.chartDisplay === 'rate') { return true }
        const p = path.toLowerCase()
        if (p.includes('/counters/')) { return true }
        const leaf = this.formatter.leafName(path).toLowerCase()
        return leaf.endsWith('_total') ||
               leaf.endsWith('-octets') || leaf === 'octets' ||
               leaf.endsWith('-pkts') || leaf.endsWith('-packets') || leaf === 'packets' ||
               leaf.endsWith('-count') || leaf === 'count' ||
               leaf.endsWith('-frames') || leaf === 'frames' ||
               leaf.endsWith('-errors') || leaf === 'errors' ||
               leaf.endsWith('-discards') || leaf === 'discards'
    }

    private toRateSeries (values: number[], ts: number[]): [number[], number[]] {
        if (values.length < 2) { return [[], []] }
        const rateVals: number[] = []
        const rateTs: number[] = []
        for (let i = 1; i < values.length; i++) {
            const dt = ts[i] - ts[i - 1]
            if (dt <= 0) { continue }
            const dv = values[i] - values[i - 1]
            if (dv < 0) { continue }
            rateVals.push((dv / dt) * 1000)
            rateTs.push(ts[i])
        }
        return [rateVals, rateTs]
    }

    // ─── Expanded card view ─────────────────────────────────────────

    expandCard (card: GraphCard): void {
        this.expandedEntryPath = card.entry.path
        this.hoverIndex = null
    }

    closeExpanded (): void {
        this.expandedEntryPath = null
        this.hoverIndex = null
    }

    get expandedEntry (): LatestEntry | null {
        if (!this.expandedEntryPath) { return null }
        return this.latestByPath.get(this.expandedEntryPath) ?? null
    }

    get expandedLabel (): string {
        const e = this.expandedEntry
        if (!e) { return '' }
        return this.formatter.lastListKey(e.path) ?? this.formatter.shortPath(e.path, 2)
    }

    get expandedChart (): ExpandedChart | null {
        const e = this.expandedEntry
        if (!e) { return null }
        const useRate = this.shouldPlotRate(e.path)
        const [hRaw, tsRaw] = this.windowedHistory(e)
        const [values, ts] = useRate ? this.toRateSeries(hRaw, tsRaw) : [hRaw, tsRaw]
        if (!values.length) { return null }

        const chartX0 = 60
        const chartX1 = 780
        const chartY0 = 10
        const chartY1 = 260
        const chartW = chartX1 - chartX0
        const chartH = chartY1 - chartY0

        const min = Math.min(...values)
        const max = Math.max(...values)
        const yRange = max - min || 1
        const dx = values.length > 1 ? chartW / (values.length - 1) : 0
        const pts = values.map((v, i) => ({
            x: chartX0 + i * dx,
            y: chartY1 - ((v - min) / yRange) * chartH,
            value: v,
            tsMs: ts[i],
        }))
        const line = pts.map((p, i) =>
            `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
        ).join(' ')
        const area = pts.length
            ? `M${chartX0},${chartY1} L${line.slice(1)} L${pts[pts.length - 1].x.toFixed(1)},${chartY1} Z`
            : ''

        const yTicks: AxisTick[] = []
        for (let i = 0; i <= 4; i++) {
            const frac = i / 4
            const value = min + yRange * (1 - frac)
            yTicks.push({
                pos: chartY0 + frac * chartH,
                label: useRate
                    ? this.formatRateValue(value, e.path)
                    : this.formatter.format(value, e.path).value,
            })
        }

        const xTicks: AxisTick[] = []
        const endTs = ts[ts.length - 1]
        const [startTs] = ts
        const spanMs = endTs - startTs
        const includeSeconds = spanMs < 5 * 60 * 1000
        for (let i = 0; i <= 4; i++) {
            const frac = i / 4
            const tickTs = startTs + spanMs * frac
            xTicks.push({
                pos: chartX0 + frac * chartW,
                label: this.formatClock(tickTs, includeSeconds),
            })
        }

        let hover: ExpandedChartHover | null = null
        if (this.hoverIndex !== null && this.hoverIndex >= 0 && this.hoverIndex < pts.length) {
            const p = pts[this.hoverIndex]
            const agoMs = endTs - p.tsMs
            const clock = this.formatClock(p.tsMs, true)
            hover = {
                x: p.x,
                y: p.y,
                value: useRate ? this.formatRateValue(p.value, e.path) : this.compactNumber(p.value),
                unit: useRate ? this.rateUnit(e.path) : e.formatted.unit,
                ago: agoMs === 0 ? clock + ' (now)' : `${clock} (${this.humanizeSpan(agoMs)} ago)`,
            }
        }

        return {
            line, area, min, max,
            sampleCount: values.length,
            windowSpanLabel: this.humanizeSpan(endTs - startTs),
            useRate, yTicks, xTicks,
            chartX0, chartX1, chartY0, chartY1,
            hover,
        }
    }

    onExpandedHover (event: MouseEvent, svgEl: SVGSVGElement): void {
        const chart = this.expandedChart
        if (!chart) { return }
        const rect = svgEl.getBoundingClientRect()
        const viewX = ((event.clientX - rect.left) / rect.width) * 800
        if (viewX < chart.chartX0 || viewX > chart.chartX1) {
            this.hoverIndex = null
            return
        }
        const { useRate } = chart
        const e = this.expandedEntry
        if (!e) { return }
        const [hRaw, tsRaw] = this.windowedHistory(e)
        const [values] = useRate ? this.toRateSeries(hRaw, tsRaw) : [hRaw, tsRaw]
        if (values.length < 2) { this.hoverIndex = values.length === 1 ? 0 : null; return }
        const chartW = chart.chartX1 - chart.chartX0
        const dx = chartW / (values.length - 1)
        const idx = Math.round((viewX - chart.chartX0) / dx)
        this.hoverIndex = Math.max(0, Math.min(values.length - 1, idx))
    }

    onExpandedLeave (): void {
        this.hoverIndex = null
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private rateUnit (path: string): string {
        const leaf = this.formatter.leafName(path).toLowerCase()
        if (leaf.endsWith('-octets') || leaf === 'octets') { return 'B/s' }
        if (leaf.endsWith('-pkts') || leaf.endsWith('-packets') || leaf === 'packets') { return 'pps' }
        if (leaf.endsWith('-frames') || leaf === 'frames') { return 'fps' }
        return '/s'
    }

    private formatRateValue (n: number, path: string): string {
        const leaf = this.formatter.leafName(path).toLowerCase()
        if (leaf.endsWith('-octets') || leaf === 'octets') {
            const units = ['', 'K', 'M', 'G', 'T']
            let v = n
            let i = 0
            while (Math.abs(v) >= 1024 && i < units.length - 1) { v /= 1024; i += 1 }
            const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2
            return `${v.toFixed(digits)} ${units[i]}`.trim()
        }
        if (Math.abs(n) >= 10_000) { return Math.round(n).toLocaleString('en-US') }
        if (Math.abs(n) >= 1) { return n.toFixed(1) }
        return n.toFixed(2)
    }

    private windowedHistory (entry: LatestEntry): [number[], number[]] {
        if (!this.chartWindowSec || !entry.historyTs.length) {
            return [entry.history, entry.historyTs]
        }
        const cutoff = this.now - this.chartWindowSec * 1000
        let startIdx = entry.historyTs.length
        for (let i = entry.historyTs.length - 1; i >= 0; i--) {
            if (entry.historyTs[i] < cutoff) { break }
            startIdx = i
        }
        return [entry.history.slice(startIdx), entry.historyTs.slice(startIdx)]
    }

    private formatClock (ms: number, includeSeconds: boolean): string {
        const d = new Date(ms)
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        if (!includeSeconds) { return `${hh}:${mm}` }
        const ss = String(d.getSeconds()).padStart(2, '0')
        return `${hh}:${mm}:${ss}`
    }

    private humanizeSpan (ms: number): string {
        const s = Math.max(0, Math.round(ms / 1000))
        if (s < 60) { return `${s}s` }
        const m = Math.round(s / 60)
        if (m < 60) { return `${m}m` }
        return `${Math.round(m / 60)}h`
    }

    // ─── CD throttle ────────────────────────────────────────────────

    private scheduleCheck (): void {
        if (this.pendingCheckTimer) { return }
        this.zone.runOutsideAngular(() => {
            this.pendingCheckTimer = setTimeout(() => {
                this.pendingCheckTimer = null
                this.zone.run(() => {
                    try { this.cdr.detectChanges() } catch { /* view destroyed */ }
                })
            }, CollectorSessionTabComponent.CD_THROTTLE_MS)
        })
    }
}
