import { Injector } from '@angular/core';
import { ConnectableTerminalProfile } from './interfaces';
import { BaseTerminalTabComponent } from './baseTerminalTab.component';
import { GetRecoveryTokenOptions, RecoveryToken } from 'tlink-core';
/**
 * A class to base your custom connectable terminal tabs on
 */
export declare abstract class ConnectableTerminalTabComponent<P extends ConnectableTerminalProfile> extends BaseTerminalTabComponent<P> {
    protected injector: Injector;
    protected reconnectOffered: boolean;
    protected isDisconnectedByHand: boolean;
    protected reconnecting: boolean;
    protected reconnectTimestamps: number[];
    constructor(injector: Injector);
    ngOnInit(): void;
    protected onFrontendReady(): void;
    /**
    * Initialize Connectable Session.
    * Set reconnectOffered to false
    */
    initializeSession(): Promise<void>;
    /**
    * Method called when session is destroyed. Handle the tab behavior on session end for connectable tab
    */
    protected onSessionDestroyed(): void;
    /**
    * Offering reconnection to the user if it hasn't been done yet.
    * Set reconnectOffered to true
    */
    offerReconnection(): void;
    /**
     * Return true if tab should be destroyed on session closed.
     */
    protected shouldTabBeDestroyedOnSessionClose(): boolean;
    getRecoveryToken(options?: GetRecoveryTokenOptions): Promise<RecoveryToken>;
    disconnect(): Promise<void>;
    reconnect(): Promise<void>;
    private clearServiceMessagesOnConnect;
}
