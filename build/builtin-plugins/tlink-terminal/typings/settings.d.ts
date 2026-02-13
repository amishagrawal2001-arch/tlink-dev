import { SettingsTabProvider } from 'tlink-settings';
import { TranslateService } from 'tlink-core';
/** @hidden */
export declare class AppearanceSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    prioritized: boolean;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class ColorSchemeSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
/** @hidden */
export declare class TerminalSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: any;
    prioritized: boolean;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
