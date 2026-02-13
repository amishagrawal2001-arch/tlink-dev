import { CLIHandler, CLIEvent, AppService, ConfigService, HostWindowService, ProfilesService, NotificationsService } from 'tlink-core';
import { TerminalService } from './services/terminal.service';
export declare class TerminalCLIHandler extends CLIHandler {
    private hostWindow;
    private terminal;
    firstMatchOnly: boolean;
    priority: number;
    constructor(hostWindow: HostWindowService, terminal: TerminalService);
    handle(event: CLIEvent): Promise<boolean>;
    private handleOpenDirectory;
    private handleRunCommand;
}
export declare class OpenPathCLIHandler extends CLIHandler {
    private terminal;
    private profiles;
    private hostWindow;
    private notifications;
    firstMatchOnly: boolean;
    priority: number;
    constructor(terminal: TerminalService, profiles: ProfilesService, hostWindow: HostWindowService, notifications: NotificationsService);
    handle(event: CLIEvent): Promise<boolean>;
}
export declare class AutoOpenTabCLIHandler extends CLIHandler {
    private app;
    private config;
    private terminal;
    firstMatchOnly: boolean;
    priority: number;
    constructor(app: AppService, config: ConfigService, terminal: TerminalService);
    handle(event: CLIEvent): Promise<boolean>;
}
