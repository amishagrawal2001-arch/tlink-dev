import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core'

import { GnmiSessionTabComponent } from './components/gnmiSessionTab.component'

/**
 * Re-opens gNMI session tabs on app restart. Restores the profile
 * plus a `savedState` payload describing the active subscriptions
 * the user had running at close time — the session tab reads that
 * @Input in ngOnInit and re-subscribes as soon as it boots. A
 * subscription is a live stream negotiated with the target, so we
 * don't try to preserve stream history — just the set of paths and
 * their mode/interval settings. When M4 lands dashboards, they'll
 * add their own richer recovery format on top.
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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                savedState: recoveryToken['savedState'] ?? null,
            },
        }
    }
}
