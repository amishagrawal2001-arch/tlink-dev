/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Injector, Input } from '@angular/core'
import { BaseTabComponent } from 'tlink-core'
import { GnmiProfile } from '../api'

/**
 * gNMI session tab.
 *
 * M2.1 (current): placeholder — connects nothing, streams nothing.
 * We ship the shell now so the profile provider has a concrete tab
 * type to point at when Connect is clicked, and so the tab-recovery
 * plumbing works end-to-end. The user sees an honest "coming next"
 * card instead of a blank window.
 *
 * M2.2 (next): swap this template for the real three-pane layout
 * from the mockup — subscriptions list on the left, live JSON stream
 * in the middle, RPC controls on the right. `GnmiService.subscribe`
 * gets its real implementation at the same time.
 */
@Component({
    selector: 'gnmi-session-tab',
    templateUrl: './gnmiSessionTab.component.pug',
    styleUrls: ['./gnmiSessionTab.component.scss'],
})
export class GnmiSessionTabComponent extends BaseTabComponent {
    @Input() profile: GnmiProfile

    constructor (injector: Injector) {
        super(injector)
        this.setTitle('gNMI')
    }

    ngOnInit (): void {
        // profile is @Input — declared present but reality is that
        // Angular may not have bound it yet, so guard anyway.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.profile) {
            this.setTitle(`gNMI · ${this.profile.name}`)
        }
    }
}
