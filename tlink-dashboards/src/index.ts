import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import TlinkCoreModule, { ConfigProvider, ToolbarButtonProvider } from 'tlink-core'

import { DashboardsConfigProvider } from './config'
import { DashboardsButtonProvider } from './buttonProvider'
import { DashboardsTelemetryBroker } from './services/telemetryBroker.service'
import { DashboardTabComponent } from './components/dashboardTab.component'
import { ValueTileComponent } from './components/tiles/valueTile.component'
import { SparklineTileComponent } from './components/tiles/sparklineTile.component'
import { ChartTileComponent } from './components/tiles/chartTile.component'

/**
 * tlink-dashboards plugin.
 *
 * M4.1 (this slice) ships the foundation: plugin scaffold, data model
 * (Dashboard / DashboardTile / DashboardSourceRef), three tile shapes
 * (value / sparkline / chart), a 3-column grid-layout tab, and a
 * toolbar entry that picks a dashboard from `config.dashboards[]`.
 * Tiles render deterministic mock data — live subscriptions arrive
 * in M4.2 via a shared cross-plugin runner, editor UI in M4.3,
 * threshold alerts in M4.4, import/export in M4.5.
 *
 * Dashboards are intentionally NOT profiles — they compose tiles that
 * each reference a profile (gNMI or collector), so a single dashboard
 * can span sources. Hence no ProfileProvider here.
 */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        TlinkCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: DashboardsConfigProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: DashboardsButtonProvider, multi: true },
        DashboardsTelemetryBroker,
    ],
    declarations: [
        DashboardTabComponent,
        ValueTileComponent,
        SparklineTileComponent,
        ChartTileComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class DashboardsModule { }

export * from './api'
export { DashboardsTelemetryBroker } from './services/telemetryBroker.service'
export { DashboardTabComponent } from './components/dashboardTab.component'
export { ValueTileComponent } from './components/tiles/valueTile.component'
export { SparklineTileComponent } from './components/tiles/sparklineTile.component'
export { ChartTileComponent } from './components/tiles/chartTile.component'
