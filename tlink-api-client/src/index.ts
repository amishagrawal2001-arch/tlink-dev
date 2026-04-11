import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { ToastrModule } from 'ngx-toastr'
import TlinkCoreModule, { ConfigProvider, TabRecoveryProvider, ProfileProvider, ToolbarButtonProvider } from 'tlink-core'

import { APIClientTabComponent } from './components/apiClientTab.component'
import { APIClientConfigProvider } from './config'
import { APIClientRecoveryProvider } from './recoveryProvider'
import { APIClientProfilesService } from './profiles'
import { APIClientButtonProvider } from './buttonProvider'
import { HttpClientService } from './services/httpClient.service'

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
        HttpClientService,
    ],
    declarations: [
        APIClientTabComponent,
    ],
})
export default class APIClientModule { }

export { APIClientTabComponent }
