import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tlink-core';
import { TelnetTabComponent } from './components/telnetTab.component';
/** @hidden */
export declare class RecoveryProvider extends TabRecoveryProvider<TelnetTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<TelnetTabComponent>>;
}
