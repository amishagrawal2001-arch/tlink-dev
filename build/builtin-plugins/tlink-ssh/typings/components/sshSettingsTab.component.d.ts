import { Injector } from '@angular/core';
import { ConfigService, HostAppService, NotificationsService, Platform } from 'tlink-core';
/** @hidden */
export declare class SSHSettingsTabComponent {
    config: ConfigService;
    hostApp: HostAppService;
    private injector;
    private notifications;
    Platform: typeof Platform;
    defaultX11Display: string;
    reimporting: boolean;
    lastImportInfo: {
        count: number;
        time: string;
    } | null;
    true: any;
    private importers;
    constructor(config: ConfigService, hostApp: HostAppService, injector: Injector, notifications: NotificationsService);
    reimportSSHConfig(): Promise<void>;
}
