import { Component, HostBinding, InjectFlags, Injector, OnDestroy } from '@angular/core'
import { X11Socket } from '../session/x11'
import { ConfigService, HostAppService, NotificationsService, Platform, ProfilesService, VaultService } from 'tlink-core'
import { SSHProfileImporter } from '../api/importer'
import { SSHProfile } from '../api'
import { PasswordStorageService } from '../services/passwordStorage.service'

interface SavedCredentialEntry {
    profile: SSHProfile
    name: string
    hasSavedPassword: boolean
}

interface DuplicateGroup {
    key: string
    profiles: SSHProfile[]
}

/** @hidden */
@Component({
    templateUrl: './sshSettingsTab.component.pug',
})
export class SSHSettingsTabComponent implements OnDestroy {
    Platform = Platform
    defaultX11Display: string
    reimporting = false
    lastImportInfo: { count: number, time: string } | null = null

    // Saved credentials
    savedCredentials: SavedCredentialEntry[] = []
    loadingCredentials = false
    storageBackend = ''

    // Migration
    migrating = false
    migrationResult: string | null = null

    // Dedup
    duplicateGroups: DuplicateGroup[] = []
    scanningDuplicates = false

    @HostBinding('class.content-box') true

    private importers: SSHProfileImporter[] = []
    private autoImportTimer: ReturnType<typeof setInterval> | null = null

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        private injector: Injector,
        private notifications: NotificationsService,
        private profilesService: ProfilesService,
        private passwordStorage: PasswordStorageService,
        private vault: VaultService,
    ) {
        const spec = X11Socket.resolveDisplaySpec()
        if ('path' in spec) {
            this.defaultX11Display = spec.path
        } else {
            this.defaultX11Display = `${spec.host}:${spec.port}`
        }

        this.importers = this.injector.get<SSHProfileImporter[]>(SSHProfileImporter as any, [], InjectFlags.Optional)

        // Show last import info from the OpenSSH importer
        for (const importer of this.importers) {
            if ((importer as any).lastImportedAt) {
                this.lastImportInfo = {
                    count: (importer as any).lastImportedCount ?? 0,
                    time: (importer as any).lastImportedAt?.toLocaleTimeString() ?? '',
                }
            }
        }

        this.setupAutoImport()
        this.updateStorageBackend()
        void this.loadSavedCredentials()
        void this.scanForDuplicates()
    }

    ngOnDestroy (): void {
        this.clearAutoImport()
    }

    private setupAutoImport (): void {
        this.clearAutoImport()
        if (this.config.store.ssh.autoImportConfig) {
            this.autoImportTimer = setInterval(() => {
                this.silentReimport()
            }, 30000)
        }
    }

    onAutoImportChanged (): void {
        this.config.save()
        this.setupAutoImport()
    }

    private clearAutoImport (): void {
        if (this.autoImportTimer) {
            clearInterval(this.autoImportTimer)
            this.autoImportTimer = null
        }
    }

    private async silentReimport (): Promise<void> {
        if (this.reimporting) {
            return
        }
        try {
            for (const importer of this.importers) {
                await importer.getProfiles()
            }
        } catch {
            // Silent failure for background sync
        }
    }

    async reimportSSHConfig (): Promise<void> {
        if (this.reimporting) {
            return
        }
        this.reimporting = true
        let totalCount = 0
        try {
            for (const importer of this.importers) {
                const profiles = await importer.getProfiles()
                totalCount += profiles.length
            }
            this.lastImportInfo = {
                count: totalCount,
                time: new Date().toLocaleTimeString(),
            }
            this.notifications.info(`Imported ${totalCount} SSH hosts from config`)
            this.config.save()
        } catch (error: any) {
            this.notifications.error('Failed to import: ' + (error?.message ?? ''))
        } finally {
            this.reimporting = false
        }
    }

    // --- Saved Credentials ---

    private updateStorageBackend (): void {
        if (this.vault.isEnabled()) {
            this.storageBackend = 'Encrypted vault'
        } else {
            this.storageBackend = 'System keychain'
        }
    }

    async loadSavedCredentials (): Promise<void> {
        this.loadingCredentials = true
        this.savedCredentials = []
        try {
            const profiles = await this.profilesService.getProfiles({ includeBuiltin: false })
            const sshProfiles = profiles.filter(p => p.type === 'ssh') as SSHProfile[]
            for (const profile of sshProfiles) {
                try {
                    const pw = await this.passwordStorage.loadPassword(profile)
                    if (pw) {
                        this.savedCredentials.push({
                            profile,
                            name: `${profile.options.user ?? ''}@${profile.options.host}:${profile.options.port ?? 22}`,
                            hasSavedPassword: true,
                        })
                    }
                } catch {
                    // Skip profiles with load errors
                }
            }
        } catch {
            // Failed to load profiles
        } finally {
            this.loadingCredentials = false
        }
    }

    async forgetCredential (entry: SavedCredentialEntry): Promise<void> {
        await this.passwordStorage.deletePassword(entry.profile).catch(() => {
            this.notifications.error('Failed to remove saved password')
        })
        this.savedCredentials = this.savedCredentials.filter(c => c !== entry)
    }

    // --- Migration ---

    get vaultEnabled (): boolean {
        return this.vault.isEnabled()
    }

    async migrateToVault (): Promise<void> {
        if (this.migrating || !this.vault.isEnabled()) {
            return
        }
        this.migrating = true
        this.migrationResult = null
        try {
            const count = await this.passwordStorage.migrateAllToVault()
            this.migrationResult = count > 0
                ? `Migrated ${count} password${count > 1 ? 's' : ''} to vault`
                : 'No passwords to migrate'
            if (count > 0) {
                this.notifications.info(this.migrationResult)
            }
            this.updateStorageBackend()
            await this.loadSavedCredentials()
        } catch (e: any) {
            this.migrationResult = `Migration failed: ${e?.message ?? ''}`
            this.notifications.error(this.migrationResult)
        } finally {
            this.migrating = false
        }
    }

    // --- Profile Dedup ---

    async scanForDuplicates (): Promise<void> {
        this.scanningDuplicates = true
        this.duplicateGroups = []
        try {
            const profiles = await this.profilesService.getProfiles({ includeBuiltin: false })
            const sshProfiles = profiles.filter(p => p.type === 'ssh') as SSHProfile[]
            const groups = new Map<string, SSHProfile[]>()

            for (const p of sshProfiles) {
                const key = `${(p.options.user ?? '').trim().toLowerCase()}@${(p.options.host ?? '').trim().toLowerCase()}:${p.options.port ?? 22}`
                if (!groups.has(key)) {
                    groups.set(key, [])
                }
                groups.get(key)!.push(p)
            }

            for (const [key, profileList] of groups) {
                if (profileList.length > 1) {
                    this.duplicateGroups.push({ key, profiles: profileList })
                }
            }
        } catch {
            // Failed to scan
        } finally {
            this.scanningDuplicates = false
        }
    }

    async removeDuplicate (group: DuplicateGroup, profile: SSHProfile): Promise<void> {
        await this.profilesService.deleteProfile(profile)
        group.profiles = group.profiles.filter(p => p !== profile)
        if (group.profiles.length <= 1) {
            this.duplicateGroups = this.duplicateGroups.filter(g => g !== group)
        }
        this.config.save()
    }
}
