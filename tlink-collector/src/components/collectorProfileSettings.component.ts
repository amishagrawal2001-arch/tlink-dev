/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component } from '@angular/core'
import { ProfileSettingsComponent } from 'tlink-core'
import { CollectorProfile } from '../api'

/**
 * New Collector Target dialog. Two source types today (Mock, Prometheus);
 * Prometheus fields are inert until M3.2 lands the real scraper — kept
 * visible so the config surface doesn't disappear/reappear when the
 * user flips source types.
 */
@Component({
    templateUrl: './collectorProfileSettings.component.pug',
    styleUrls: ['./collectorProfileSettings.component.scss'],
})
export class CollectorProfileSettingsComponent implements ProfileSettingsComponent<CollectorProfile> {
    profile: CollectorProfile

    /**
     * Fill mock defaults when the user picks 'mock' with an empty
     * mock config, so switching source types doesn't leave the form
     * missing required fields.
     */
    onSourceChange (): void {
        if (this.profile.options.source === 'mock' && !this.profile.options.mock) {
            this.profile.options.mock = { hostCount: 5, scenario: 'idle' }
        }
    }
}
