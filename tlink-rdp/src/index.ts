import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { ToastrModule } from 'ngx-toastr'
import TlinkCoreModule, { ConfigProvider, TabRecoveryProvider, HotkeyProvider, ProfileProvider } from 'tlink-core'

import { RDPProfileSettingsComponent } from './components/rdpProfileSettings.component'
import { RDPTabComponent } from './components/rdpTab.component'

import { RDPConfigProvider } from './config'
import { RecoveryProvider } from './recoveryProvider'
import { RDPHotkeyProvider } from './hotkeys'
import { RDPProfilesService } from './profiles'
import { RDPService } from './services/rdp.service'

/** @hidden */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        ToastrModule,
        TlinkCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: RDPConfigProvider, multi: true },
        { provide: TabRecoveryProvider, useClass: RecoveryProvider, multi: true },
        { provide: HotkeyProvider, useClass: RDPHotkeyProvider, multi: true },
        { provide: ProfileProvider, useExisting: RDPProfilesService, multi: true },
        RDPService,
    ],
    declarations: [
        RDPProfileSettingsComponent,
        RDPTabComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class RDPModule { }

export * from './api'
export { RDPTabComponent }

