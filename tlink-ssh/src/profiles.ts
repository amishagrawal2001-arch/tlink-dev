import { Injectable, InjectFlags, Injector } from '@angular/core'
import { NewTabParameters, PartialProfile, TranslateService, QuickConnectProfileProvider, ConfigService, NotificationsService } from 'tlink-core'
import { SSHProfileSettingsComponent } from './components/sshProfileSettings.component'
import { SSHTabComponent } from './components/sshTab.component'
import { PasswordStorageService } from './services/passwordStorage.service'
import { SSHAlgorithmType, SSHProfile } from './api'
import { SSHProfileImporter } from './api/importer'
import { defaultAlgorithms } from './algorithms'

@Injectable({ providedIn: 'root' })
export class SSHProfilesService extends QuickConnectProfileProvider<SSHProfile> {
    id = 'ssh'
    name = 'SSH'
    settingsComponent = SSHProfileSettingsComponent
    configDefaults = {
        behaviorOnSessionEnd: 'reconnect',
        options: {
            host: null,
            port: 22,
            user: 'root',
            auth: null,
            password: null,
            privateKeys: [],
            keepaliveInterval: 5000,
            keepaliveCountMax: 10,
            readyTimeout: null,
            x11: false,
            skipBanner: false,
            jumpHost: null,
            agentForward: false,
            warnOnClose: null,
            algorithms: {
                hmac: [] as string[],
                kex: [] as string[],
                cipher: [] as string[],
                serverHostKey: [] as string[],
                compression: [] as string[],
            },
            proxyCommand: null,
            forwardedPorts: [],
            scripts: [],
            socksProxyHost: null,
            socksProxyPort: null,
            httpProxyHost: null,
            httpProxyPort: null,
            reuseSession: true,
            authMethodOrder: ['publicKey', 'agent', 'password', 'keyboardInteractive'],
            sftpBookmarks: [],
            input: { backspace: 'backspace' },
        },
        clearServiceMessagesOnConnect: true,
    }

    constructor (
        private passwordStorage: PasswordStorageService,
        private translate: TranslateService,
        private injector: Injector,
        private configService: ConfigService,
        private notifications: NotificationsService,
    ) {
        super()
        for (const k of Object.values(SSHAlgorithmType)) {
            this.configDefaults.options.algorithms[k] = [...defaultAlgorithms[k]]
            if (k !== SSHAlgorithmType.COMPRESSION) { this.configDefaults.options.algorithms[k].sort() }
        }

        // Auto-sync: watch SSH config importers for changes
        setTimeout(() => this.initAutoImport(), 0)
    }

    private initAutoImport (): void {
        const importers = this.injector.get<SSHProfileImporter[]>(SSHProfileImporter as any, [], InjectFlags.Optional)
        for (const importer of importers) {
            // Start file watching if the importer supports it
            if (typeof (importer as any).startWatching === 'function') {
                (importer as any).startWatching()
            }

            importer.onChange$.subscribe(() => {
                if (this.configService.store.ssh?.autoImportConfig === false) {
                    return
                }
                this.notifications.info(this.translate.instant('SSH config changed, re-importing profiles...'))
                // Builtin profiles are re-fetched automatically when the profile list is next accessed.
                // Force a config change event so the UI refreshes.
                this.configService.save()
            })
        }
    }

    async getBuiltinProfiles (): Promise<PartialProfile<SSHProfile>[]> {
        const importers = this.injector.get<SSHProfileImporter[]>(SSHProfileImporter as any, [], InjectFlags.Optional)
        let imported: PartialProfile<SSHProfile>[] = []
        for (const importer of importers) {
            try {
                imported = imported.concat(await importer.getProfiles())
            } catch (e) {
                console.warn('Could not import SSH profiles:', e)
            }
        }
        return [
            {
                id: `ssh:template`,
                type: 'ssh',
                name: this.translate.instant('SSH connection'),
                icon: 'fas fa-desktop',
                options: {
                    host: '',
                    port: 22,
                    user: 'root',
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            },
            ...imported.map(p => ({
                ...p,
                isBuiltin: true,
            })),
        ]
    }

    async getNewTabParameters (profile: SSHProfile): Promise<NewTabParameters<SSHTabComponent>> {
        return {
            type: SSHTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName (profile: SSHProfile): string {
        return `${profile.options.user}@${profile.options.host}:${profile.options.port}`
    }

    getDescription (profile: PartialProfile<SSHProfile>): string {
        return profile.options?.host ?? ''
    }

    deleteProfile (profile: SSHProfile): void {
        this.passwordStorage.deletePassword(profile)
    }

    async duplicateProfile (source: SSHProfile, target: SSHProfile): Promise<void> {
        const sourceCandidates = this.getUsernameCandidates(source.options.user, target.options.user)
        let credential: { password: string, username?: string }|null = null

        for (const username of sourceCandidates) {
            const password = await this.passwordStorage.loadPassword(source, username)
            if (password) {
                credential = { password, username }
                break
            }
        }

        if (!credential) {
            credential = await this.passwordStorage.loadAnyPassword(source)
        }
        if (!credential) {
            return
        }

        const targetUser = this.resolveUsername(target.options.user ?? source.options.user)
        const usernames = this.getUsernameCandidates(targetUser, credential.username)
        if (!usernames.length) {
            await this.passwordStorage.savePassword(target, credential.password)
            return
        }

        for (const username of usernames) {
            await this.passwordStorage.savePassword(target, credential.password, username)
        }
    }

    private getUsernameCandidates (...values: Array<string|undefined|null>): string[] {
        const result: string[] = []
        const seen = new Set<string>()
        for (const value of values) {
            const resolved = this.resolveUsername(value)
            if (!resolved || seen.has(resolved)) {
                continue
            }
            seen.add(resolved)
            result.push(resolved)
        }
        return result
    }

    private resolveUsername (value?: string|null): string|undefined {
        const normalized = value?.trim()
        if (!normalized) {
            return undefined
        }
        if (normalized.startsWith('$')) {
            try {
                const resolved = process.env[normalized.slice(1)]?.trim()
                if (resolved) {
                    return resolved
                }
            } catch { }
        }
        return normalized
    }

    quickConnect (query: string): PartialProfile<SSHProfile> {
        let user: string|undefined = undefined
        let host = query.trim()
        let port = 22
        if (host.includes('@')) {
            const parts = host.split(/@/g)
            host = parts[parts.length - 1].trim()
            user = parts.slice(0, parts.length - 1).join('@').trim()
        }
        if (host.includes('[')) {
            port = parseInt(host.split(']')[1].substring(1))
            host = host.split(']')[0].substring(1).trim()
        } else if (host.includes(':')) {
            port = parseInt(host.split(/:/g)[1])
            host = host.split(':')[0].trim()
        }

        return {
            name: `${user ? user + '@' : ''}${host}${port !== 22 ? ':' + port : ''}`,
            type: 'ssh',
            options: {
                host,
                user,
                port,
            },
        }
    }

    intoQuickConnectString (profile: SSHProfile): string|null {
        let s = profile.options.host
        if (profile.options.user !== 'root') {
            s = `${profile.options.user}@${s}`
        }
        if (profile.options.port !== 22) {
            s = `${s}:${profile.options.port}`
        }
        return s
    }
}
