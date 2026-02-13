import { Injector } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';
import { WorkspaceService } from './workspace.service';
import { ProfilesService } from './profiles.service';
import { PlatformService } from '../api/platform';
import { LogService } from './log.service';
export interface BackupConfig {
    enabled: boolean;
    interval: number;
    retention: number;
    includeWorkspaces: boolean;
    includeConfig: boolean;
    includeProfiles: boolean;
}
export interface Backup {
    id: string;
    timestamp: Date;
    size: number;
    path: string;
    checksum: string;
    metadata: {
        version: string;
        deviceId: string;
        items: string[];
        appVersion?: string;
    };
}
export interface BackupData {
    version: string;
    timestamp: string;
    deviceId: string;
    config?: any;
    workspaces?: any[];
    profiles?: any[];
    metadata: {
        appVersion?: string;
        platform?: string;
    };
}
export declare class BackupService {
    private config;
    private workspace;
    private profilesService;
    private platform;
    private logger;
    private backupConfig;
    private backups;
    private backupInterval;
    private deviceId;
    private backupDirectory;
    private backupsChanged$;
    get backupsChanged(): Observable<void>;
    constructor(config: ConfigService, workspace: WorkspaceService, profilesService: ProfilesService, platform: PlatformService, _injector: Injector, log: LogService);
    /**
     * Get or create unique device ID
     */
    private getOrCreateDeviceId;
    /**
     * Get backup directory path
     */
    private getBackupDirectory;
    /**
     * Ensure backup directory exists and get full path
     */
    private ensureBackupDirectory;
    /**
     * Get IPC renderer for Electron operations
     */
    private getIpcRenderer;
    /**
     * Load backup configuration from config store
     */
    private loadBackupConfig;
    /**
     * Save backup configuration to config store
     */
    private saveBackupConfig;
    /**
     * Load backup index (list of all backups)
     */
    private loadBackupIndex;
    /**
     * Save backup index
     */
    private saveBackupIndex;
    /**
     * Calculate checksum for data integrity
     */
    private calculateChecksum;
    /**
     * Collect data for backup
     */
    private collectBackupData;
    /**
     * Create a backup
     */
    createBackup(manual?: boolean, silent?: boolean): Promise<Backup>;
    /**
     * Restore from a backup
     */
    restoreBackup(backupId: string): Promise<void>;
    /**
     * Export backup to a file
     */
    exportBackup(backupId: string, filePath: string): Promise<void>;
    /**
     * Import backup from a file
     */
    importBackup(filePath: string): Promise<Backup>;
    /**
     * Delete a backup
     */
    deleteBackup(backupId: string): Promise<void>;
    /**
     * Get all backups (sorted by timestamp, newest first)
     */
    getBackups(): Backup[];
    /**
     * Get a specific backup by ID
     */
    getBackup(backupId: string): Backup | null;
    /**
     * Enable automatic backups
     */
    enableAutomaticBackups(): Promise<void>;
    /**
     * Disable automatic backups
     */
    disableAutomaticBackups(): Promise<void>;
    /**
     * Start automatic backup schedule
     */
    startAutomaticBackups(skipInitial?: boolean): void;
    /**
     * Stop automatic backup schedule
     */
    stopAutomaticBackups(): void;
    /**
     * Clean up old backups based on retention policy
     */
    private cleanupOldBackups;
    /**
     * Update backup configuration
     */
    updateBackupConfig(config: Partial<BackupConfig>): Promise<void>;
    /**
     * Get current backup configuration
     */
    getBackupConfig(): BackupConfig;
    /**
     * Check if automatic backups are enabled
     */
    isEnabled(): boolean;
    /**
     * Get backup statistics
     */
    getBackupStats(): {
        totalBackups: number;
        totalSize: number;
        oldestBackup: Date | null;
        newestBackup: Date | null;
    };
}
