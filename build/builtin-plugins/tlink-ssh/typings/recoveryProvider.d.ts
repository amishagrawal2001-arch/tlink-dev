import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core';
import { SSHTabComponent } from './components/sshTab.component';
/** @hidden */
export declare class RecoveryProvider extends TabRecoveryProvider<SSHTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<SSHTabComponent>>;
}
