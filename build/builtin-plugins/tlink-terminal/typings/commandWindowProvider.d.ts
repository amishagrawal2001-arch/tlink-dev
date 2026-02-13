import { AppService, BottomPanelService, CommandProvider as CoreCommandProvider, ConfigService, HostAppService } from 'tlink-core';
import type { Command } from 'tlink-core';
declare const CommandProviderRuntime: typeof CoreCommandProvider;
export declare class CommandWindowCommandProvider extends CommandProviderRuntime {
    private app;
    private bottomPanel;
    private config;
    private commandWindowTab;
    private bottomVisible;
    constructor(app: AppService, bottomPanel: BottomPanelService, config: ConfigService, hostApp: HostAppService);
    provide(): Promise<Command[]>;
    private openCommandWindow;
    private openCommandWindowBottom;
    private getCommandWindowTab;
    private findCommandWindowTab;
    private isCommandWindowTab;
    private trackCommandWindowTab;
    private isTabDestroyed;
}
export {};
