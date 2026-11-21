import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, AppService, ConfigService, SelectorService, TranslateService } from 'tlink-core'
import { Dashboard } from './api'
import { DashboardTabComponent } from './components/dashboardTab.component'

/**
 * Adds a "Dashboards" button to the toolbar. Click opens a picker of
 * every entry in `config.dashboards[]`; selecting one opens a new
 * DashboardTab bound to that dashboard's id.
 *
 * M4.1: uses its own toolbar entry rather than extending tlink-local's
 * "New connection" picker — dashboards aren't profiles, so slotting
 * them into the profile-oriented selector would conflate two concepts.
 * The sidebar section planned for M4.3+ will replace this button.
 */
@Injectable()
export class DashboardsButtonProvider extends ToolbarButtonProvider {
    constructor (
        private app: AppService,
        private config: ConfigService,
        private selector: SelectorService,
        private translate: TranslateService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/dashboards.svg'),
            title: this.translate.instant('Dashboards'),
            weight: 20,
            click: async () => {
                if (this.selector.active) { return }
                const store = this.config.store as { dashboards?: Dashboard[] }
                const list = store.dashboards ?? []
                if (!list.length) {
                    this.app.openNewTab({
                        type: DashboardTabComponent,
                        inputs: { dashboardId: '__none__' },
                    })
                    return
                }
                const options = list.map(d => ({
                    name: d.name,
                    icon: 'fas fa-chart-line',
                    group: this.translate.instant('Dashboards'),
                    description: `${d.tiles.length} tile${d.tiles.length === 1 ? '' : 's'}`,
                    callback: () => {
                        this.app.openNewTab({
                            type: DashboardTabComponent,
                            inputs: { dashboardId: d.id },
                        })
                    },
                }))
                await this.selector.show<void>(this.translate.instant('Open dashboard'), options).catch(() => null)
            },
        }]
    }
}
