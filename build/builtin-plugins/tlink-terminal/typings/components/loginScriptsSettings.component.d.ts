import { PlatformService, TranslateService } from 'tlink-core';
import { LoginScript, LoginScriptsOptions } from '../middleware/loginScriptProcessing';
/** @hidden */
export declare class LoginScriptsSettingsComponent {
    private platform;
    private translate;
    options: LoginScriptsOptions;
    scripts: LoginScript[];
    constructor(platform: PlatformService, translate: TranslateService);
    ngOnInit(): void;
    deleteScript(script: LoginScript): Promise<void>;
    addScript(): void;
    save(): void;
}
