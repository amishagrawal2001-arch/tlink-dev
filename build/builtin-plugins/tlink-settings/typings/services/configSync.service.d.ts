import { ConfigService, HostAppService, LogService, PlatformService } from 'tlink-core';
export interface User {
    id: number;
}
export interface Config {
    id: number;
    name: string;
    content: string;
    last_used_with_version: string | null;
    created_at: Date;
    modified_at: Date;
}
export declare class ConfigSyncService {
    private platform;
    private hostApp;
    private config;
    private logger;
    private lastRemoteChange;
    constructor(log: LogService, platform: PlatformService, hostApp: HostAppService, config: ConfigService);
    isAvailable(): boolean;
    isEnabled(): boolean;
    getConfigs(): Promise<Config[]>;
    getConfig(id: number): Promise<Config>;
    updateConfig(id: number, data: Partial<Config>): Promise<Config>;
    getUser(): Promise<any>;
    createNewConfig(name: string): Promise<Config>;
    deleteConfig(id: number): Promise<any>;
    setConfig(config: Config): void;
    upload(): Promise<void>;
    download(): Promise<void>;
    delete(config: Config): Promise<void>;
    private readConfigDataForSync;
    private writeConfigDataFromSync;
    private request;
    private autoSync;
}
