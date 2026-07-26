import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { VaultService } from 'tlink-core'
import { GnmiProfile } from '../api'

/**
 * Keychain / vault storage for gNMI target passwords.
 *
 * Same pattern as `tlink-rdp/src/services/passwordStorage.service.ts`:
 *   - When the built-in Vault is enabled we route through it so the
 *     password is protected by the vault master password.
 *   - Otherwise we fall back to keytar (macOS Keychain / Windows
 *     Credential Manager / libsecret on Linux) keyed by
 *     `gnmi@<host>:<port>` + the username.
 *
 * The password is NEVER persisted to disk in plaintext; the config
 * file stores only a reference (or null when the user picks "don't
 * save"), and load-time hydration goes through the service.
 */
export const VAULT_SECRET_TYPE_GNMI_PASSWORD = 'gnmi:password'

@Injectable({ providedIn: 'root' })
export class GnmiPasswordStorageService {
    constructor (private vault: VaultService) { }

    async savePassword (profile: GnmiProfile, password: string): Promise<void> {
        const account = profile.options.username?.trim() ?? undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKey(profile, account)
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_GNMI_PASSWORD, key, value: password })
        } else {
            if (!account) { return }
            await keytar.setPassword(this.getKeytarKey(profile), account, password)
        }
    }

    async deletePassword (profile: GnmiProfile): Promise<void> {
        const account = profile.options.username?.trim() ?? undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKey(profile, account)
            await this.vault.removeSecret(VAULT_SECRET_TYPE_GNMI_PASSWORD, key)
        } else {
            if (!account) { return }
            await keytar.deletePassword(this.getKeytarKey(profile), account)
        }
    }

    async loadPassword (profile: GnmiProfile): Promise<string | null> {
        const account = profile.options.username?.trim() ?? undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKey(profile, account)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_GNMI_PASSWORD, key))?.value ?? null
        } else {
            if (!account) { return null }
            return keytar.getPassword(this.getKeytarKey(profile), account)
        }
    }

    private getKeytarKey (profile: GnmiProfile): string {
        const host = profile.options.host.trim() || 'unknown'
        const port = profile.options.port ?? 0
        return `gnmi@${host}:${port}`
    }

    private getVaultKey (profile: GnmiProfile, user?: string) {
        return {
            host: profile.options.host,
            port: profile.options.port,
            user: user ?? '',
        }
    }
}
