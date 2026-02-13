import { NgZone } from '@angular/core';
import { ConfigService, Hotkey, HotkeyDescription, HotkeysService, HostAppService } from 'tlink-core';
/** @hidden */
export declare class HotkeySettingsTabComponent {
    config: ConfigService;
    hostApp: HostAppService;
    zone: NgZone;
    hotkeyFilter: string;
    hotkeyDescriptions: HotkeyDescription[];
    allDuplicateHotkeys: string[];
    constructor(config: ConfigService, hostApp: HostAppService, zone: NgZone, hotkeys: HotkeysService);
    getHotkeys(id: string): Hotkey[];
    setHotkeys(id: string, hotkeys: Hotkey[]): void;
    hotkeyFilterFn(hotkey: HotkeyDescription, query: string): boolean;
    private getAllDuplicateHotkeys;
    private detectDuplicates;
    private toHotkeyIdentifier;
}
