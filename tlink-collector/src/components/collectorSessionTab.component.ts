/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, NgZone, OnDestroy } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tlink-core'
import { CollectorProfile, CollectorSample } from '../api'
import { CollectorHandle, CollectorMockService } from '../services/mock.service'

/** One row in the live stream table. Newest-first ring buffer. */
interface StreamRow {
    id: number
    timestampNs: number
    path: string
    value: unknown
    valuePreview: string
    kind: 'update' | 'delete'
}

/**
 * Session tab for one collector target. M3.1 scope: Wire-log view only
 * (path / value / timestamp table with pause / clear / export).
 * Latest + Graphical modes port in M3.3; keeping this file small so
 * M3.1 ships as a reviewable slice.
 *
 * OnPush + throttled CD (10 Hz) — same pattern as
 * GnmiSessionTabComponent so a bursty mock at hostCount=50 doesn't
 * blast change detection.
 */
@Component({
    selector: 'collector-session-tab',
    templateUrl: './collectorSessionTab.component.pug',
    styleUrls: ['./collectorSessionTab.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorSessionTabComponent extends BaseTabComponent implements OnDestroy {
    @Input() profile: CollectorProfile

    /** Cap on rendered rows; older drop off the tail. */
    private static readonly MAX_STREAM_ROWS = 1000
    private static readonly VALUE_PREVIEW_LEN = 240
    private static readonly CD_THROTTLE_MS = 100

    // ─── Public state (template bindings) ───────────────────────────
    running = false
    stream: StreamRow[] = []
    filter = ''
    paused = false
    pendingSincePause = 0
    totalReceived = 0
    receiveRate = 0
    lastError = ''
    /** Wall-clock now, updated at 1 Hz for age labels stability across CD passes. */
    now = Date.now()

    // ─── Private plumbing ───────────────────────────────────────────
    private handle: CollectorHandle | null = null
    private rowIdSeq = 0
    private pausedBuffer: StreamRow[] = []
    private prevTotalForRate = 0
    private rateTimer: ReturnType<typeof setInterval> | null = null
    private pendingCheckTimer: ReturnType<typeof setTimeout> | null = null

    private mock: CollectorMockService
    private notifications: NotificationsService
    private zone: NgZone
    private cdr: ChangeDetectorRef

    constructor (injector: Injector) {
        super(injector)
        this.mock = injector.get(CollectorMockService)
        this.notifications = injector.get(NotificationsService)
        this.zone = injector.get(NgZone)
        this.cdr = injector.get(ChangeDetectorRef)
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    ngOnInit (): void {
        // profile is @Input; defensive check for Angular's binding
        // race. Deferred setTitle sidesteps NG0100 the same way
        // GnmiSessionTabComponent does.
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

    /**
     * Wire up the configured data source. Currently 'mock' is the only
     * supported source; M3.2 will add 'prometheus' by routing to a
     * different service based on profile.options.source.
     */
    start (): void {
        this.stop()
        this.lastError = ''
        try {
            switch (this.profile.options.source) {
                case 'mock':
                    this.handle = this.mock.start(this.profile)
                    break
                case 'prometheus':
                    // M3.2 — replaces this stub with the real scraper.
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

    // ─── CD throttle (see GnmiSessionTabComponent for full rationale) ──

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
