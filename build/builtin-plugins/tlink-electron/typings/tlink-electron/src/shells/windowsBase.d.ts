import { ConfigService, HostAppService } from 'tlink-core';
import { ShellProvider } from 'tlink-local';
export declare abstract class WindowsBaseShellProvider extends ShellProvider {
    protected hostApp: HostAppService;
    protected config: ConfigService;
    constructor(hostApp: HostAppService, config: ConfigService);
    protected getEnvironment(): any;
}
