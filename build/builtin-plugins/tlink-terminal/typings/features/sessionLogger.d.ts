import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component';
import { TerminalDecorator } from '../api/decorator';
import { HostAppService, LogService, NotificationsService, PlatformService, TranslateService } from 'tlink-core';
export declare class SessionLoggerDecorator extends TerminalDecorator {
    private hostApp;
    private platform;
    private notifications;
    private translate;
    private logger;
    private states;
    constructor(log: LogService, hostApp: HostAppService, platform: PlatformService, notifications: NotificationsService, translate: TranslateService);
    attach(terminal: BaseTerminalTabComponent<any>): void;
    detach(terminal: BaseTerminalTabComponent<any>): void;
    private openLogFile;
    private enqueueWrite;
    private stopLogging;
    private handleOutput;
    private formatLogData;
    private getSettingsKey;
    private resolveLogPath;
    private resolveDirectory;
    private resolveFilename;
    private sanitizeFilename;
    private sanitizePathSegment;
    private expandPathVars;
    private getBaseDirectory;
    private pad2;
}
