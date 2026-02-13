import { HostAppService, ConfigService } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
import { Shell } from 'tlink-local';
import { WindowsBaseShellProvider } from './windowsBase';
/** @hidden */
export declare class WindowsStockShellsProvider extends WindowsBaseShellProvider {
    private electron;
    constructor(hostApp: HostAppService, config: ConfigService, electron: ElectronService);
    provide(): Promise<Shell[]>;
    private getPowerShellPath;
}
