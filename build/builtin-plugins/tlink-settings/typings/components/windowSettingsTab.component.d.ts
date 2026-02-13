import { NgZone } from '@angular/core';
import { DockingService, ConfigService, Theme, HostAppService, Platform, Screen, PlatformService } from 'tlink-core';
declare const BaseComponent: any;
/** @hidden */
export declare class WindowSettingsTabComponent extends BaseComponent {
    config: ConfigService;
    hostApp: HostAppService;
    platform: PlatformService;
    zone: NgZone;
    themes: Theme[];
    docking?: DockingService | undefined;
    screens: Screen[];
    Platform: typeof Platform;
    isFluentVibrancySupported: boolean;
    true: any;
    constructor(config: ConfigService, hostApp: HostAppService, platform: PlatformService, zone: NgZone, themes: Theme[], docking?: DockingService | undefined);
    saveConfiguration(requireRestart?: boolean): void;
}
export {};
