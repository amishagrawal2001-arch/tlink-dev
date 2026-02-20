import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { VaultService } from 'tlink-core'
import { SSHProfile } from '../api'

export const VAULT_SECRET_TYPE_PASSWORD = 'ssh:password'
export const VAULT_SECRET_TYPE_PASSPHRASE = 'ssh:key-passphrase'
type PortValue = number|string|null|undefined
type SavedPasswordRecord = { password: string, username?: string }

@Injectable({ providedIn: 'root' })
export class PasswordStorageService {
    constructor (private vault: VaultService) { }

    async savePassword (profile: SSHProfile, password: string, username?: string): Promise<void> {
        const account = this.normalizeAccount(username ?? profile.options.user)
        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key, value: password })
            }
        } else {
            if (!account) {
                return
            }
            for (const key of this.getKeytarKeysForConnection(profile)) {
                await keytar.setPassword(key, account, password)
            }
        }
    }

    async deletePassword (profile: SSHProfile, username?: string): Promise<void> {
        const account = this.normalizeAccount(username ?? profile.options.user)
        if (this.vault.isEnabled()) {
            for (const key of this.getVaultKeysForConnection(profile, account)) {
                await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSWORD, key)
            }
        } else {
            if (!account) {
                return
            }
            for (const key of this.getKeytarKeysForConnection(profile)) {
                await keytar.deletePassword(key, account)
            }
        }
    }

    async loadPassword (profile: SSHProfile, username?: string): Promise<string|null> {
        const account = this.normalizeAccount(username ?? profile.options.user)
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
                const password = await keytar.getPassword(key, account)
                if (password) {
                    return password
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
            return null
        }

        for (const key of this.getKeytarKeysForConnection(profile)) {
            const credentials = await keytar.findCredentials(key)
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
        return null
    }

    async savePrivateKeyPassword (id: string, password: string): Promise<void> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSPHRASE, key, value: password })
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            return keytar.setPassword(key, 'user', password)
        }
    }

    async deletePrivateKeyPassword (id: string): Promise<void> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            this.vault.removeSecret(VAULT_SECRET_TYPE_PASSPHRASE, key)
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            await keytar.deletePassword(key, 'user')
        }
    }

    async loadPrivateKeyPassword (id: string): Promise<string|null> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSPHRASE, key))?.value ?? null
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            return keytar.getPassword(key, 'user')
        }
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
