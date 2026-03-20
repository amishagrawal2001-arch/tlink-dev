import { VaultService } from 'tlink-core';
import { RDPProfile } from '../api';
export declare const VAULT_SECRET_TYPE_RDP_PASSWORD = "rdp:password";
export declare class RDPPasswordStorageService {
    private vault;
    constructor(vault: VaultService);
    savePassword(profile: RDPProfile, password: string): Promise<void>;
    deletePassword(profile: RDPProfile): Promise<void>;
    loadPassword(profile: RDPProfile): Promise<string | null>;
    private getKeytarKey;
    private getVaultKey;
}
