import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core';
import { TerminalTabComponent } from './components/terminalTab.component';
/** @hidden */
export declare class RecoveryProvider extends TabRecoveryProvider<TerminalTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<TerminalTabComponent>>;
}
