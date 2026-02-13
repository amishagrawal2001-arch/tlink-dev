import { HostAppService } from 'tlink-core';
import { ShellProvider, Shell } from 'tlink-local';
/** @hidden */
export declare class VSDevToolsProvider extends ShellProvider {
    private hostApp;
    constructor(hostApp: HostAppService);
    provide(): Promise<Shell[]>;
}
