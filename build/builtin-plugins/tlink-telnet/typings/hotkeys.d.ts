import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tlink-core';
/** @hidden */
export declare class TelnetHotkeyProvider extends HotkeyProvider {
    private translate;
    hotkeys: HotkeyDescription[];
    constructor(translate: TranslateService);
    provide(): Promise<HotkeyDescription[]>;
}
