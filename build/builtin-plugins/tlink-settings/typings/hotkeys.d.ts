import { HotkeyDescription, TranslateService } from 'tlink-core';
import { SettingsTabProvider } from './api';
declare const HotkeyProvider: any;
/** @hidden */
export declare class SettingsHotkeyProvider extends HotkeyProvider {
    private translate;
    private settingsProviders;
    hotkeys: HotkeyDescription[];
    constructor(translate: TranslateService, settingsProviders: SettingsTabProvider[]);
    provide(): Promise<HotkeyDescription[]>;
}
export {};
