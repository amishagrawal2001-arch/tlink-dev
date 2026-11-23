import { Injectable } from '@angular/core'

export const VAULT_SECRET_TYPE_LICENSE = 'tlink:license-tokens'
export const LICENSE_KEYTAR_SERVICE = 'tlink-license-client'
export const LICENSE_KEYTAR_ACCOUNT = 'tokens'
/** Separate account key for local trial state (independent of token bundle). */
export const LICENSE_TRIAL_ACCOUNT = 'trial-start'
/**
 * Separate account key for the monotonic clock high-water-mark.
 * Kept out of the token bundle so it survives sign-out and so a
 * tampered bundle can't rewind it. Audit #1 (clock rollback).
 */
export const LICENSE_CLOCK_HWM_ACCOUNT = 'clock-hwm'

export interface StoredLicenseBundle {
    accessToken: string
    refreshToken: string
    userEmail: string
    deviceId: string
    licenseId: string
    licenseType: string | null
    billingType: string | null
    startDate: string | null
    endDate: string | null
    /** ms since epoch of the last successful server contact. Used for grace. */
    lastServerContactAt: number
}

/**
 * Persists access + refresh tokens (and last-known entitlement state) in the
 * OS keychain. Uses `tlink-core`'s VaultService when enabled, otherwise falls
 * back to `keytar`. Values are serialized as JSON under a single account.
 *
 * Vault/keytar imports are resolved lazily so this module stays usable in
 * non-Electron contexts (e.g. unit tests without native bindings compiled).
 */
@Injectable({ providedIn: 'root' })
export class LicenseTokenStorageService {
    private vault: any
    private keytar: any

