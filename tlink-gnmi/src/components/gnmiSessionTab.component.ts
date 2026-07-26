/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Injector, Input, NgZone, OnDestroy } from '@angular/core'
import { BaseTabComponent, NotificationsService } from 'tlink-core'
import { GnmiCapabilities, GnmiNotification, GnmiProfile, GnmiStreamMode, GnmiSubscribeMode } from '../api'
import { GnmiService, GnmiSubscribeHandle } from '../services/gnmi.service'

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
    stream: StreamRow[] = []
    filter = ''
    paused = false
    pendingSincePause = 0
    selectedRow: StreamRow | null = null
    totalReceived = 0
    /** Rolling messages-per-second, updated on a 1-Hz timer. */
    receiveRate = 0

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

    private gnmi: GnmiService
    private notifications: NotificationsService
    private zone: NgZone

    constructor (injector: Injector) {
        super(injector)
        this.gnmi = injector.get(GnmiService)
        this.notifications = injector.get(NotificationsService)
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

        if (this.paused) {
            this.pausedBuffer.push(row)
            this.pendingSincePause = this.pausedBuffer.length
            return
        }
        this.pushRow(row)
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
}
