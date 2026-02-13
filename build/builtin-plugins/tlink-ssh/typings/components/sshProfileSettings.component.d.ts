import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FileProvidersService, Platform, HostAppService, PartialProfile, ProfilesService } from 'tlink-core';
import { LoginScriptsSettingsComponent } from 'tlink-terminal';
import { PasswordStorageService } from '../services/passwordStorage.service';
import { ForwardedPortConfig, SSHProfile } from '../api';
/** @hidden */
export declare class SSHProfileSettingsComponent {
    hostApp: HostAppService;
    private profilesService;
    private passwordStorage;
    private ngbModal;
    private fileProviders;
    Platform: typeof Platform;
    profile: SSHProfile;
    hasSavedPassword: boolean;
    private originalUsername;
    connectionMode: 'direct' | 'proxyCommand' | 'jumpHost' | 'socksProxy' | 'httpProxy';
    supportedAlgorithms: {
        kex: string[];
        serverHostKey: string[];
        cipher: string[];
        hmac: string[];
        compression: string[];
    };
    algorithms: Record<string, Record<string, boolean>>;
    jumpHosts: PartialProfile<SSHProfile>[];
    loginScriptsSettings: LoginScriptsSettingsComponent | null;
    constructor(hostApp: HostAppService, profilesService: ProfilesService, passwordStorage: PasswordStorageService, ngbModal: NgbModal, fileProviders: FileProvidersService);
    ngOnInit(): Promise<void>;
    getJumpHostLabel(p: PartialProfile<SSHProfile>): string;
    setPassword(): Promise<void>;
    clearSavedPassword(): void;
    addPrivateKey(): Promise<void>;
    removePrivateKey(path: string): void;
    save(): void;
    private migrateSavedPasswordOnUsernameChange;
    onForwardAdded(fw: ForwardedPortConfig): void;
    onForwardRemoved(fw: ForwardedPortConfig): void;
    getConnectionDropdownTitle(): string;
}
