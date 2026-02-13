import { ConfigService, BaseTabComponent, TabContextMenuItemProvider, MenuItemOptions, ProfilesService, TranslateService, SelectorService } from 'tlink-core';
import { TerminalService } from './services/terminal.service';
import { UACService } from './api';
/** @hidden */
export declare class NewTabContextMenu extends TabContextMenuItemProvider {
    config: ConfigService;
    private profilesService;
    private terminalService;
    private selector;
    private uac;
    private translate;
    weight: number;
    constructor(config: ConfigService, profilesService: ProfilesService, terminalService: TerminalService, selector: SelectorService, uac: UACService | undefined, translate: TranslateService);
    getItems(tab: BaseTabComponent, tabHeader?: boolean): Promise<MenuItemOptions[]>;
    private openProfileSelector;
}
