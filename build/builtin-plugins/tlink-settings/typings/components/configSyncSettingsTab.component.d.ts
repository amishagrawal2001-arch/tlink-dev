import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService, HostAppService, PlatformService, NotificationsService, TranslateService } from 'tlink-core';
import { Config, ConfigSyncService } from '../services/configSync.service';
declare const BaseComponent: any;
/** @hidden */
export declare class ConfigSyncSettingsTabComponent extends BaseComponent {
    config: ConfigService;
    platform: PlatformService;
    private configSync;
    private hostApp;
    private ngbModal;
    private notifications;
    private translate;
    connectionSuccessful: boolean | null;
    connectionError: Error | null;
    configs: Config[] | null;
    true: any;
    constructor(config: ConfigService, platform: PlatformService, configSync: ConfigSyncService, hostApp: HostAppService, ngbModal: NgbModal, notifications: NotificationsService, translate: TranslateService);
    ngOnInit(): Promise<void>;
    testConnection(): Promise<void>;
    loadConfigs(): Promise<void>;
    uploadAsNew(): Promise<void>;
    uploadAndSync(cfg: Config): Promise<void>;
    downloadAndSync(cfg: Config): Promise<void>;
    delete(cfg: Config): Promise<void>;
    hasMatchingRemoteConfig(): boolean;
    isActiveConfig(c: Config): boolean;
    openSyncHost(): void;
    openTlinkWebInfo(): void;
}
export {};
