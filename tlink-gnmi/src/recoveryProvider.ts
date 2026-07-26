import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core'

import { GnmiSessionTabComponent } from './components/gnmiSessionTab.component'

/**
 * Re-opens gNMI session tabs on app restart. Persists just the profile
 * — no live subscription state — because a subscription is a stream
 * that must be renegotiated with the target anyway. When M4 lands
 * dashboards, they'll need their own richer recovery format.
 */
@Injectable()
export class GnmiRecoveryProvider extends TabRecoveryProvider<GnmiSessionTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:gnmi-tab'
    }

    async recover (recoveryToken: RecoveryToken): Promise<NewTabParameters<GnmiSessionTabComponent>> {
        return {
            type: GnmiSessionTabComponent,
            inputs: {
                profile: recoveryToken['profile'],
            },
        }
    }
}
