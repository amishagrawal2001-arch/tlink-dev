import { HotkeyDescription, TranslateService } from 'tlink-core';
declare const HotkeyProvider: any;
/** @hidden */
export declare class TerminalHotkeyProvider extends HotkeyProvider {
    private translate;
    hotkeys: HotkeyDescription[];
    constructor(translate: TranslateService);
    provide(): Promise<HotkeyDescription[]>;
}
export {};
