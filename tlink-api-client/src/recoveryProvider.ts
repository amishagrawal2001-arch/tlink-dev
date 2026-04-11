import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core'
import { APIClientTabComponent } from './components/apiClientTab.component'

@Injectable()
export class APIClientRecoveryProvider extends TabRecoveryProvider<APIClientTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:api-client-tab'
    }

    async recover (recoveryToken: RecoveryToken): Promise<NewTabParameters<APIClientTabComponent>> {
        return {
            type: APIClientTabComponent,
            inputs: {
                profile: recoveryToken['profile'],
                savedState: recoveryToken['savedState'],
            },
        }
    }
}
