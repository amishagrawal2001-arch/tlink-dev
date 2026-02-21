import { NgZone, Injector } from '@angular/core';
import { HostAppService, Platform } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
export declare class ElectronHostAppService extends HostAppService {
    private zone;
    private electron;
    get platform(): Platform;
    get configPlatform(): Platform;
    constructor(zone: NgZone, electron: ElectronService, injector: Injector);
    newWindow(): void;
    openCodeEditorWindow(): boolean;
    saveConfig(data: string): Promise<void>;
    emitReady(): void;
    relaunch(): void;
    quit(): void;
    private dispatchCLIEvent;
}
