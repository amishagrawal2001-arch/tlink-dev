/// <reference types="node" />
import { PartialProfile } from 'tlink-core';
import { SSHProfileImporter, SSHProfile, AutoPrivateKeyLocator } from 'tlink-ssh';
import { ElectronService } from './services/electron.service';
export declare class OpenSSHImporter extends SSHProfileImporter {
    lastImportedAt: Date | null;
    lastImportedCount: number;
    private watchers;
    private debounceTimer;
    getProfiles(): Promise<PartialProfile<SSHProfile>[]>;
    startWatching(): void;
    stopWatching(): void;
}
export declare class StaticFileImporter extends SSHProfileImporter {
    private configPath;
    constructor(electron: ElectronService);
    getProfiles(): Promise<PartialProfile<SSHProfile>[]>;
}
export declare class PrivateKeyLocator extends AutoPrivateKeyLocator {
    getKeys(): Promise<[string, Buffer][]>;
}
