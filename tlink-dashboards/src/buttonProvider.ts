import { Injectable } from '@angular/core'
import { SidePanelService, ToolbarButtonProvider, ToolbarButton, TranslateService } from 'tlink-core'
import { DASHBOARDS_PANEL } from './sidePanelProvider'

/**
 * Adds a "Dashboards" button to the toolbar. In M4.3+ the button
 * toggles the Dashboards side panel (where users browse, open, edit
 * and manage dashboards). The M4.1 selector-based open flow was
 * replaced by the panel; the button stays as a quick toggle.
 */
@Injectable()
export class DashboardsButtonProvider extends ToolbarButtonProvider {
    constructor (
        private sidePanel: SidePanelService,
        private translate: TranslateService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        return [{
            icon: require('./icons/dashboards.svg'),
            title: this.translate.instant('Dashboards'),
            weight: 20,
            click: () => {
                this.sidePanel.toggle(DASHBOARDS_PANEL)
            },
        }]
    }
}
