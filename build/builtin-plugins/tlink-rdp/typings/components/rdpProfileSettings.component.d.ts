import { OnInit } from '@angular/core';
import { ProfileSettingsComponent, NotificationsService } from 'tlink-core';
import { RDPProfile } from '../api';
import { RDPService } from '../services/rdp.service';
import { RDPPasswordStorageService } from '../services/passwordStorage.service';
/** @hidden */
export declare class RDPProfileSettingsComponent implements ProfileSettingsComponent<RDPProfile>, OnInit {
    private rdpService;
    private passwordStorage;
    private notifications;
    profile: RDPProfile;
    showPassword: boolean;
    testing: boolean;
    testResult: {
        success: boolean;
        error?: string;
        latencyMs?: number;
    } | null;
    sessionLogEnabled: boolean;
    sessionLogInputEvents: boolean;
    constructor(rdpService: RDPService, passwordStorage: RDPPasswordStorageService, notifications: NotificationsService);
    ngOnInit(): void;
    testConnection(): Promise<void>;
    saveToKeychain(): Promise<void>;
    clearFromKeychain(): Promise<void>;
    exportProfile(): void;
    importProfile(): void;
    onSessionLogToggle(enabled: boolean): void;
    onSessionLogInputToggle(enabled: boolean): void;
}
