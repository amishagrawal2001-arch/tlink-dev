import { DockingService, ThemesService, AppService, ConfigService } from 'tlink-core';
import { TouchbarService } from './services/touchbar.service';
import { ElectronHostWindow } from './services/hostWindow.service';
import { ElectronHostAppService } from './services/hostApp.service';
import { ElectronService } from './services/electron.service';
import { DockMenuService } from './services/dockMenu.service';
export default class ElectronModule {
    private config;
    private hostApp;
    private electron;
    private hostWindow;
    constructor(config: ConfigService, hostApp: ElectronHostAppService, electron: ElectronService, hostWindow: ElectronHostWindow, touchbar: TouchbarService, docking: DockingService, themeService: ThemesService, app: AppService, dockMenu: DockMenuService);
    private registerGlobalHotkey;
    private updateVibrancy;
    private updateDarkMode;
    private updateWindowControlsColor;
}
export { ElectronHostWindow, ElectronHostAppService, ElectronService };
