import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { VaultService, LogService, Logger, ConfigService } from 'tlink-core'
import { SSHProfile } from '../api'

export const VAULT_SECRET_TYPE_PASSWORD = 'ssh:password'
export const VAULT_SECRET_TYPE_PASSPHRASE = 'ssh:key-passphrase'
type PortValue = number|string|null|undefined
type SavedPasswordRecord = { password: string, username?: string }

@Injectable({ providedIn: 'root' })
export class PasswordStorageService {
    private logger: Logger

    constructor (
        private vault: VaultService,
        private configService: ConfigService,
        log: LogService,
    ) {
        this.logger = log.create('password-storage')
    }

    /**
     * Helper for keytar operations used only by migrateAllToVault().
     * Not used for normal password save/load flows.
     */
    private async tryKeytarRead<T> (op: () => Promise<T>): Promise<T | null> {
        try {
            return await op()
        } catch (e) {
            this.logger.warn('Keychain access failed', e)
            return null
        }
    }

    private async tryKeytarWrite (op: () => Promise<void>): Promise<boolean> {
        try {
            await op()
            return true
        } catch (e) {
            this.logger.warn('Keychain write failed', e)
            return false
        }
    }

    async savePassword (profile: SSHProfile, password: string, username?: string): Promise<void> {
        const account = this.normalizeAccount(username ?? profile.options.user)

        // 1. Always set password on the in-memory profile object
        if (profile.options) {
            profile.options.password = password
        }

        // 2. Persist to config store (primary, reliable storage)
        this.persistPasswordToConfig(profile, password)

        // 3. Also save to vault if enabled (vault is user-opted-in secure storage)
        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                try {
                    await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key, value: password })
                } catch (e) {
                    this.logger.warn('Vault save failed (non-critical)', e)
                }
            }
        }
        // Note: keytar (macOS Keychain) is no longer used for SSH passwords.
        // Config store is the primary storage; vault is optional secondary.
    }

    /**
     * Persist password directly into the config store's profile entry and flush to disk.
     * This is the primary persistence mechanism that survives app restarts regardless
     * of keytar/vault availability.
     */
    private persistPasswordToConfig (profile: SSHProfile, password: string): void {
        if (!profile.id) {
            // New profile — password is already set on the in-memory object.
            // It will be persisted when the profile is saved via newProfile() + config.save().
            return
        }
        try {
            // Find the profile in the config store's raw profiles array and set the password
            const profiles = this.configService.store?.profiles
            if (!profiles) { return }
            for (const p of profiles) {
                if (p?.id === profile.id) {
                    if (!p.options) { p.options = {} }
                    p.options.password = password
                    this.logger.info(`Password set in config store for profile ${profile.id}`)
                    // Flush to disk
                    this.configService.save().catch(e => {
                        this.logger.warn('Failed to flush config after password save', e)
                    })
                    return
                }
            }
            this.logger.debug(`Profile ${profile.id} not found in config store (may be ephemeral)`)
        } catch (e) {
            this.logger.warn('Failed to persist password to config', e)
        }
    }

    async deletePassword (profile: SSHProfile, username?: string): Promise<void> {
        const account = this.normalizeAccount(username ?? profile.options.user)

        // Clear from config store
        if (profile.options) {
            profile.options.password = undefined
        }
        if (profile.id) {
            try {
                const profiles = this.configService.store?.profiles
                if (profiles) {
                    for (const p of profiles) {
                        if (p?.id === profile.id && p.options) {
                            delete p.options.password
                            this.configService.save().catch(() => {})
                            break
                        }
                    }
                }
            } catch (e) {
                this.logger.warn('Failed to clear password from config', e)
            }
        }

        // Clear from vault if enabled
        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSWORD, key)
            }
        }
    }

    async loadPassword (profile: SSHProfile, username?: string): Promise<string|null> {
        const account = this.normalizeAccount(username ?? profile.options.user)

        // Check profile object first (in-memory)
        if (profile.options?.password) {
            return profile.options.password
        }

        // Check config store (the profile object might be a stale copy from tab recovery)
        if (profile.id) {
            try {
                const profiles = this.configService.store?.profiles
                if (profiles) {
                    for (const p of profiles) {
                        if (p?.id === profile.id && p.options?.password) {
                            // Sync back to the in-memory profile so future lookups are fast
                            if (profile.options) {
                                profile.options.password = p.options.password
                            }
                            return p.options.password
                        }
                    }
                }
            } catch (e) {
                this.logger.warn('Failed to load password from config store', e)
            }
        }

        // Check vault if enabled (secondary storage)
        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                const password = (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSWORD, key))?.value
                if (password) {
                    return password
                }
            }
        }

        return null
    }

    async loadAnyPassword (profile: SSHProfile): Promise<SavedPasswordRecord|null> {
        const preferredAccount = this.normalizeAccount(profile.options.user)
        if (preferredAccount) {
            const preferredPassword = await this.loadPassword(profile, preferredAccount)
            if (preferredPassword) {
                return { password: preferredPassword, username: preferredAccount }
            }
        }

        // Check vault if enabled
        if (this.vault.isEnabled()) {
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
        }

        return null
    }

    async savePrivateKeyPassword (id: string, password: string): Promise<void> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSPHRASE, key, value: password })
        }
    }

    async deletePrivateKeyPassword (id: string): Promise<void> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSPHRASE, key)
        }
    }

    async loadPrivateKeyPassword (id: string): Promise<string|null> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSPHRASE, key))?.value ?? null
        } else {
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
