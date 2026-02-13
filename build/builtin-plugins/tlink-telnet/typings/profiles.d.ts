import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider } from 'tlink-core';
import { TelnetProfileSettingsComponent } from './components/telnetProfileSettings.component';
import { TelnetTabComponent } from './components/telnetTab.component';
import { TelnetProfile } from './session';
export declare class TelnetProfilesService extends QuickConnectProfileProvider<TelnetProfile> {
    private translate;
    id: string;
    name: string;
    supportsQuickConnect: boolean;
    settingsComponent: typeof TelnetProfileSettingsComponent;
    configDefaults: {
        options: {
            host: null;
            port: number;
            inputMode: string;
            outputMode: null;
            inputNewlines: null;
            outputNewlines: string;
            scripts: never[];
            input: {
                backspace: string;
            };
        };
        clearServiceMessagesOnConnect: boolean;
    };
    constructor(translate: TranslateService);
    getBuiltinProfiles(): Promise<PartialProfile<TelnetProfile>[]>;
    getNewTabParameters(profile: TelnetProfile): Promise<NewTabParameters<TelnetTabComponent>>;
    getSuggestedName(profile: TelnetProfile): string | null;
    getDescription(profile: TelnetProfile): string;
    quickConnect(query: string): PartialProfile<TelnetProfile>;
    intoQuickConnectString(profile: TelnetProfile): string | null;
}
