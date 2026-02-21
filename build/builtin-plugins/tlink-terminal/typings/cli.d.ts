import { CLIHandler as CoreCLIHandler, CLIEvent, AppService, HostWindowService, SessionSharingService } from 'tlink-core';
declare const CLIHandlerRuntime: typeof CoreCLIHandler;
export declare class TerminalCLIHandler extends CLIHandlerRuntime {
    private app;
    private hostWindow;
    private sessionSharing;
    firstMatchOnly: boolean;
    priority: number;
    private readonly shareOpenDedupeWindowMs;
    private recentlyOpenedShares;
    constructor(app: AppService, hostWindow: HostWindowService, sessionSharing: SessionSharingService);
    handle(event: CLIEvent): Promise<boolean>;
    private handlePaste;
    private extractShareUrl;
    private handleJoinSharedSession;
    private handleJoinSharedSessionBundle;
    private openSharedSessionTab;
    private findOpenSharedSessionTab;
    private getAllTabs;
    private getShareDedupeKey;
    private wasShareRecentlyOpened;
    private markShareOpened;
    private pruneRecentlyOpenedShares;
}
export {};
