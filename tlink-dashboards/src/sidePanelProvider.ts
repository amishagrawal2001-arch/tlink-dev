import { Injectable } from '@angular/core'
import { SidePanelRegistration, SidePanelService } from 'tlink-core'
import { DashboardsPanelComponent } from './components/dashboardsPanel.component'

const DASHBOARDS_PANEL_WIDTH = 260

/** Side-panel registration token for Dashboards. Exported so the toolbar button can target it. */
export const DASHBOARDS_PANEL: SidePanelRegistration = {
    id: 'dashboards',
    component: DashboardsPanelComponent,
    label: 'Dashboards',
    width: DASHBOARDS_PANEL_WIDTH,
    mode: null,
}

/**
 * Registers the Dashboards side panel on bootstrap. Follows the
 * tlink-terminal pattern — a plain injectable that calls
 * `sidePanel.register()` in its constructor.
 */
@Injectable()
export class DashboardsSidePanelProvider {
    constructor (sidePanel: SidePanelService) {
        sidePanel.register(DASHBOARDS_PANEL)
    }
}
