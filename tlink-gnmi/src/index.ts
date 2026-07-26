import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import TlinkCoreModule, { ConfigProvider } from 'tlink-core'

import { GnmiConfigProvider } from './config'
import { GnmiService } from './services/gnmi.service'
import { GnmicDiscoveryService } from './services/gnmicDiscovery.service'

/**
 * gNMI plugin entry.
 *
 * v1.2.0 M1: scaffold only — services and config are wired but no UI
 * or profile provider is registered yet. Nothing user-visible turns on
 * until M2 lands the "gNMI Session" tab type and target profile UI.
 *
 * The plugin ALWAYS loads (so the config keys defined in
 * GnmiConfigProvider are available for Settings to render), but every
 * downstream feature — tab creation, profile provider, hotkeys —
 * gates on `config.store.gnmi.enabled === true`. See config.ts.
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
        GnmiService,
        GnmicDiscoveryService,
    ],
    declarations: [],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class GnmiModule { }

export * from './api'
export { GnmiService } from './services/gnmi.service'
export { GnmicDiscoveryService } from './services/gnmicDiscovery.service'
