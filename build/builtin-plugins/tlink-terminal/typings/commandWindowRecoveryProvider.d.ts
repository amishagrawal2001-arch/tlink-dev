import { NewTabParameters, RecoveryToken, TabRecoveryProvider as CoreTabRecoveryProvider } from 'tlink-core';
import { CommandWindowTabComponent } from './components/commandWindowTab.component';
declare const TabRecoveryProviderRuntime: typeof CoreTabRecoveryProvider;
/** @hidden */
export declare class CommandWindowRecoveryProvider extends TabRecoveryProviderRuntime<CommandWindowTabComponent> {
    applicableTo(recoveryToken: RecoveryToken): Promise<boolean>;
    recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<CommandWindowTabComponent>>;
}
export {};
