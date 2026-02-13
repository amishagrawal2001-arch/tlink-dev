import { NewTabParameters, RecoveryToken, TabRecoveryProvider } from './api';
import { CodeEditorTabComponent } from './components/codeEditorTab.component';
/** @hidden */
export declare class CodeEditorRecoveryProvider extends TabRecoveryProvider<CodeEditorTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(_recoveryToken: RecoveryToken): Promise<NewTabParameters<CodeEditorTabComponent>>;
}
