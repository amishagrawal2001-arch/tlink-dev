import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import TlinkCoreModule, { ConfigProvider, ProfileProvider, TabRecoveryProvider } from 'tlink-core'

import { GnmiConfigProvider } from './config'
import { GnmiService } from './services/gnmi.service'
import { GnmicDiscoveryService } from './services/gnmicDiscovery.service'
import { GnmiPasswordStorageService } from './services/passwordStorage.service'
import { GnmiValueFormatterService } from './services/valueFormatter.service'
import { GnmiPathCatalogService } from './services/pathCatalog.service'

import { GnmiProfilesService } from './profiles'
import { GnmiRecoveryProvider } from './recoveryProvider'
import { GnmiProfileSettingsComponent } from './components/gnmiProfileSettings.component'
import { GnmiSessionTabComponent } from './components/gnmiSessionTab.component'

/**
 * gNMI plugin entry.
 *
 * M2.1 wires the profile flow: New Target dialog, profile provider,
 * tab recovery, and a placeholder session tab. The session tab still
 * shows a "coming in M2.2" card — subscribe/stream isn't hooked up
 * yet. Test Connection IS live: it runs a real Capabilities RPC via
 * the bundled gnmic binary.
 *
 * Feature flag: nothing here activates unless `gnmi.enabled` is true
 * in config. The provider registrations happen unconditionally at
 * module load, but the Profiles UI hides profile types whose
 * provider returns no builtin templates when the flag is off. TODO
 * revisit gating strategy when M2.2 lands the tab component — may
 * need to conditionally register via NgModule.forRoot instead.
 */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        TlinkCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: GnmiConfigProvider, multi: true },
        { provide: ProfileProvider, useExisting: GnmiProfilesService, multi: true },
        { provide: TabRecoveryProvider, useClass: GnmiRecoveryProvider, multi: true },
        GnmiService,
        GnmicDiscoveryService,
        GnmiPasswordStorageService,
        GnmiValueFormatterService,
        GnmiPathCatalogService,
        GnmiProfilesService,
    ],
    declarations: [
        GnmiProfileSettingsComponent,
        GnmiSessionTabComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class GnmiModule { }

export * from './api'
export { GnmiService } from './services/gnmi.service'
export { GnmicDiscoveryService } from './services/gnmicDiscovery.service'
export { GnmiProfilesService } from './profiles'
export { GnmiSessionTabComponent } from './components/gnmiSessionTab.component'
