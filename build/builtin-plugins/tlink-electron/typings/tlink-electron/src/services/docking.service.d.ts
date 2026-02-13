import { NgZone } from '@angular/core';
import { ConfigService, DockingService, Screen, PlatformService, BootstrapData } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
import { ElectronHostWindow } from './hostWindow.service';
export declare class ElectronDockingService extends DockingService {
    private electron;
    private config;
    private zone;
    private hostWindow;
    private bootstrapData;
    constructor(electron: ElectronService, config: ConfigService, zone: NgZone, hostWindow: ElectronHostWindow, platform: PlatformService, bootstrapData: BootstrapData);
    dock(): void;
    getScreens(): Screen[];
    private getCurrentScreen;
    private repositionWindow;
}
