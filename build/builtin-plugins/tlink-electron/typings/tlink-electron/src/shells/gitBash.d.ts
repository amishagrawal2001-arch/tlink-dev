import { ConfigService, HostAppService } from 'tlink-core';
import { Shell } from 'tlink-local';
import { WindowsBaseShellProvider } from './windowsBase';
/** @hidden */
export declare class GitBashShellProvider extends WindowsBaseShellProvider {
    constructor(hostApp: HostAppService, config: ConfigService);
    provide(): Promise<Shell[]>;
}
