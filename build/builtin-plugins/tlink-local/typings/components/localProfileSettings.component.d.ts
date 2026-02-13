import { LocalProfile, UACService } from '../api';
import { PlatformService, ProfileSettingsComponent } from 'tlink-core';
/** @hidden */
export declare class LocalProfileSettingsComponent implements ProfileSettingsComponent<LocalProfile> {
    uac: UACService | undefined;
    private platform;
    profile: LocalProfile;
    constructor(uac: UACService | undefined, platform: PlatformService);
    ngOnInit(): void;
    pickWorkingDirectory(): Promise<void>;
}
