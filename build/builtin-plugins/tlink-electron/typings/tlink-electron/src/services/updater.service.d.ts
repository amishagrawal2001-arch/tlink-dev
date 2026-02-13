import { LogService, ConfigService, UpdaterService, PlatformService, TranslateService } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
export declare class ElectronUpdaterService extends UpdaterService {
    private translate;
    private platform;
    private electron;
    private logger;
    private downloaded;
    private electronUpdaterAvailable;
    private updateURL;
    constructor(log: LogService, config: ConfigService, translate: TranslateService, platform: PlatformService, electron: ElectronService);
    check(): Promise<boolean>;
    update(): Promise<void>;
}
