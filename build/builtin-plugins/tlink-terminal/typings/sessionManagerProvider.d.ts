import { AppService, CommandProvider, HostAppService, SidePanelService } from 'tlink-core';
import type { Command } from 'tlink-core';
export declare class SessionManagerCommandProvider extends CommandProvider {
    private app;
    private sidePanel;
    private cleanupInProgress;
    constructor(app: AppService, sidePanel: SidePanelService, hostApp: HostAppService);
    provide(): Promise<Command[]>;
    private cleanupLegacyTabs;
    private unwrapSplitIfSingle;
    private findLegacySessionManagerTabs;
}
