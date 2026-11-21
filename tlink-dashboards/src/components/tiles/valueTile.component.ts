import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { DashboardTile } from '../../api'
import { TileData } from '../tileData'

/**
 * Single-value tile. Big number + unit + optional delta chip + label.
 * Pure presentation — no services injected. The dashboard tab passes
 * `tile` (static config) and `data` (live-ish payload) as inputs each
 * render cycle.
 */
@Component({
    selector: 'dashboard-value-tile',
    templateUrl: './valueTile.component.pug',
    styleUrls: ['./valueTile.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValueTileComponent {
    @Input() tile!: DashboardTile
    @Input() data!: TileData

    get label (): string {
        return this.tile.title ?? this.tile.path
    }

    get hasValue (): boolean {
        return this.data?.current !== null && this.data?.current !== undefined
    }
}
