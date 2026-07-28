import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core'
import { CollectorSessionTabComponent } from './components/collectorSessionTab.component'

/**
 * Re-open collector session tabs across app restart. Persists just the
 * profile identity — the data source restart is deterministic from
 * the profile config (mock re-seeds, prometheus re-scrapes), so
 * there's no live-state to snapshot the way gNMI subscribes need.
 */
@Injectable()
export class CollectorRecoveryProvider extends TabRecoveryProvider<CollectorSessionTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:collector-tab'
    }

    async recover (recoveryToken: RecoveryToken): Promise<NewTabParameters<CollectorSessionTabComponent>> {
        return {
            type: CollectorSessionTabComponent,
            inputs: { profile: recoveryToken['profile'] },
        }
    }
}
