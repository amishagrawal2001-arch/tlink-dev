import { HostAppService } from 'tlink-core';
import { ShellProvider, Shell } from 'tlink-local';
/** @hidden */
export declare class POSIXShellsProvider extends ShellProvider {
    private hostApp;
    constructor(hostApp: HostAppService);
    provide(): Promise<Shell[]>;
}
