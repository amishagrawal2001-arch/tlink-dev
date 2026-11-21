import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Injector, Input, OnDestroy, OnInit } from '@angular/core'
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Subject, Subscription } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { BaseTabComponent, TelemetrySample } from 'tlink-core'
import { Dashboard, DashboardTile, DASHBOARD_GRID_COLS } from '../api'
import { TileData, TileDelta } from './tileData'
import { Sample } from '../util/paths'
import { normalizeDashboard, orderTiles } from '../util/layout'
import { DashboardsTelemetryBroker } from '../services/telemetryBroker.service'
import { DashboardsEditorService } from '../services/dashboardsEditor.service'

/** How many recent samples each tile keeps for sparkline / chart rendering. */
const TILE_BUFFER_SIZE = 60

interface TileRuntime {
    /** Rolling buffer of recent numeric samples (oldest-first). */
    samples: Sample[]
    /** Most recent value, numeric or string. Null before the first sample. */
    latest: number | string | null
    /** Value just before `latest` — drives the delta chip. */
    previous: number | null
    /** Wall-clock ms of the most recent sample for age label. */
    latestWallMs: number | null
    /** Error message, when the broker reported one. */
    error: string | null
    /** rxjs teardown for this tile's observe() subscription. */
    sub: Subscription | null
}

/**
 * A tab rendering one dashboard. Reads the Dashboard by id from
 * `config.store.dashboards[]`, renders its tiles in a 3-column grid.
 *
 * M4.2a: each tile opens an observe() on the dashboards-side
 * TelemetryBroker, which dispatches to the gNMI or collector broker
 * by `tile.source.kind`. Samples are buffered in a rolling 60-slot
 * ring per tile; the tile components receive the derived TileData
 * through the same @Input contract the M4.1 mock stub used. Session
 * tabs still call their source services directly — M4.2b migrates
 * them so a live tab and a dashboard tile on the same (profile,
 * path) really share one underlying process.
 */
