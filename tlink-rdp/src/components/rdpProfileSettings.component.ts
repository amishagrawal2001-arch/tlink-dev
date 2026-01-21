/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component } from '@angular/core'

import { ProfileSettingsComponent } from 'tlink-core'
import { RDPProfile } from '../api'

/** @hidden */
@Component({
    templateUrl: './rdpProfileSettings.component.pug',
})
export class RDPProfileSettingsComponent implements ProfileSettingsComponent<RDPProfile> {
    profile: RDPProfile
    showPassword = false
}
