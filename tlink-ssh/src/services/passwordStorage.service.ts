import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { VaultService, NotificationsService, LogService, Logger, PlatformService } from 'tlink-core'
import { SSHProfile } from '../api'

export const VAULT_SECRET_TYPE_PASSWORD = 'ssh:password'
export const VAULT_SECRET_TYPE_PASSPHRASE = 'ssh:key-passphrase'
type PortValue = number|string|null|undefined
type SavedPasswordRecord = { password: string, username?: string }

@Injectable({ providedIn: 'root' })
export class PasswordStorageService {
    private keytarAvailable: boolean | null = null
    private keytarHealthChecked = false
    private logger: Logger

    constructor (
        private vault: VaultService,
        private notifications: NotificationsService,
        private platformService: PlatformService,
        log: LogService,
    ) {
        this.logger = log.create('password-storage')
    }

    async checkKeytarHealth (): Promise<boolean> {
        if (this.keytarHealthChecked) {
            return this.keytarAvailable !== false
        }
        this.keytarHealthChecked = true

        try {
            await keytar.setPassword('tlink-health-check', 'canary', 'test')
            const value = await keytar.getPassword('tlink-health-check', 'canary')
            await keytar.deletePassword('tlink-health-check', 'canary')
            this.keytarAvailable = value === 'test'
            if (!this.keytarAvailable) {
                this.logger.warn('Keychain canary read-back failed')
                if (await this.ensureVaultReady()) {
                    this.notifications.error('System keychain is unavailable. Passwords will be stored in the encrypted vault.')
                } else {
                    this.notifications.error('System keychain is unavailable. Enable the encrypted vault in settings for reliable password storage.')
                }
            }
            return this.keytarAvailable
        } catch (e) {
            this.keytarAvailable = false
            this.logger.warn('Keychain health check failed', e)
            if (await this.ensureVaultReady()) {
                this.notifications.error('System keychain is unavailable. Passwords will be stored in the encrypted vault.')
            } else {
                this.notifications.error('System keychain is unavailable. Enable the encrypted vault in settings for reliable password storage.')
            }
            return false
        }
    }

    private async tryKeytarRead<T> (op: () => Promise<T>): Promise<T | null> {
        if (this.keytarAvailable === false) {
            return null
        }
        try {
            return await op()
        } catch (e) {
            this.keytarAvailable = false
            this.logger.warn('Keychain access failed', e)
            if (await this.ensureVaultReady()) {
                this.notifications.error('Keychain access failed. Using encrypted vault as fallback.')
            } else {
                this.notifications.error('Keychain access failed. Enable the encrypted vault in settings for reliable password storage.')
            }
            return null
        }
    }

    private async tryKeytarWrite (op: () => Promise<void>): Promise<boolean> {
        if (this.keytarAvailable === false) {
            return false
        }
        try {
            await op()
            return true
        } catch (e) {
            this.keytarAvailable = false
            this.logger.warn('Keychain write failed', e)
            if (await this.ensureVaultReady()) {
                this.notifications.error('Keychain access failed. Using encrypted vault as fallback.')
            } else {
                this.notifications.error('Keychain access failed. Enable the encrypted vault in settings for reliable password storage.')
            }
            return false
        }
    }

    private useVaultFallback (): boolean {
        return this.keytarAvailable === false
    }

    private async ensureVaultReady (): Promise<boolean> {
        if (this.vault.isEnabled()) {
            return true
        }
        // Vault requires a user-set passphrase to enable, so we can't
        // silently auto-enable it. Vault fallback only works if the user
        // has previously enabled the vault in settings.
        this.logger.warn('Vault is not enabled. Enable the encrypted vault in settings for reliable password storage.')
        return false
    }

