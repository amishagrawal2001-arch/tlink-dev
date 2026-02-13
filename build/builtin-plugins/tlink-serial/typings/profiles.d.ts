import { NewTabParameters, SelectorService, HostAppService, TranslateService, ConnectableProfileProvider } from 'tlink-core';
import { SerialProfileSettingsComponent } from './components/serialProfileSettings.component';
import { SerialTabComponent } from './components/serialTab.component';
import { SerialService } from './services/serial.service';
import { SerialProfile } from './api';
export declare class SerialProfilesService extends ConnectableProfileProvider<SerialProfile> {
    private selector;
    private serial;
    private hostApp;
    private translate;
    id: string;
    name: "Serial";
    settingsComponent: typeof SerialProfileSettingsComponent;
    configDefaults: {
        options: {
            port: null;
            baudrate: null;
            databits: number;
            stopbits: number;
            parity: string;
            rtscts: boolean;
            xon: boolean;
            xoff: boolean;
            xany: boolean;
            inputMode: null;
            outputMode: null;
            inputNewlines: null;
            outputNewlines: null;
            scripts: never[];
            slowSend: boolean;
            input: {
                backspace: string;
            };
        };
        clearServiceMessagesOnConnect: boolean;
    };
    constructor(selector: SelectorService, serial: SerialService, hostApp: HostAppService, translate: TranslateService);
    getBuiltinProfiles(): Promise<SerialProfile[]>;
    getNewTabParameters(profile: SerialProfile): Promise<NewTabParameters<SerialTabComponent>>;
    getSuggestedName(profile: SerialProfile): string;
    getDescription(profile: SerialProfile): string;
}
