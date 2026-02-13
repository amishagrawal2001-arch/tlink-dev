import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'

import TlinkCorePlugin from 'tlink-core'
import { SettingsTabProvider } from 'tlink-settings'

import { PluginsSettingsTabComponent } from './components/pluginsSettingsTab.component'
import { PluginManagerService } from './services/pluginManager.service'
import { PluginsSettingsTabProvider } from './settings'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        NgbModule,
        TlinkCorePlugin,
    ],
    providers: [
        { provide: SettingsTabProvider, useClass: PluginsSettingsTabProvider, multi: true },
    ],
    declarations: [
        PluginsSettingsTabComponent,
    ],
})
export default class PluginManagerModule { } // eslint-disable-line @typescript-eslint/no-extraneous-class

export { PluginManagerService }
