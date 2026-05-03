import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { ToastrModule } from 'ngx-toastr'
import TlinkCoreModule, { ConfigProvider, TabRecoveryProvider, ProfileProvider, ToolbarButtonProvider, HotkeyProvider } from 'tlink-core'

import { APIClientTabComponent } from './components/apiClientTab.component'
import { ImportModalComponent } from './components/importModal.component'
import { APIClientConfigProvider } from './config'
import { APIClientRecoveryProvider } from './recoveryProvider'
import { APIClientProfilesService } from './profiles'
import { APIClientButtonProvider } from './buttonProvider'
import { APIClientHotkeyProvider } from './hotkeys'
import { HttpClientService } from './services/httpClient.service'
import { EnvironmentService } from './services/environment.service'
import { HistoryService } from './services/history.service'
import { AssertionsService } from './services/assertions.service'
import { ScriptService } from './services/script.service'
import { OAuth2Service } from './services/oauth2.service'

@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        ToastrModule,
        TlinkCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: APIClientConfigProvider, multi: true },
        { provide: TabRecoveryProvider, useClass: APIClientRecoveryProvider, multi: true },
        { provide: ProfileProvider, useExisting: APIClientProfilesService, multi: true },
        { provide: ToolbarButtonProvider, useClass: APIClientButtonProvider, multi: true },
        { provide: HotkeyProvider, useClass: APIClientHotkeyProvider, multi: true },
        HttpClientService,
        EnvironmentService,
        HistoryService,
        AssertionsService,
        ScriptService,
        OAuth2Service,
    ],
    declarations: [
        APIClientTabComponent,
        ImportModalComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Angular @NgModule pattern
export default class APIClientModule { }

export { APIClientTabComponent }
