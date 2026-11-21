import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { DashboardTile } from '../../api'
import { TileData } from '../tileData'
import { sparklinePath, SparklinePath } from '../../util/paths'

/**
 * Sparkline tile. Title + current value + small line chart.
 * Pure presentation — no services injected.
 */
@Component({
    selector: 'dashboard-sparkline-tile',
    templateUrl: './sparklineTile.component.pug',
    styleUrls: ['./sparklineTile.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparklineTileComponent {
    @Input() tile!: DashboardTile
    @Input() data!: TileData

    get label (): string {
        return this.tile.title ?? this.tile.path
    }

    get hasValue (): boolean {
        return this.data?.current !== null && this.data?.current !== undefined
    }

    get spark (): SparklinePath | null {
        return sparklinePath(this.data?.samples ?? [])
    }
}
