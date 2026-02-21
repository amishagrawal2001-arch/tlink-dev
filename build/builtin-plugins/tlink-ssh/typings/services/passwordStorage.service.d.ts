import { VaultService } from 'tlink-core';
import { SSHProfile } from '../api';
export declare const VAULT_SECRET_TYPE_PASSWORD = "ssh:password";
export declare const VAULT_SECRET_TYPE_PASSPHRASE = "ssh:key-passphrase";
type SavedPasswordRecord = {
    password: string;
    username?: string;
};
export declare class PasswordStorageService {
    private vault;
    constructor(vault: VaultService);
    savePassword(profile: SSHProfile, password: string, username?: string): Promise<void>;
    deletePassword(profile: SSHProfile, username?: string): Promise<void>;
    loadPassword(profile: SSHProfile, username?: string): Promise<string | null>;
    loadAnyPassword(profile: SSHProfile): Promise<SavedPasswordRecord | null>;
    savePrivateKeyPassword(id: string, password: string): Promise<void>;
    deletePrivateKeyPassword(id: string): Promise<void>;
    loadPrivateKeyPassword(id: string): Promise<string | null>;
    private getKeytarKeysForConnection;
    private getKeytarKeyForPrivateKey;
    private getVaultKeysForConnection;
    private getVaultKeyForPrivateKey;
    private normalizeAccount;
    private normalizeHost;
    private normalizePort;
    private getHostCandidates;
    private getUserCandidates;
    private getPortCandidates;
}
export {};