    constructor () {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const tlinkCore = (window as any).require?.('tlink-core') || require('tlink-core')
            this.vault = tlinkCore?.VaultService ? null : null  // Vault is injected, not singleton.
        } catch {
            this.vault = null
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            this.keytar = (window as any).require?.('keytar') || require('keytar')
        } catch {
            this.keytar = null
        }
    }

    /** Inject VaultService externally once Angular has constructed it (optional). */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    setVault (vault: any): void {
        this.vault = vault
    }

    async save (bundle: StoredLicenseBundle): Promise<void> {
        const payload = JSON.stringify(bundle)
        if (this.vault?.isEnabled?.()) {
            await this.vault.addSecret({
                type: VAULT_SECRET_TYPE_LICENSE,
                key: { account: LICENSE_KEYTAR_ACCOUNT },
                value: payload,
            })
            return
        }
        if (this.keytar) {
            await this.keytar.setPassword(LICENSE_KEYTAR_SERVICE, LICENSE_KEYTAR_ACCOUNT, payload)
            return
        }
        // Final fallback — localStorage. Visible to anyone with disk access;
        // only used when neither Vault nor keytar is available (dev/browser).
        localStorage.setItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_KEYTAR_ACCOUNT, payload)
    }

    async load (): Promise<StoredLicenseBundle | null> {
        let raw: string | null = null
        if (this.vault?.isEnabled?.()) {
            const secret = await this.vault.getSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_KEYTAR_ACCOUNT })
            raw = secret?.value ?? null
        } else if (this.keytar) {
            raw = await this.keytar.getPassword(LICENSE_KEYTAR_SERVICE, LICENSE_KEYTAR_ACCOUNT)
        } else {
            raw = localStorage.getItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_KEYTAR_ACCOUNT)
        }
        if (!raw) {return null}
        try {
            return JSON.parse(raw) as StoredLicenseBundle
        } catch {
            return null
        }
    }

    async clear (): Promise<void> {
        if (this.vault?.isEnabled?.()) {
            await this.vault.removeSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_KEYTAR_ACCOUNT })
            return
        }
        if (this.keytar) {
            await this.keytar.deletePassword(LICENSE_KEYTAR_SERVICE, LICENSE_KEYTAR_ACCOUNT)
            return
        }
        localStorage.removeItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_KEYTAR_ACCOUNT)
    }

    // ─── Trial state (independent of the token bundle) ────────────────────
    //
    // Stored as an integer timestamp (ms since epoch). First launch without a
    // license bundle writes this value once; we only clear it on successful
    // sign-in (trial → real license conversion).

    async saveTrialStart (startMs: number): Promise<void> {
        const value = String(startMs)
        if (this.vault?.isEnabled?.()) {
            await this.vault.addSecret({
                type: VAULT_SECRET_TYPE_LICENSE,
                key: { account: LICENSE_TRIAL_ACCOUNT },
                value,
            })
            return
        }
        if (this.keytar) {
            await this.keytar.setPassword(LICENSE_KEYTAR_SERVICE, LICENSE_TRIAL_ACCOUNT, value)
            return
        }
        localStorage.setItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_TRIAL_ACCOUNT, value)
    }

    async loadTrialStart (): Promise<number | null> {
        let raw: string | null = null
        if (this.vault?.isEnabled?.()) {
            const secret = await this.vault.getSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_TRIAL_ACCOUNT })
            raw = secret?.value ?? null
        } else if (this.keytar) {
            raw = await this.keytar.getPassword(LICENSE_KEYTAR_SERVICE, LICENSE_TRIAL_ACCOUNT)
        } else {
            raw = localStorage.getItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_TRIAL_ACCOUNT)
        }
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) ? n : null
    }

    async clearTrial (): Promise<void> {
        if (this.vault?.isEnabled?.()) {
            await this.vault.removeSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_TRIAL_ACCOUNT })
            return
        }
        if (this.keytar) {
            await this.keytar.deletePassword(LICENSE_KEYTAR_SERVICE, LICENSE_TRIAL_ACCOUNT)
            return
        }
        localStorage.removeItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_TRIAL_ACCOUNT)
    }

    // ─── Clock high-water-mark (audit #1 — clock rollback) ────────────────
    //
    // Stored as an integer unix-seconds timestamp. Updated whenever we
    // successfully contact the server or verify an offline blob, and
    // consulted on every verify so an attacker who rolls the OS clock
    // back can't resurrect an expired offline code. Survives sign-out
    // on purpose: rollback detection should keep working across a
    // sign-out / re-redeem cycle.

    async saveClockHwm (seconds: number): Promise<void> {
        const value = String(seconds)
        if (this.vault?.isEnabled?.()) {
            await this.vault.addSecret({
                type: VAULT_SECRET_TYPE_LICENSE,
                key: { account: LICENSE_CLOCK_HWM_ACCOUNT },
                value,
            })
            return
        }
        if (this.keytar) {
            await this.keytar.setPassword(LICENSE_KEYTAR_SERVICE, LICENSE_CLOCK_HWM_ACCOUNT, value)
            return
        }
        localStorage.setItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_CLOCK_HWM_ACCOUNT, value)
    }

    async loadClockHwm (): Promise<number | null> {
        let raw: string | null = null
        if (this.vault?.isEnabled?.()) {
            const secret = await this.vault.getSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_CLOCK_HWM_ACCOUNT })
            raw = secret?.value ?? null
        } else if (this.keytar) {
            raw = await this.keytar.getPassword(LICENSE_KEYTAR_SERVICE, LICENSE_CLOCK_HWM_ACCOUNT)
        } else {
            raw = localStorage.getItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_CLOCK_HWM_ACCOUNT)
        }
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) ? n : null
    }

    async clearClockHwm (): Promise<void> {
        if (this.vault?.isEnabled?.()) {
            await this.vault.removeSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_CLOCK_HWM_ACCOUNT })
            return
        }
        if (this.keytar) {
            await this.keytar.deletePassword(LICENSE_KEYTAR_SERVICE, LICENSE_CLOCK_HWM_ACCOUNT)
            return
        }
        localStorage.removeItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_CLOCK_HWM_ACCOUNT)
    }
}
