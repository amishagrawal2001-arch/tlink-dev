import { NgModule } from '@angular/core'
// import { BrowserModule } from '@angular/platform-browser'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'

import TlinkCorePlugin, { ProfileProvider, AppService } from 'tlink-core'
import TlinkTerminalModule from 'tlink-terminal'

import { DemoTerminalTabComponent } from './components/terminalTab.component'
import { DemoProfilesService } from './profiles'

/** @hidden */
@NgModule({
    imports: [
        // BrowserModule,
        FormsModule,
        NgbModule,
        TlinkCorePlugin,
        TlinkTerminalModule,
    ],
    providers: [
        { provide: ProfileProvider, useClass: DemoProfilesService, multi: true },
    ],
    declarations: [
        DemoTerminalTabComponent,
    ],
    exports: [
        DemoTerminalTabComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class DemoTerminalModule {
    constructor (
        app: AppService,
    ) {
        app.ready$.subscribe(() => {
            app.openNewTab({ type: DemoTerminalTabComponent })
        })
    }
}
