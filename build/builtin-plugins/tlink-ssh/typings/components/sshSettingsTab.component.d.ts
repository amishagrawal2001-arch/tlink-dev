import { ConfigService, HostAppService, Platform } from 'tlink-core';
/** @hidden */
export declare class SSHSettingsTabComponent {
    config: ConfigService;
    hostApp: HostAppService;
    Platform: typeof Platform;
    defaultX11Display: string;
    true: any;
    constructor(config: ConfigService, hostApp: HostAppService);
}
