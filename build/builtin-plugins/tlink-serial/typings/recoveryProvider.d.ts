import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core';
import { SerialTabComponent } from './components/serialTab.component';
/** @hidden */
export declare class RecoveryProvider extends TabRecoveryProvider<SerialTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<SerialTabComponent>>;
}
