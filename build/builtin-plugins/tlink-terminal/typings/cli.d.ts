import { CLIHandler as CoreCLIHandler, CLIEvent, AppService, HostWindowService } from 'tlink-core';
declare const CLIHandlerRuntime: typeof CoreCLIHandler;
export declare class TerminalCLIHandler extends CLIHandlerRuntime {
    private app;
    private hostWindow;
    firstMatchOnly: boolean;
    priority: number;
    constructor(app: AppService, hostWindow: HostWindowService);
    handle(event: CLIEvent): Promise<boolean>;
    private handlePaste;
}
export {};
