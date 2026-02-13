import { Injector } from '@angular/core';
import { Platform } from 'tlink-core';
import { ConnectableTerminalTabComponent } from 'tlink-terminal';
import { TelnetProfile, TelnetSession } from '../session';
/** @hidden */
export declare class TelnetTabComponent extends ConnectableTerminalTabComponent<TelnetProfile> {
    Platform: typeof Platform;
    session: TelnetSession | null;
    constructor(injector: Injector);
    ngOnInit(): void;
    protected onSessionDestroyed(): void;
    initializeSession(): Promise<void>;
    canClose(): Promise<boolean>;
    protected isSessionExplicitlyTerminated(): boolean;
}
