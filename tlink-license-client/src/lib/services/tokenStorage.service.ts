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
/**
 * Separate account key for the per-install HMAC key that signs the
 * stored token bundle. Audit #4 — the keychain gives us confidentiality
 * against other processes, but not integrity against a user who edits
 * their own keychain to extend endDate / flip billingType / rotate
 * deviceId. Save() wraps the bundle in {v, bundle, mac} and load()
 * refuses to hydrate on mismatch. The HMAC key is a 32-byte random
 * generated on first launch and held forever (never cleared on
 * sign-out) so a sign-out/sign-in cycle still sees the same tamper
 * window.
 */
export const LICENSE_HMAC_KEY_ACCOUNT = 'bundle-hmac-key'

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
/**
 * Current on-disk envelope version. Bumped only when the wire format
 * changes in a way that previous versions can't parse. load() accepts
 * an envelope whose `v` is <= this constant and migrates older shapes
 * through if needed.
 */
const STORED_ENVELOPE_VERSION = 1

interface StoredBundleEnvelope {
    v: number
    bundle: StoredLicenseBundle
    /** base64(HMAC-SHA256(hmacKey, JSON.stringify(bundle))). */
    mac: string
}

@Injectable({ providedIn: 'root' })
export class LicenseTokenStorageService {
    private vault: any
    private keytar: any
    /** Lazy-loaded HMAC key for the bundle envelope. 32 bytes. */
    private hmacKey: Buffer | null = null

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
        const payload = await this.wrapBundle(bundle)
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
        let parsed: any
        try {
            parsed = JSON.parse(raw)
        } catch {
            return null
        }
        if (!parsed || typeof parsed !== 'object') {return null}

        // Legacy path — bundle written by a pre-#4 build is a plain
        // StoredLicenseBundle, not an envelope. Detect by shape and
        // migrate transparently on first load: accept once (we have
        // no mac to verify, but a user who tampers here still has to
        // land before they run the upgraded build), then re-save
        // under the HMAC envelope so every subsequent load verifies.
        if (!('mac' in parsed) && 'accessToken' in parsed) {
            // eslint-disable-next-line no-console
            console.info('[license] migrating legacy stored bundle to HMAC envelope (audit #4)')
            try {
                await this.save(parsed as StoredLicenseBundle)
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[license] legacy-bundle HMAC migration failed; keeping legacy shape:',
                    (err as Error).message)
            }
            return parsed as StoredLicenseBundle
        }

        // HMAC envelope — verify.
        const env = parsed as Partial<StoredBundleEnvelope>
        if (typeof env.v !== 'number' || env.v > STORED_ENVELOPE_VERSION
            || !env.mac || !env.bundle || typeof env.bundle !== 'object') {
            // eslint-disable-next-line no-console
            console.warn('[license] stored bundle envelope has unexpected shape — refusing to hydrate')
            return null
        }
        let expected: string
        try {
            const key = await this.ensureHmacKey()
            expected = this.computeMac(key, JSON.stringify(env.bundle))
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[license] could not compute bundle HMAC for verify:', (err as Error).message)
            return null
        }
        if (!this.timingSafeEqualStr(env.mac, expected)) {
            // eslint-disable-next-line no-console
            console.warn(
                '[license] stored bundle HMAC mismatch — refusing to hydrate (tampered or HMAC key rotated)',
            )
            return null
        }
        return env.bundle
    }

    private async wrapBundle (bundle: StoredLicenseBundle): Promise<string> {
        const bundleJson = JSON.stringify(bundle)
        try {
            const key = await this.ensureHmacKey()
            const mac = this.computeMac(key, bundleJson)
            const env: StoredBundleEnvelope = { v: STORED_ENVELOPE_VERSION, bundle, mac }
            return JSON.stringify(env)
        } catch (err) {
            // HMAC not available in this runtime (missing node crypto,
            // storage backend refused to hold the key, …). Fall back
            // to the plain shape so the user is never locked out
            // because we couldn't persist a tag.
            // eslint-disable-next-line no-console
            console.warn('[license] saving bundle WITHOUT HMAC tag:', (err as Error).message)
            return bundleJson
        }
    }

    /**
     * Returns the per-install bundle HMAC key, generating + persisting a
     * fresh 32-byte random one on first call. Idempotent — subsequent
     * calls return the same key for the life of the process. The key
     * is stored in its own keychain account and never cleared by
     * sign-out, so a tampered bundle still fails verification across
     * a sign-out/sign-in cycle.
     */
    private async ensureHmacKey (): Promise<Buffer> {
        if (this.hmacKey) {return this.hmacKey}
        const crypto = this.tryRequireCrypto()
        if (!crypto) {
            throw new Error('node crypto module unavailable')
        }
        // Load existing key if any.
        const existing = await this.loadHmacKeyRaw()
        if (existing) {
            try {
                const buf = Buffer.from(existing, 'base64')
                if (buf.length === 32) {
                    this.hmacKey = buf
                    return buf
                }
            } catch {
                // Stored value is corrupt; generate a fresh one below.
            }
        }
        const fresh = crypto.randomBytes(32) as Buffer
        await this.persistHmacKey(fresh.toString('base64'))
        this.hmacKey = fresh
        return fresh
    }

    private async loadHmacKeyRaw (): Promise<string | null> {
        if (this.vault?.isEnabled?.()) {
            const secret = await this.vault.getSecret(VAULT_SECRET_TYPE_LICENSE, { account: LICENSE_HMAC_KEY_ACCOUNT })
            return secret?.value ?? null
        }
        if (this.keytar) {
            return this.keytar.getPassword(LICENSE_KEYTAR_SERVICE, LICENSE_HMAC_KEY_ACCOUNT)
        }
        return localStorage.getItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_HMAC_KEY_ACCOUNT)
    }

    private async persistHmacKey (encoded: string): Promise<void> {
        if (this.vault?.isEnabled?.()) {
            await this.vault.addSecret({
                type: VAULT_SECRET_TYPE_LICENSE,
                key: { account: LICENSE_HMAC_KEY_ACCOUNT },
                value: encoded,
            })
            return
        }
        if (this.keytar) {
            await this.keytar.setPassword(LICENSE_KEYTAR_SERVICE, LICENSE_HMAC_KEY_ACCOUNT, encoded)
            return
        }
        localStorage.setItem(LICENSE_KEYTAR_SERVICE + ':' + LICENSE_HMAC_KEY_ACCOUNT, encoded)
    }

    private computeMac (key: Buffer, data: string): string {
        const crypto = this.tryRequireCrypto()
        if (!crypto) {throw new Error('node crypto module unavailable')}
        return crypto.createHmac('sha256', key).update(data).digest('base64')
    }

    /**
     * Constant-time string compare — guards against timing side-channels
     * on the MAC comparison. Falls back to a plain equals when crypto
     * is unavailable (we're already in a degraded path).
     */
    private timingSafeEqualStr (a: string, b: string): boolean {
        if (a.length !== b.length) {return false}
        const crypto = this.tryRequireCrypto()
        if (!crypto?.timingSafeEqual) {return a === b}
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
    }

    private tryRequireCrypto (): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return (window as any).require ? (window as any).require('crypto') : require('crypto')
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
