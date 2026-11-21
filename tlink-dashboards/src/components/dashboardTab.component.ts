import { ChangeDetectionStrategy, Component, HostBinding, Injector, Input, OnInit } from '@angular/core'
import { BaseTabComponent } from 'tlink-core'
import { Dashboard, DashboardTile } from '../api'
import { TileData, TileDelta } from './tileData'
import { Sample } from '../util/paths'

/**
 * A tab rendering one dashboard. Reads the Dashboard by id from
 * `config.store.dashboards[]`, renders its tiles in a 3-column grid.
 *
 * M4.1 scope: layout + static tile components. Tile data comes from
 * `mockData()` — a deterministic stub per tile.id so you can see the
 * grid, tile shapes, and theming without any data plumbing. M4.2
 * replaces `mockData()` with a shared subscription runner feed.
 */
@Component({
    selector: 'dashboard-tab',
    templateUrl: './dashboardTab.component.pug',
    styleUrls: ['./dashboardTab.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardTabComponent extends BaseTabComponent implements OnInit {
    @HostBinding('class.dashboard-tab') hostClass = true

    @Input() dashboardId!: string

    dashboard: Dashboard | null = null
    missingMessage = ''

    constructor (injector: Injector) {
        super(injector)
        this.icon = 'fas fa-chart-line'
        this.setTitle('Dashboard')
    }

    ngOnInit (): void {
        const store = this.config.store as { dashboards?: Dashboard[] }
        const list = store.dashboards ?? []
        const found = list.find(d => d.id === this.dashboardId) ?? null
        this.dashboard = found
        if (found) {
            this.setTitle(found.name || 'Dashboard')
        } else {
            this.missingMessage = `Dashboard "${this.dashboardId}" not found in config`
        }
    }

    trackByTileId (_i: number, tile: DashboardTile): string {
        return tile.id
    }

    // TODO(M4.2): replace mockData() with shared subscription runner feed.
    mockData (tile: DashboardTile): TileData {
        const seed = this.hashSeed(tile.id)
        const samples = this.mockSamples(seed, tile.type)
        const latest = samples.length ? samples[samples.length - 1].v : null
        const prev = samples.length > 1 ? samples[samples.length - 2].v : null

        if (tile.type === 'value') {
            return {
                current: 42,
                unit: '%',
                delta: { kind: 'up', label: '+2.1' },
                ageLabel: '3s',
            }
        }

        let delta: TileDelta | undefined
        if (latest !== null && prev !== null) {
            const d = latest - prev
            if (d > 0) {
                delta = { kind: 'up', label: `▲ +${d.toFixed(2)}` }
            } else if (d < 0) {
                delta = { kind: 'down', label: `▼ ${d.toFixed(2)}` }
            } else {
                delta = { kind: 'same', label: '·' }
            }
        }

        return {
            current: latest !== null ? Number(latest.toFixed(2)) : null,
            unit: tile.type === 'chart' ? 'ms' : '',
            samples,
            delta,
            ageLabel: '2s',
        }
    }

    /**
     * Deterministic mock series — slow sine wave + light noise seeded
     * off the tile id so the chart actually looks like something and
     * the same tile always shows the same series between renders.
     */
    private mockSamples (seed: number, kind: 'value' | 'sparkline' | 'chart'): Sample[] {
        if (kind === 'value') { return [] }
        const count = 30
        const now = Date.now()
        const out: Sample[] = []
        for (let i = 0; i < count; i++) {
            const phase = seed * 0.37 + i * 0.3
            const base = 50 + Math.sin(phase) * 20
            const noise = this.deterministicNoise(seed + i) * 6
            out.push({ t: now - (count - 1 - i) * 1000, v: base + noise })
        }
        return out
    }

    private hashSeed (s: string): number {
        let h = 2166136261
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i)
            h = (h * 16777619) >>> 0
        }
        return h % 1000
    }

    private deterministicNoise (n: number): number {
        const x = Math.sin(n * 12.9898) * 43758.5453
        return x - Math.floor(x) - 0.5
    }
}
