import { ModuleWithProviders, NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

import { TlinkLicenseConfig, TLINK_LICENSE_CONFIG } from './tlink-license.config'
import { TlinkLicenseService } from './tlink-license.service'

import { TrialBannerComponent } from './components/trial-banner/trial-banner.component'
import { ActivationDialogComponent } from './components/activation-dialog/activation-dialog.component'
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component'
import { AdminPanelComponent } from './components/admin-panel/admin-panel.component'
import { LicenseMenuComponent } from './components/license-menu/license-menu.component'
import { ServerSettingsComponent } from './components/server-settings/server-settings.component'

const COMPONENTS = [
    TrialBannerComponent,
    ActivationDialogComponent,
    SplashScreenComponent,
    AdminPanelComponent,
    LicenseMenuComponent,
    ServerSettingsComponent,
]

@NgModule({
    imports: [CommonModule, FormsModule],
    declarations: [...COMPONENTS],
    exports: [...COMPONENTS],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class TlinkLicenseModule {
    static forRoot (config?: TlinkLicenseConfig): ModuleWithProviders<TlinkLicenseModule> {
        return {
            ngModule: TlinkLicenseModule,
            providers: [
                TlinkLicenseService,
                { provide: TLINK_LICENSE_CONFIG, useValue: config ?? {} },
            ],
        }
    }
}
