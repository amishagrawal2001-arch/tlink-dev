import { Command, CommandProvider, ConfigService } from 'tlink-core';
import { IntelliJBridgeService } from './bridge.service';
export declare class IntelliJBridgeCommandProvider extends CommandProvider {
    private config;
    private bridge;
    constructor(config: ConfigService, bridge: IntelliJBridgeService);
    provide(): Promise<Command[]>;
}
