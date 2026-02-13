import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { VaultService, VaultSecret, Vault, PlatformService, ConfigService, VaultFileSecret, TranslateService } from 'tlink-core';
declare const BaseComponent: any;
/** @hidden */
export declare class VaultSettingsTabComponent extends BaseComponent {
    vault: VaultService;
    config: ConfigService;
    private platform;
    private ngbModal;
    private translate;
    vaultContents: Vault | null;
    VAULT_SECRET_TYPE_FILE: string;
    true: any;
    constructor(vault: VaultService, config: ConfigService, platform: PlatformService, ngbModal: NgbModal, translate: TranslateService);
    loadVault(): Promise<void>;
    enableVault(): Promise<void>;
    disableVault(): Promise<void>;
    changePassphrase(): Promise<void>;
    toggleConfigEncrypted(): Promise<void>;
    getSecretLabel(secret: VaultSecret): any;
    showSecret(secret: VaultSecret): void;
    removeSecret(secret: VaultSecret): void;
    replaceFileContent(secret: VaultFileSecret): Promise<void>;
    renameFile(secret: VaultFileSecret): Promise<void>;
    exportFile(secret: VaultFileSecret): Promise<void>;
    castAny: (x: any) => any;
}
export {};
