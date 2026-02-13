import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tlink-core';
/** @hidden */
export declare class RDPHotkeyProvider extends HotkeyProvider {
    private translate;
    hotkeys: HotkeyDescription[];
    constructor(translate: TranslateService);
    provide(): Promise<HotkeyDescription[]>;
}
