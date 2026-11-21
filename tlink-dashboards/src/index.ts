import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { DragDropModule } from '@angular/cdk/drag-drop'
import TlinkCoreModule, { ConfigProvider, ToolbarButtonProvider } from 'tlink-core'

import { DashboardsConfigProvider } from './config'
import { DashboardsButtonProvider } from './buttonProvider'
import { DashboardsSidePanelProvider } from './sidePanelProvider'
import { DashboardsTelemetryBroker } from './services/telemetryBroker.service'
import { DashboardsEditorService } from './services/dashboardsEditor.service'
import { DashboardTabComponent } from './components/dashboardTab.component'
import { DashboardsPanelComponent } from './components/dashboardsPanel.component'
import { DashboardEditorModalComponent } from './components/dashboardEditorModal.component'
import { ValueTileComponent } from './components/tiles/valueTile.component'
import { SparklineTileComponent } from './components/tiles/sparklineTile.component'
import { ChartTileComponent } from './components/tiles/chartTile.component'

/**
 * tlink-dashboards plugin.
 *
 * M4.1: scaffold + three tile shapes (value / sparkline / chart) + 3-col
 * grid tab + toolbar entry. Tiles rendered mock data.
 * M4.2a: tiles wired to DashboardsTelemetryBroker (shared runner).
 * M4.2b: session tabs migrated to the same broker — a live tab and a
 * dashboard tile on the same (profile, path) share one subprocess.
 * M4.3 (this slice): editor modal, Dashboards side panel, drag-to-reorder
 * on the dashboard tab, explicit col/row/w/h on DashboardTile, collector
 * path catalog for the editor's Suggest flow.
 */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        DragDropModule,
        TlinkCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: DashboardsConfigProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: DashboardsButtonProvider, multi: true },
        DashboardsTelemetryBroker,
        DashboardsEditorService,
        DashboardsSidePanelProvider,
    ],
    declarations: [
        DashboardTabComponent,
        DashboardsPanelComponent,
        DashboardEditorModalComponent,
        ValueTileComponent,
        SparklineTileComponent,
        ChartTileComponent,
    ],
})
export default class DashboardsModule {
    // Instantiating the side-panel provider from the module ctor makes
    // sure the Dashboards panel is registered even if no component ever
    // injects it — the provider's own ctor calls `sidePanel.register()`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor (_sidePanelProvider: DashboardsSidePanelProvider) { }
}

export * from './api'
export { DashboardsTelemetryBroker } from './services/telemetryBroker.service'
export { DashboardTabComponent } from './components/dashboardTab.component'
export { DashboardsPanelComponent } from './components/dashboardsPanel.component'
export { DashboardEditorModalComponent } from './components/dashboardEditorModal.component'
export { ValueTileComponent } from './components/tiles/valueTile.component'
export { SparklineTileComponent } from './components/tiles/sparklineTile.component'
export { ChartTileComponent } from './components/tiles/chartTile.component'
export { DASHBOARDS_PANEL } from './sidePanelProvider'
