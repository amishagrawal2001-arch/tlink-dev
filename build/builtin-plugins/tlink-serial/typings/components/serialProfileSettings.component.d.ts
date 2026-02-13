import { HostAppService, Platform, ProfileSettingsComponent } from 'tlink-core';
import { SerialPortInfo, SerialProfile } from '../api';
import { SerialService } from '../services/serial.service';
/** @hidden */
export declare class SerialProfileSettingsComponent implements ProfileSettingsComponent<SerialProfile> {
    private serial;
    hostApp: HostAppService;
    profile: SerialProfile;
    foundPorts: SerialPortInfo[];
    Platform: typeof Platform;
    constructor(serial: SerialService, hostApp: HostAppService);
    portsAutocomplete: (text$: any) => any;
    baudratesAutocomplete: (text$: any) => any;
    portsFormatter: (port: any) => any;
    ngOnInit(): Promise<void>;
}
