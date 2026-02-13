import { HostAppService, TranslateService } from 'tlink-core';
import { ShellProvider, Shell } from 'tlink-local';
/** @hidden */
export declare class MacOSDefaultShellProvider extends ShellProvider {
    private hostApp;
    private translate;
    private cachedShell?;
    constructor(hostApp: HostAppService, translate: TranslateService);
    provide(): Promise<Shell[]>;
    private getDefaultShellCached;
    private getDefaultShell;
}
