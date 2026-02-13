import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core';
import { RDPTabComponent } from './components/rdpTab.component';
/** @hidden */
export declare class RecoveryProvider extends TabRecoveryProvider<RDPTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<RDPTabComponent>>;
}
