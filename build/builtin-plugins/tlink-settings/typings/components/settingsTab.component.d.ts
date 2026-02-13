import { Injector } from '@angular/core';
import { ConfigService, HostAppService, Platform, HomeBaseService, UpdaterService, PlatformService, HostWindowService, AppService, LocaleService, TranslateService } from 'tlink-core';
import { SettingsTabProvider } from '../api';
declare const BaseTabComponent: any;
/** @hidden */
export declare class SettingsTabComponent extends BaseTabComponent {
    config: ConfigService;
    hostApp: HostAppService;
    hostWindow: HostWindowService;
    homeBase: HomeBaseService;
    platform: PlatformService;
    locale: LocaleService;
    updater: UpdaterService;
    private app;
    settingsProviders: SettingsTabProvider[];
    activeTab: string;
    Platform: typeof Platform;
    configDefaults: any;
    configFile: string;
    isShellIntegrationInstalled: boolean;
    checkingForUpdate: boolean;
    updateAvailable: boolean;
    showConfigDefaults: boolean;
    allLanguages: {
        code: string;
        name: string;
    }[];
    padWindowControls: boolean;
    constructor(config: ConfigService, hostApp: HostAppService, hostWindow: HostWindowService, homeBase: HomeBaseService, platform: PlatformService, locale: LocaleService, updater: UpdaterService, app: AppService, settingsProviders: SettingsTabProvider[], translate: TranslateService, injector: Injector);
    ngOnInit(): Promise<void>;
    toggleShellIntegration(): Promise<void>;
    ngOnDestroy(): void;
    restartApp(): void;
    saveConfiguration(requireRestart?: boolean): void;
    saveConfigFile(): void;
    showConfigFile(): void;
    isConfigFileValid(): boolean;
    checkForUpdates(): Promise<void>;
    showReleaseNotes(): void;
}
export {};