@Component({
    selector: 'dashboard-tab',
    templateUrl: './dashboardTab.component.pug',
    styleUrls: ['./dashboardTab.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardTabComponent extends BaseTabComponent implements OnInit, OnDestroy {
    @HostBinding('class.dashboard-tab') hostClass = true

    @Input() dashboardId!: string

    dashboard: Dashboard | null = null
    missingMessage = ''
    isEditing = false

    readonly gridCols = DASHBOARD_GRID_COLS

    private readonly runtime = new Map<string, TileRuntime>()
    private readonly destroy$ = new Subject<void>()
    private ageTicker: ReturnType<typeof setInterval> | null = null

    constructor (
        injector: Injector,
        private readonly broker: DashboardsTelemetryBroker,
        private readonly cdr: ChangeDetectorRef,
        private readonly editor: DashboardsEditorService,
    ) {
        super(injector)
        this.icon = 'fas fa-chart-line'
        this.setTitle('Dashboard')
    }

    ngOnInit (): void {
        const store = this.config.store as { dashboards?: Dashboard[] }
        const list = store.dashboards ?? []
        const raw = list.find(d => d.id === this.dashboardId) ?? null
        // Normalize on load so legacy no-layout tiles get stable
        // col/row for render. Non-destructive — config stays untouched
        // until the user explicitly saves or drags.
        const found = raw ? normalizeDashboard(raw) : null
        this.dashboard = found
        if (found) {
            this.setTitle(found.name || 'Dashboard')
            for (const tile of found.tiles) {
                this.startTile(tile)
            }
            // Age labels refresh on a timer because samples don't arrive
            // in time with wall-clock seconds.
            this.ageTicker = setInterval(() => this.cdr.markForCheck(), 1000)
        } else {
            this.missingMessage = `Dashboard "${this.dashboardId}" not found in config`
        }
    }

    override ngOnDestroy (): void {
        this.destroy$.next()
        this.destroy$.complete()
        if (this.ageTicker) {
            clearInterval(this.ageTicker)
            this.ageTicker = null
        }
        for (const r of this.runtime.values()) {
            r.sub?.unsubscribe()
        }
        this.runtime.clear()
        super.ngOnDestroy()
    }

    trackByTileId (_i: number, tile: DashboardTile): string {
        return tile.id
    }

    orderedTiles (): DashboardTile[] {
        return this.dashboard ? orderTiles(this.dashboard.tiles) : []
    }

    toggleEdit (): void {
        this.isEditing = !this.isEditing
        this.cdr.markForCheck()
    }

    async openEditor (): Promise<void> {
        if (!this.dashboard) { return }
        const next = await this.editor.openForDashboard(this.dashboard)
        if (next) {
            this.applyUpdatedDashboard(next)
        }
    }

    onTileDrop (event: CdkDragDrop<DashboardTile[]>): void {
        if (!this.dashboard || event.previousIndex === event.currentIndex) { return }
        const ordered = this.orderedTiles()
        moveItemInArray(ordered, event.previousIndex, event.currentIndex)
        // Rewrite positions on all tiles in the new render order so
        // layout stays stable. w/h preserved.
        ordered.forEach((t, i) => {
            t.col = i % DASHBOARD_GRID_COLS
            t.row = Math.floor(i / DASHBOARD_GRID_COLS)
        })
        // Persist via config.save() — the underlying array is the same
        // reference that lives in config.store.dashboards[].tiles, so
        // mutations have already landed; config.save() flushes to disk.
        this.persistDashboard()
        this.cdr.markForCheck()
    }

    tileColumn (tile: DashboardTile): string {
        const col = (tile.col ?? 0) + 1
        const w = tile.w ?? 1
        return `${col} / span ${w}`
    }

    tileRow (tile: DashboardTile): string {
        const row = (tile.row ?? 0) + 1
        const h = tile.h ?? 1
        return `${row} / span ${h}`
    }

    deleteTileInline (tile: DashboardTile): void {
        if (!this.dashboard) { return }
        // eslint-disable-next-line no-alert
        if (!confirm(`Delete tile ${tile.title || tile.path}?`)) { return }
        this.dashboard.tiles = this.dashboard.tiles.filter(t => t.id !== tile.id)
        const r = this.runtime.get(tile.id)
        r?.sub?.unsubscribe()
        this.runtime.delete(tile.id)
        this.persistDashboard()
        this.cdr.markForCheck()
    }

    private persistDashboard (): void {
        if (!this.dashboard) { return }
        const store = this.config.store as { dashboards?: Dashboard[] }
        const list = store.dashboards ?? []
        const i = list.findIndex(x => x.id === this.dashboard!.id)
        if (i === -1) {
            list.push(this.dashboard)
        } else {
            list.splice(i, 1, this.dashboard)
        }
        store.dashboards = list
        void this.config.save()
    }

    private applyUpdatedDashboard (next: Dashboard): void {
        if (!this.dashboard) { return }
        // Teardown stale subscriptions for removed tiles.
        const nextIds = new Set(next.tiles.map(t => t.id))
        for (const [id, r] of this.runtime) {
            if (!nextIds.has(id)) {
                r.sub?.unsubscribe()
                this.runtime.delete(id)
            }
        }
        // Normalize incoming layout so any new tiles pick up positions.
        this.dashboard = normalizeDashboard(next)
        this.setTitle(this.dashboard.name || 'Dashboard')
        for (const tile of this.dashboard.tiles) {
            if (!this.runtime.has(tile.id)) {
                this.startTile(tile)
            }
        }
        this.persistDashboard()
        this.cdr.markForCheck()
    }

    /**
     * Resolve a tile to its live TileData. Called on each CD cycle.
     * Returns null-current until the first sample arrives — tile
     * components render `—` for null and keep the structural shape.
     */
    tileData (tile: DashboardTile): TileData {
        const r = this.runtime.get(tile.id)
        if (!r) {
            return { current: null }
        }
        if (r.error) {
            return { current: null, unit: undefined }
        }
        const current = r.latest
        const delta = this.computeDelta(r.latest, r.previous)
        const ageLabel = r.latestWallMs ? formatAge(Date.now() - r.latestWallMs) : undefined
        return {
            current,
            samples: tile.type === 'value' ? undefined : [...r.samples],
            delta,
            ageLabel,
        }
    }

    /** Error message for a tile, or '' when the stream is healthy or pending. */
    tileError (tile: DashboardTile): string {
        return this.runtime.get(tile.id)?.error ?? ''
    }

    private startTile (tile: DashboardTile): void {
        const r: TileRuntime = {
            samples: [],
            latest: null,
            previous: null,
            latestWallMs: null,
            error: null,
            sub: null,
        }
        this.runtime.set(tile.id, r)
        r.sub = this.broker.observe(tile.source, tile.path)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (s: TelemetrySample) => this.applySample(tile, r, s),
                error: (err: Error) => {
                    r.error = err.message || 'Stream error'
                    this.cdr.markForCheck()
                },
                complete: () => {
                    // Stream closed server-side — show the latest
                    // known value with an age-only label; no error.
                },
            })
    }

    private applySample (tile: DashboardTile, r: TileRuntime, s: TelemetrySample): void {
        if (s.kind === 'delete') {
            return
        }
        const numericValue = coerceNumber(s.value)
        // Chart / sparkline want a continuous numeric series. Value
        // tile may show a string label too.
        if (tile.type !== 'value' && numericValue === null) {
            return
        }

        if (tile.type !== 'value' && numericValue !== null) {
            r.samples.push({ t: Math.floor(s.timestampNs / 1_000_000), v: numericValue })
            if (r.samples.length > TILE_BUFFER_SIZE) {
                r.samples.splice(0, r.samples.length - TILE_BUFFER_SIZE)
            }
        }

        const prevLatest = r.latest
        if (typeof prevLatest === 'number') {
            r.previous = prevLatest
        } else if (numericValue !== null) {
            r.previous = r.previous
        }
        r.latest = numericValue !== null ? Number(numericValue.toFixed(2)) : (s.value == null ? null : String(s.value))
        r.latestWallMs = Date.now()
        this.cdr.markForCheck()
    }

    private computeDelta (latest: number | string | null, previous: number | null): TileDelta | undefined {
        if (typeof latest !== 'number' || previous === null) {
            return undefined
        }
        const d = latest - previous
        if (d > 0) { return { kind: 'up', label: `▲ +${d.toFixed(2)}` } }
        if (d < 0) { return { kind: 'down', label: `▼ ${d.toFixed(2)}` } }
        return { kind: 'same', label: '·' }
    }
}

function coerceNumber (v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) { return v }
    if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

function formatAge (ms: number): string {
    if (ms < 2000) { return '·' }
    const sec = Math.round(ms / 1000)
    if (sec < 60) { return `${sec}s` }
    const min = Math.round(sec / 60)
    if (min < 60) { return `${min}m` }
    const hr = Math.round(min / 60)
    return `${hr}h`
}
