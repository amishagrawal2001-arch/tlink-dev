import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { VaultService } from 'tlink-core'
import { SSHProfile } from '../api'

export const VAULT_SECRET_TYPE_PASSWORD = 'ssh:password'
export const VAULT_SECRET_TYPE_PASSPHRASE = 'ssh:key-passphrase'

@Injectable({ providedIn: 'root' })
export class PasswordStorageService {
    constructor (private vault: VaultService) { }

    async savePassword (profile: SSHProfile, password: string, username?: string): Promise<void> {
        const account = username ?? profile.options.user
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeysForConnection(profile, account)[0]
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key, value: password })
        } else {
            if (!account) {
                return
            }
            const key = this.getKeytarKeysForConnection(profile)[0]
            await keytar.setPassword(key, account, password)
        }
    }

    async deletePassword (profile: SSHProfile, username?: string): Promise<void> {
        const account = username ?? profile.options.user
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
        const account = username ?? profile.options.user
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
        const host = profile.options.host
        const port = profile.options.port

        let primary = `ssh@${host}`
        if (port) {
            primary = `ssh@${host}:${port}`
        }

        const keys = [primary]
        if (port === 22) {
            keys.push(`ssh@${host}`)
        } else if (!port) {
            keys.push(`ssh@${host}:22`)
        }

        return Array.from(new Set(keys))
    }

    private getKeytarKeyForPrivateKey (id: string): string {
        return `ssh-private-key:${id}`
    }

    private getVaultKeysForConnection (profile: SSHProfile, username?: string) {
        const key = {
            user: username ?? profile.options.user,
            host: profile.options.host,
            port: profile.options.port,
        }

        const keys = [key]
        if (profile.options.port === 22) {
            keys.push({ ...key, port: undefined })
        } else if (!profile.options.port) {
            keys.push({ ...key, port: 22 })
        }

        const seen = new Set<string>()
        return keys.filter(candidate => {
            const keyId = `${candidate.user ?? ''}|${candidate.host ?? ''}|${candidate.port ?? 'default'}`
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
}
