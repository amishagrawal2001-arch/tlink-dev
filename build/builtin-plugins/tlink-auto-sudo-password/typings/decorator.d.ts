/// <reference types="node" />
import { TerminalDecorator, BaseTerminalTabComponent, SessionMiddleware } from 'tlink-terminal';
import { SSHProfile, PasswordStorageService } from 'tlink-ssh';
export declare class AutoSudoPasswordMiddleware extends SessionMiddleware {
    private profile;
    private ps;
    private pendingPasswordToPaste;
    private pasteHint;
    private pasteHintLength;
    constructor(profile: SSHProfile, ps: PasswordStorageService);
    feedFromSession(data: Buffer): void;
    feedFromTerminal(data: Buffer): void;
    handlePrompt(username: string): Promise<void>;
    loadPassword(username: string): Promise<string | null>;
}
export declare class AutoSudoPasswordDecorator extends TerminalDecorator {
    private ps;
    constructor(ps: PasswordStorageService);
    private attachToSession;
    attach(tab: BaseTerminalTabComponent<any>): void;
}
