import { TranslateService } from '@ngx-translate/core';
import { HostAppService } from './api/hostApp';
import { AppService } from './services/app.service';
import { ProfilesService } from './services/profiles.service';
import { ConfigService } from './services/config.service';
import { CommandProvider, Command } from './api/commands';
/** @hidden */
export declare class CoreCommandProvider extends CommandProvider {
    private hostApp;
    private app;
    private profilesService;
    private translate;
    private config;
    constructor(hostApp: HostAppService, app: AppService, profilesService: ProfilesService, translate: TranslateService, config: ConfigService);
    activate(): Promise<void>;
    provide(): Promise<Command[]>;
    private cycleColorSchemeMode;
}
