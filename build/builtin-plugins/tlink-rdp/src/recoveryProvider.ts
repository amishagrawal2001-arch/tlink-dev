import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core'

import { RDPTabComponent } from './components/rdpTab.component'

/** @hidden */
@Injectable()
export class RecoveryProvider extends TabRecoveryProvider<RDPTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:rdp-tab'
    }

    async recover (recoveryToken: RecoveryToken): Promise<NewTabParameters<RDPTabComponent>> {
        return {
            type: RDPTabComponent,
            inputs: {
                profile: recoveryToken['profile'],
                savedState: recoveryToken['savedState'],
            },
        }
    }
}

