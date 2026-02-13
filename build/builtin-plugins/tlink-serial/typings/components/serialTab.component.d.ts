import { Injector } from '@angular/core';
import { Platform, SelectorService } from 'tlink-core';
import { ConnectableTerminalTabComponent } from 'tlink-terminal';
import { SerialSession, SerialProfile } from '../api';
/** @hidden */
export declare class SerialTabComponent extends ConnectableTerminalTabComponent<SerialProfile> {
    private selector;
    session: SerialSession | null;
    Platform: typeof Platform;
    constructor(injector: Injector, selector: SelectorService);
    ngOnInit(): void;
    initializeSession(): Promise<void>;
    protected attachSessionHandlers(): void;
    protected onSessionDestroyed(): void;
    changeBaudRate(): Promise<void>;
    protected isSessionExplicitlyTerminated(): boolean;
}
