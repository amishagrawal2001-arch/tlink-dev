import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { VaultService } from 'tlink-core'
import { RDPProfile } from '../api'

export const VAULT_SECRET_TYPE_RDP_PASSWORD = 'rdp:password'

@Injectable({ providedIn: 'root' })
export class RDPPasswordStorageService {
    constructor (private vault: VaultService) { }

    async savePassword (profile: RDPProfile, password: string): Promise<void> {
        const account = profile.options.user?.trim() || undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKey(profile, account)
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_RDP_PASSWORD, key, value: password })
        } else {
            if (!account) {
                return
            }
            const keytarKey = this.getKeytarKey(profile)
            await keytar.setPassword(keytarKey, account, password)
        }
    }

    async deletePassword (profile: RDPProfile): Promise<void> {
        const account = profile.options.user?.trim() || undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKey(profile, account)
            await this.vault.removeSecret(VAULT_SECRET_TYPE_RDP_PASSWORD, key)
        } else {
            if (!account) {
                return
            }
            const keytarKey = this.getKeytarKey(profile)
            await keytar.deletePassword(keytarKey, account)
        }
    }

    async loadPassword (profile: RDPProfile): Promise<string|null> {
        const account = profile.options.user?.trim() || undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKey(profile, account)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_RDP_PASSWORD, key))?.value ?? null
        } else {
            if (!account) {
                return null
            }
            const keytarKey = this.getKeytarKey(profile)
            return keytar.getPassword(keytarKey, account)
        }
    }

    private getKeytarKey (profile: RDPProfile): string {
        const host = profile.options.host?.trim() || 'unknown'
        const port = profile.options.port ?? 3389
        return `rdp@${host}:${port}`
    }

    private getVaultKey (profile: RDPProfile, user?: string) {
        return {
            user: user,
            host: profile.options.host?.trim(),
            port: profile.options.port ?? 3389,
        }
    }
}
