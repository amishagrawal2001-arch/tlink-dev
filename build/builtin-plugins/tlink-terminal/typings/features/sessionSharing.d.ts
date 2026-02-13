import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component';
import { TerminalDecorator } from '../api/decorator';
import { LogService } from 'tlink-core';
import { SessionSharingService } from 'tlink-core';
/**
 * Decorator that enables real-time terminal session sharing
 */
export declare class SessionSharingDecorator extends TerminalDecorator {
    private sessionSharing;
    private logger;
    private sharedTerminals;
    constructor(log: LogService, sessionSharing: SessionSharingService);
    attach(terminal: BaseTerminalTabComponent<any>): void;
    detach(terminal: BaseTerminalTabComponent<any>): void;
    private attachToSharedSession;
    private detachFromSharedSession;
}
