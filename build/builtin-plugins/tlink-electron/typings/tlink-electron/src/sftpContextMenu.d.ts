import { MenuItemOptions, TranslateService } from 'tlink-core';
import { SFTPFile, SFTPPanelComponent, SFTPContextMenuItemProvider } from 'tlink-ssh';
import { ElectronPlatformService } from './services/platform.service';
/** @hidden */
export declare class EditSFTPContextMenu extends SFTPContextMenuItemProvider {
    private translate;
    private platform;
    weight: number;
    constructor(translate: TranslateService, platform: ElectronPlatformService);
    getItems(item: SFTPFile, panel: SFTPPanelComponent): Promise<MenuItemOptions[]>;
    private edit;
}
