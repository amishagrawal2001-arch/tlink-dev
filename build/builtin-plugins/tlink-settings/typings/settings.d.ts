import { SettingsTabProvider } from './api';
import { TranslateService } from 'tlink-core';
/** @hidden */
export declare class HotkeySettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class WindowSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class VaultSettingsTabProvider extends SettingsTabProvider {
    id: string;
    icon: string;
    title: string;
    getComponentType(): any;
}
/** @hidden */
export declare class ProfilesSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    prioritized: boolean;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class WorkspaceSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class ConfigSyncSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class BackupSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    weight: number;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
