import { Component } from '@angular/core'
import { ConfigService, PlatformService } from 'tlink-core'

/** @hidden */
@Component({
    templateUrl: './colorSchemeSettingsTab.component.pug',
})
export class ColorSchemeSettingsTabComponent {
    defaultTab = 'dark'

    constructor (
        platform: PlatformService,
        public config: ConfigService,
    ) {
        this.defaultTab = platform.getTheme()
    }
}
