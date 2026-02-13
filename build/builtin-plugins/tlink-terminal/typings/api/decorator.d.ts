import { Subscription } from 'rxjs';
import { BaseTerminalTabComponent } from './baseTerminalTab.component';
/**
 * Extend to automatically run actions on new terminals
 */
export declare abstract class TerminalDecorator {
    private smartSubscriptions;
    /**
     * Called when a new terminal tab starts
     */
    attach(terminal: BaseTerminalTabComponent<any>): void;
    /**
     * Called before a terminal tab is destroyed.
     * Make sure to call super()
     */
    detach(terminal: BaseTerminalTabComponent<any>): void;
    /**
     * Automatically cancel @subscription once detached from @terminal
     */
    protected subscribeUntilDetached(terminal: BaseTerminalTabComponent<any>, subscription?: Subscription): void;
}
