import { CommandProvider as CoreCommandProvider, ConfigService, HostAppService } from 'tlink-core';
import type { Command } from 'tlink-core';
declare const CommandProviderRuntime: typeof CoreCommandProvider;
export declare class ButtonBarCommandProvider extends CommandProviderRuntime {
    private config;
    constructor(config: ConfigService, hostApp: HostAppService);
    provide(): Promise<Command[]>;
    private toggleButtonBar;
}
export {};
