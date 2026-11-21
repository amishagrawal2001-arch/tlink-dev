import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { DashboardTile } from '../../api'
import { TileData } from '../tileData'
import { chartPath, ChartPath, compactNumber } from '../../util/paths'

/**
 * Larger chart tile. Title + current value + delta + area/line chart
 * with y-axis min/max labels. Pure presentation.
 */
@Component({
    selector: 'dashboard-chart-tile',
    templateUrl: './chartTile.component.pug',
    styleUrls: ['./chartTile.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartTileComponent {
    @Input() tile!: DashboardTile
    @Input() data!: TileData

    get label (): string {
        return this.tile.title ?? this.tile.path
    }

    get hasValue (): boolean {
        return this.data?.current !== null && this.data?.current !== undefined
    }

    get chart (): ChartPath | null {
        return chartPath(this.data?.samples ?? [])
    }

    get minLabel (): string {
        const c = this.chart
        return c && !c.singleSample ? compactNumber(c.min) : ''
    }

    get maxLabel (): string {
        const c = this.chart
        return c && !c.singleSample ? compactNumber(c.max) : ''
    }
}
