import { Injectable } from '@angular/core'
import { NewTabParameters, RecoveryToken, TabRecoveryProvider } from './api'
import { CodeEditorTabComponent } from './components/codeEditorTab.component'

/** @hidden */
@Injectable()
export class CodeEditorRecoveryProvider extends TabRecoveryProvider<CodeEditorTabComponent> {
    async applicableTo (recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:code-editor'
    }

    async recover (_recoveryToken: RecoveryToken): Promise<NewTabParameters<CodeEditorTabComponent>> {
        return {
            type: CodeEditorTabComponent,
        }
    }
}
