import { Injector } from '@angular/core';
import { BaseTabProcess, GetRecoveryTokenOptions } from 'tlink-core';
import { BaseTerminalTabComponent } from 'tlink-terminal';
import { LocalProfile, SessionOptions, UACService } from '../api';
import { Session } from '../session';
/** @hidden */
export declare class TerminalTabComponent extends BaseTerminalTabComponent<LocalProfile> {
    private uac;
    sessionOptions: SessionOptions;
    session: Session | null;
    constructor(injector: Injector, uac: UACService | undefined);
    ngOnInit(): void;
    protected onFrontendReady(): void;
    initializeSession(columns: number, rows: number): void;
    getRecoveryToken(options?: GetRecoveryTokenOptions): Promise<any>;
    getCurrentProcess(): Promise<BaseTabProcess | null>;
    canClose(): Promise<boolean>;
    ngOnDestroy(): void;
    /**
     * Return true if the user explicitly exit the session.
     * Always return true for terminalTab as the session can only be ended by the user
     */
    protected isSessionExplicitlyTerminated(): boolean;
}
