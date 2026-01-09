import { Injectable } from '@angular/core'
import { NewTabParameters, RecoveryToken, TabRecoveryProvider as CoreTabRecoveryProvider } from 'tlink-core'

import { CommandWindowTabComponent } from './components/commandWindowTab.component'

// Fallback base class to avoid runtime crashes if the core export is undefined
const TabRecoveryProviderRuntime = (CoreTabRecoveryProvider ?? class {}) as typeof CoreTabRecoveryProvider

/** @hidden */
@Injectable()
export class CommandWindowRecoveryProvider extends TabRecoveryProviderRuntime<CommandWindowTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:command-window'
    }

    async recover (recoveryToken: RecoveryToken): Promise<NewTabParameters<CommandWindowTabComponent>> {
        return {
            type: CommandWindowTabComponent,
            inputs: {
                commandAreaHidden: Boolean(recoveryToken.commandAreaHidden),
            },
        }
    }
}
