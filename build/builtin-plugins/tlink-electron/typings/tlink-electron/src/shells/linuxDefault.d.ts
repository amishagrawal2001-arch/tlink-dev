import { HostAppService, LogService, TranslateService } from 'tlink-core';
import { ShellProvider, Shell } from 'tlink-local';
/** @hidden */
export declare class LinuxDefaultShellProvider extends ShellProvider {
    private hostApp;
    private translate;
    private logger;
    constructor(hostApp: HostAppService, translate: TranslateService, log: LogService);
    provide(): Promise<Shell[]>;
}
