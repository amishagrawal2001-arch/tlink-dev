import { ProfileProvider, NewTabParameters, ConfigService, AppService, PartialProfile } from 'tlink-core';
import { TerminalTabComponent } from './components/terminalTab.component';
import { LocalProfileSettingsComponent } from './components/localProfileSettings.component';
import { ShellProvider, Shell, SessionOptions, LocalProfile } from './api';
export declare class LocalProfilesService extends ProfileProvider<LocalProfile> {
    private app;
    private config;
    private shellProviders;
    id: string;
    name: "Local terminal";
    settingsComponent: typeof LocalProfileSettingsComponent;
    configDefaults: {
        options: {
            restoreFromPTYID: null;
            command: string;
            args: never[];
            cwd: null;
            env: {
                __nonStructural: boolean;
            };
            width: null;
            height: null;
            pauseAfterExit: boolean;
            runAsAdministrator: boolean;
        };
    };
    constructor(app: AppService, config: ConfigService, shellProviders: ShellProvider[]);
    getBuiltinProfiles(): Promise<PartialProfile<LocalProfile>[]>;
    getNewTabParameters(profile: LocalProfile): Promise<NewTabParameters<TerminalTabComponent>>;
    getShells(): Promise<Shell[]>;
    optionsFromShell(shell: Shell): SessionOptions;
    getSuggestedName(profile: LocalProfile): string;
    getDescription(profile: PartialProfile<LocalProfile>): string;
}
