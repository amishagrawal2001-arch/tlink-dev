import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import TlinkCoreModule, { ConfigProvider, ProfileProvider, TabRecoveryProvider } from 'tlink-core'

import { CollectorConfigProvider } from './config'
import { CollectorMockService } from './services/mock.service'
import { CollectorValueFormatterService } from './services/valueFormatter.service'
import { CollectorProfilesService } from './profiles'
import { CollectorRecoveryProvider } from './recoveryProvider'
import { CollectorProfileSettingsComponent } from './components/collectorProfileSettings.component'
import { CollectorSessionTabComponent } from './components/collectorSessionTab.component'

/**
 * tlink-collector plugin.
 *
 * M3.1: profile provider + New Target dialog + Mock source + Wire-log
 * session tab. Users can create a "Collector" profile with source =
 * mock, hit Connect, and watch a synthetic metrics stream. Proves
 * the pull-based-source architecture end-to-end.
 *
 * M3.2 will add the real Prometheus HTTP scrape service alongside
 * the Mock. M3.3 ports Latest / Graphical view modes from
 * tlink-gnmi.
 *
 * Kept sibling to tlink-gnmi, not folded in — the two data-source
 * families have different config surfaces + lifecycles + failure
 * modes. Sharing UI code can come later if the overlap grows.
 */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        TlinkCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: CollectorConfigProvider, multi: true },
        { provide: ProfileProvider, useExisting: CollectorProfilesService, multi: true },
        { provide: TabRecoveryProvider, useClass: CollectorRecoveryProvider, multi: true },
        CollectorMockService,
        CollectorProfilesService,
        CollectorValueFormatterService,
    ],
    declarations: [
        CollectorProfileSettingsComponent,
        CollectorSessionTabComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class CollectorModule { }

export * from './api'
export { CollectorMockService } from './services/mock.service'
export { CollectorProfilesService } from './profiles'
export { CollectorSessionTabComponent } from './components/collectorSessionTab.component'