    async savePassword (profile: SSHProfile, password: string, username?: string): Promise<void> {
        const account = this.normalizeAccount(username ?? profile.options.user)
        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key, value: password })
            }
        } else if (this.useVaultFallback()) {
            // Vault not enabled and keytar unavailable (production mode).
            // Read raw config, inject password, save via platform.
            if (profile.options) {
                profile.options.password = password
            }
            try {
                const yaml = require('js-yaml')
                const rawYaml = await this.platformService.loadConfig()
                const raw = yaml.load(rawYaml) ?? {}
                const profiles = raw.profiles ?? []
                let found = false
                for (const p of profiles) {
                    if (p?.id === profile.id) {
                        p.options = p.options ?? {}
                        p.options.password = password
                        found = true
                        this.logger.info(`Password injected for profile ${profile.id}`)
                        break
                    }
                }
                if (found) {
                    await this.platformService.saveConfig(yaml.dump(raw))
                    this.logger.info('Config saved with password via platform')
                } else {
                    this.logger.warn(`Profile ${profile.id} not found in config for password save`)
                }
            } catch (e) {
                this.logger.warn('Failed to save password via platform', e)
            }
            return
        } else {
            if (!account) {
                return
            }
            let keytarSucceeded = false
            for (const key of this.getKeytarKeysForConnection(profile)) {
                const ok = await this.tryKeytarWrite(() => keytar.setPassword(key, account, password))
                if (ok) {
                    keytarSucceeded = true
                }
            }
            if (!keytarSucceeded && this.useVaultFallback()) {
                for (const key of this.getVaultKeysForConnection(profile, account)) {
                    await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key, value: password })
                }
            }
        }
        // Always save to profile.options.password as backup (survives keytar/vault issues)
        await this.savePasswordToProfile(profile, password)
    }

    private savePasswordToProfile (profile: SSHProfile, password: string): void {
        if (profile.options) {
            profile.options.password = password
        }
        if (!profile.id) {
            return
        }
        // Delay the file write to avoid race with config.save()
        // which might overwrite the file without the password
        setTimeout(async () => {
            try {
                const yaml = require('js-yaml')
                const rawYaml = await this.platformService.loadConfig()
                if (!rawYaml) { return }
                const raw = yaml.load(rawYaml)
                if (!raw?.profiles) { return }
                for (const p of raw.profiles) {
                    if (p?.id === profile.id) {
                        if (!p.options) { p.options = {} }
                        p.options.password = password
                        await this.platformService.saveConfig(yaml.dump(raw))
                        this.logger.info('Password saved to config (delayed write)')
                        return
                    }
                }
            } catch (e) {
                this.logger.warn('Failed to save password to config', e)
            }
        }, 3000) // 3 second delay to ensure config.save() finishes first
    }

    async deletePassword (profile: SSHProfile, username?: string): Promise<void> {
        const account = this.normalizeAccount(username ?? profile.options.user)
        if (this.vault.isEnabled() || this.useVaultFallback()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSWORD, key)
            }
        } else {
            if (!account) {
                return
            }
            for (const key of this.getKeytarKeysForConnection(profile)) {
                await this.tryKeytarWrite(() => keytar.deletePassword(key, account).then(() => undefined))
            }
            // Also clean vault in case a previous fallback stored it there
            if (this.useVaultFallback()) {
                for (const key of this.getVaultKeysForConnection(profile, account)) {
                    await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSWORD, key)
                }
            }
        }
    }

    async loadPassword (profile: SSHProfile, username?: string): Promise<string|null> {
        const account = this.normalizeAccount(username ?? profile.options.user)

        // Check profile options first (production fallback storage)
        if (profile.options?.password) {
            return profile.options.password
        }

        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                const password = (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSWORD, key))?.value
                if (password) {
                    return password
                }
            }
            return null
        } else {
            if (!account) {
                return null
            }
            for (const key of this.getKeytarKeysForConnection(profile)) {
                const password = await this.tryKeytarRead(() => keytar.getPassword(key, account))
                if (password) {
                    return password
                }
            }
            if (this.useVaultFallback()) {
                for (const key of this.getVaultKeysForConnection(profile, account)) {
                    const password = (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSWORD, key))?.value
                    if (password) {
                        return password
                    }
                }
            }
            return null
        }
    }

    async loadAnyPassword (profile: SSHProfile): Promise<SavedPasswordRecord|null> {
        const preferredAccount = this.normalizeAccount(profile.options.user)
        if (preferredAccount) {
            const preferredPassword = await this.loadPassword(profile, preferredAccount)
            if (preferredPassword) {
                return { password: preferredPassword, username: preferredAccount }
            }
        }

        if (this.vault.isEnabled() || this.useVaultFallback()) {
            const vault = await this.vault.load()
            if (!vault) {
                return null
            }
            const hostCandidates = new Set(this.getHostCandidates(profile.options.host).map(x => x.toLowerCase()))
            const portCandidates = new Set(this.getPortCandidates(profile.options.port).map(x => `${typeof x}:${x ?? 'default'}`))
            for (const secret of vault.secrets ?? []) {
                if (secret.type !== VAULT_SECRET_TYPE_PASSWORD || !secret.value) {
                    continue
                }

                const key = secret.key as Record<string, unknown>
                const host = this.normalizeHost(typeof key.host === 'string' ? key.host : undefined)
                const hostMatches = !host || hostCandidates.has(host.toLowerCase())
                if (!hostMatches) {
                    continue
                }

                const keyPort = this.normalizePort(key.port as PortValue)
                const keyPortValues = this.getPortCandidates(keyPort)
                const portMatches = keyPortValues.some(x => portCandidates.has(`${typeof x}:${x ?? 'default'}`))
                if (!portMatches) {
                    continue
                }

                return {
                    password: secret.value,
                    username: this.normalizeAccount(typeof key.user === 'string' ? key.user : undefined),
                }
            }
            return null
        }

        for (const key of this.getKeytarKeysForConnection(profile)) {
            const credentials = await this.tryKeytarRead(() => keytar.findCredentials(key))
            if (credentials) {
                for (const credential of credentials) {
                    if (!credential.password) {
                        continue
                    }
                    return {
                        password: credential.password,
                        username: this.normalizeAccount(credential.account),
                    }
                }
            }
        }
        if (this.useVaultFallback()) {
            const vault = await this.vault.load()
            if (vault) {
                const hostCandidates = new Set(this.getHostCandidates(profile.options.host).map(x => x.toLowerCase()))
                const portCandidates = new Set(this.getPortCandidates(profile.options.port).map(x => `${typeof x}:${x ?? 'default'}`))
                for (const secret of vault.secrets ?? []) {
                    if (secret.type !== VAULT_SECRET_TYPE_PASSWORD || !secret.value) {
                        continue
                    }
                    const key = secret.key as Record<string, unknown>
                    const host = this.normalizeHost(typeof key.host === 'string' ? key.host : undefined)
                    if (host && !hostCandidates.has(host.toLowerCase())) {
                        continue
                    }
                    const keyPort = this.normalizePort(key.port as PortValue)
                    const keyPortValues = this.getPortCandidates(keyPort)
                    if (!keyPortValues.some(x => portCandidates.has(`${typeof x}:${x ?? 'default'}`))) {
                        continue
                    }
                    return {
                        password: secret.value,
                        username: this.normalizeAccount(typeof key.user === 'string' ? key.user : undefined),
                    }
                }
            }
        }
        return null
    }

    async savePrivateKeyPassword (id: string, password: string): Promise<void> {
        if (this.vault.isEnabled() || this.useVaultFallback()) {
            const key = this.getVaultKeyForPrivateKey(id)
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSPHRASE, key, value: password })
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            const ok = await this.tryKeytarWrite(() => keytar.setPassword(key, 'user', password))
            if (!ok && this.useVaultFallback()) {
                const vaultKey = this.getVaultKeyForPrivateKey(id)
                await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSPHRASE, key: vaultKey, value: password })
            }
        }
    }

    async deletePrivateKeyPassword (id: string): Promise<void> {
        if (this.vault.isEnabled() || this.useVaultFallback()) {
            const key = this.getVaultKeyForPrivateKey(id)
            await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSPHRASE, key)
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            await this.tryKeytarWrite(() => keytar.deletePassword(key, 'user').then(() => undefined))
            // Also clean vault in case a previous fallback stored it there
            if (this.useVaultFallback()) {
                const vaultKey = this.getVaultKeyForPrivateKey(id)
                await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSPHRASE, vaultKey)
            }
        }
    }

    async loadPrivateKeyPassword (id: string): Promise<string|null> {
        if (this.vault.isEnabled() || this.useVaultFallback()) {
            const key = this.getVaultKeyForPrivateKey(id)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSPHRASE, key))?.value ?? null
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            const password = await this.tryKeytarRead(() => keytar.getPassword(key, 'user'))
            if (password) {
                return password
            }
            if (this.useVaultFallback()) {
                const vaultKey = this.getVaultKeyForPrivateKey(id)
                return (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSPHRASE, vaultKey))?.value ?? null
            }
            return null
        }
    }

    async migrateAllToVault (): Promise<number> {
        if (!this.vault.isEnabled()) {
            throw new Error('Vault is not enabled')
        }
        let migrated = 0
        // Find all ssh@* keytar entries
        for (const serviceName of await this.getAllKeytarServiceNames()) {
            const credentials = await this.tryKeytarRead(() => keytar.findCredentials(serviceName))
            if (!credentials) {
                continue
            }
            for (const cred of credentials) {
                if (!cred.password) {
                    continue
                }
                const vaultKey = this.parseKeytarServiceToVaultKey(serviceName, cred.account)
                if (vaultKey) {
                    await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key: vaultKey, value: cred.password })
                    await this.tryKeytarWrite(() => keytar.deletePassword(serviceName, cred.account).then(() => undefined))
                    migrated++
                }
            }
        }
        return migrated
    }

    private async getAllKeytarServiceNames (): Promise<string[]> {
        // keytar doesn't have a "list all services" API, so we probe known patterns
        const services: string[] = []
        // Try common ssh@ patterns - this is best-effort
        const testServices = ['ssh']
        for (const svc of testServices) {
            const creds = await this.tryKeytarRead(() => keytar.findCredentials(svc))
            if (creds && creds.length > 0) {
                services.push(svc)
            }
        }
        return services
    }

    private parseKeytarServiceToVaultKey (service: string, account: string): { user?: string, host?: string, port?: PortValue } | null {
        // keytar keys are in format "ssh@host" or "ssh@host:port"
        const match = service.match(/^ssh@(.+?)(?::(\d+))?$/)
        if (match) {
            return {
                user: account || undefined,
                host: match[1],
                port: match[2] ? parseInt(match[2]) : undefined,
            }
        }
        if (service === 'ssh') {
            return { user: account || undefined }
        }
        return null
    }

    private getKeytarKeysForConnection (profile: SSHProfile): string[] {
        const keys = new Set<string>()
        const hosts = this.getHostCandidates(profile.options.host)
        const ports = this.getPortCandidates(profile.options.port)

        for (const host of hosts) {
            for (const port of ports) {
                if (port === undefined || port === null || port === '') {
                    keys.add(`ssh@${host}`)
                } else {
                    keys.add(`ssh@${host}:${port}`)
                }
            }
        }

        return [...keys]
    }

    private getKeytarKeyForPrivateKey (id: string): string {
        return `ssh-private-key:${id}`
    }

    private getVaultKeysForConnection (profile: SSHProfile, username?: string) {
        const users = this.getUserCandidates(username ?? profile.options.user)
        const hosts = this.getHostCandidates(profile.options.host)
        const ports = this.getPortCandidates(profile.options.port)

        const keys: Array<{ user?: string, host?: string, port?: PortValue }> = []
        for (const user of users) {
            for (const host of hosts) {
                for (const port of ports) {
                    keys.push({ user, host, port })
                }
            }
        }

        const seen = new Set<string>()
        return keys.filter(candidate => {
            const keyId = `${candidate.user ?? ''}|${candidate.host ?? ''}|${typeof candidate.port}:${candidate.port ?? 'default'}`
            if (seen.has(keyId)) {
                return false
            }
            seen.add(keyId)
            return true
        })
    }

    private getVaultKeyForPrivateKey (id: string) {
        return { hash: id }
    }

    private normalizeAccount (value?: string|null): string|undefined {
        const normalized = value?.trim()
        return normalized ? normalized : undefined
    }

    private normalizeHost (value?: string|null): string|undefined {
        const normalized = value?.trim()
        return normalized ? normalized : undefined
    }

    private normalizePort (value: PortValue): number|undefined {
        if (value === null || value === undefined || value === '') {
            return undefined
        }
        const parsed = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return undefined
        }
        return Math.trunc(parsed)
    }

    private getHostCandidates (host?: string|null): string[] {
        const raw = host ?? ''
        const normalized = this.normalizeHost(host)
        const candidates = [raw, normalized, normalized?.toLowerCase()]
            .filter(Boolean) as string[]
        return [...new Set(candidates)]
    }

    private getUserCandidates (user?: string|null): Array<string|undefined> {
        const raw = user ?? undefined
        const normalized = this.normalizeAccount(user)
        const candidates = [raw, normalized]
        const seen = new Set<string>()
        const result: Array<string|undefined> = []
        for (const candidate of candidates) {
            const key = candidate ?? '__undefined__'
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            result.push(candidate)
        }
        return result
    }

    private getPortCandidates (port: PortValue): Array<PortValue> {
        const normalized = this.normalizePort(port)
        const candidates: Array<PortValue> = [port, normalized]

        if (normalized === undefined || normalized === 22 || port === null || port === undefined || port === '') {
            candidates.push(undefined, 22, null)
        }

        const seen = new Set<string>()
        const result: Array<PortValue> = []
        for (const candidate of candidates) {
            const key = `${typeof candidate}:${candidate ?? 'default'}`
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            result.push(candidate)
        }
        return result
    }
}
