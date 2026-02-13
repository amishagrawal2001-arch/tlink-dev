import { HostAppService, TranslateService } from 'tlink-core';
import { ShellProvider, Shell } from 'tlink-local';
import { WSLShellProvider } from './wsl';
import { PowerShellCoreShellProvider } from './powershellCore';
import { WindowsStockShellsProvider } from './windowsStock';
/** @hidden */
export declare class WindowsDefaultShellProvider extends ShellProvider {
    private hostApp;
    private translate;
    private providers;
    constructor(psc: PowerShellCoreShellProvider, wsl: WSLShellProvider, stock: WindowsStockShellsProvider, hostApp: HostAppService, translate: TranslateService);
    provide(): Promise<Shell[]>;
}
