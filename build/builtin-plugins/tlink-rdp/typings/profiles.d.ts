import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider } from 'tlink-core';
import { RDPProfileSettingsComponent } from './components/rdpProfileSettings.component';
import { RDPTabComponent } from './components/rdpTab.component';
import { RDPProfile } from './api';
export declare class RDPProfilesService extends QuickConnectProfileProvider<RDPProfile> {
    private translate;
    id: string;
    name: string;
    supportsQuickConnect: boolean;
    settingsComponent: typeof RDPProfileSettingsComponent;
    configDefaults: {
        behaviorOnSessionEnd: string;
        clearServiceMessagesOnConnect: boolean;
        options: {
            host: null;
            port: number;
            user: string;
            password: null;
            domain: string;
            clientType: string;
            width: number;
            height: number;
            colorDepth: number;
            enableAudio: boolean;
            enableClipboard: boolean;
            enablePrinting: boolean;
            enableDrives: boolean;
            enableWallpaper: boolean;
            enableThemes: boolean;
            enableFontSmoothing: boolean;
            enableDesktopComposition: boolean;
            enableNLA: boolean;
            enableTLS: boolean;
            ignoreCertificate: boolean;
            compression: boolean;
            bitmapCaching: boolean;
            customParams: string;
        };
    };
    constructor(translate: TranslateService);
    getBuiltinProfiles(): Promise<PartialProfile<RDPProfile>[]>;
    getNewTabParameters(profile: RDPProfile): Promise<NewTabParameters<RDPTabComponent>>;
    getSuggestedName(profile: RDPProfile): string;
    getDescription(profile: PartialProfile<RDPProfile>): string;
    quickConnect(query: string): PartialProfile<RDPProfile>;
    intoQuickConnectString(profile: RDPProfile): string | null;
}
