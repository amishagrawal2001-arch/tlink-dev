import { Inject, Injectable, OnDestroy, Optional } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import {
    TlinkLicenseConfig,
    TLINK_LICENSE_CONFIG,
    DEFAULT_LICENSE_CONFIG,
} from './tlink-license.config'
import {
    LicenseStatus,
    LicenseType,
    BillingType,
    LicenseInfo,
    LicenseEnvelope,
    HeartbeatEnvelope,
    ActivationResult,
    ServerTestResult,
    ReasonCode,
} from './models/license.models'
import { FingerprintService } from './services/fingerprint.service'
import { LicenseTokenStorageService, StoredLicenseBundle } from './services/tokenStorage.service'

const STORAGE_KEY_SERVER_URL = 'tlink-license-server-url'
const STORAGE_KEY_PRODUCT_CODE = 'tlink-license-product-code'
// Last signed-in email — kept in localStorage (NOT the keychain) so the
// Settings UI can pre-fill the email field after a restart even when the
// keychain bundle was cleared (offline grace expired, refresh failed, user
// signed out). Passwords are deliberately NEVER persisted.
const STORAGE_KEY_LAST_EMAIL = 'tlink-license-last-email'

@Injectable({ providedIn: 'root' })
export class TlinkLicenseService implements OnDestroy {

    // ─── Public state (observable via licenseInfo$) ────────────────────────

    licenseStatus: LicenseStatus = 'unknown'
    userEmail: string | null = null
    licenseType: LicenseType | null = null
    billingType: BillingType | null = null
    deviceId: string | null = null
    licenseId: string | null = null
    startDate: string | null = null
    endDate: string | null = null
    accessExpiresAt = 0                     // ms epoch
    refreshExpiresAt = 0                    // ms epoch
    lastReasonCode: ReasonCode | null = null
    lastServerContactAt: Date | null = null
    offlineGrace = false
    /** ms epoch when a local trial started (null if not on trial). */
    trialStartAt: number | null = null
    /** True while running on the local trial (no server session). */
    isLocalTrial = false

    /** Reactive license state stream. */
    private readonly info$ = new BehaviorSubject<LicenseInfo>(this.snapshot())
    readonly licenseInfo$: Observable<LicenseInfo> = this.info$.asObservable()

    // ─── Private state ────────────────────────────────────────────────────

    private readonly config: Required<TlinkLicenseConfig>
    private accessToken: string | null = null
    private refreshToken: string | null = null
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null
    private refreshTimer: ReturnType<typeof setTimeout> | null = null

    // Heartbeat observability — exposed via getters so the Settings UI can
    // surface "your client has heartbeated N times, last at T, status OK".
    // Helps users (and us) confirm the license server is reachable on
    // schedule without poking through dev-tools logs.
    private heartbeatCount = 0
    private heartbeatSuccessCount = 0
    private heartbeatFailureCount = 0
    private heartbeatLastAt: Date | null = null
    private heartbeatLastStatus: 'ok' | 'unreachable' | 'invalid' | null = null
    private heartbeatLastReason: ReasonCode | null = null
    private heartbeatLastDurationMs: number | null = null
    private heartbeatLastError: string | null = null
    /**
     * Set to true when the server returns 422 with a "missing email" /
     * "missing password" detail — indicating the heartbeat endpoint is
     * actually a re-authentication endpoint (AWS API-Gateway shape) and
     * doesn't support token-only check-ins. Once flipped, we stop the
     * timer and skip future ticks; the user stays signed in on the
     * tokens they got at activate-time. They'll need to sign in again
     * if those expire / get revoked.
     */
    private heartbeatDisabledByServer = false

    /**
     * When each plugin webpack-bundles its own copy of this file (tlink-core
     * and tlink-settings both import via relative path), Angular's DI creates
     * separate class identities and therefore separate singletons. The first
     * instance to boot registers itself on globalThis; subsequent instances
     * mirror state from it and forward mutating calls. Eliminates the "two
     * instances" bug without restructuring package boundaries.
     */
    private proxy: TlinkLicenseService | null = null

    constructor (
    @Optional() @Inject(TLINK_LICENSE_CONFIG) config: TlinkLicenseConfig | null,
        private fingerprint: FingerprintService,
        private storage: LicenseTokenStorageService,
    ) {
        this.config = { ...DEFAULT_LICENSE_CONFIG, ...(config ?? {}) } as Required<TlinkLicenseConfig>

        // eslint-disable-next-line no-undef, @typescript-eslint/no-explicit-any
        const g = globalThis as any
        const primary = g.__tlinkLicenseServicePrimary as TlinkLicenseService | undefined
        if (primary && primary !== this) {
            // Secondary instance: shadow the primary's state, forward writes.
            this.proxy = primary
            const apply = (info: LicenseInfo) => {
                this.licenseStatus = info.status
                this.userEmail = info.userEmail
                this.licenseType = info.licenseType
                this.billingType = info.billingType
                this.deviceId = info.deviceId
                this.licenseId = info.licenseId
                this.startDate = info.startDate
                this.endDate = info.endDate
                this.lastReasonCode = info.lastReasonCode
                this.lastServerContactAt = info.lastServerContactAt
                this.offlineGrace = info.offlineGrace
                this.isLocalTrial = info.isLocalTrial
                this.info$.next(info)
            }
            apply(primary.getLicenseInfo())
            primary.licenseInfo$.subscribe(apply)
        } else {
            g.__tlinkLicenseServicePrimary = this
        }
    }

    ngOnDestroy (): void {
        this.stopTimers()
    }

    // ─── HTTP logging helper ──────────────────────────────────────────────
    //
    // Every license API call goes through this wrapper so we get a consistent
    // DevTools console view:
    //   [license:http] → POST http://.../activate  {email, product_code, …}
    //   [license:http] ← 200 POST /activate        {license_status: VALID, …}
    // Passwords and tokens are redacted.

    // Field names whose value we always scrub before logging. Checked
    // case-insensitively; a `==` token/secret suffix also matches so things
    // like `access_token`, `refreshToken`, `api_key`, `client_secret` all
    // get caught regardless of casing/separator.
    private static readonly SENSITIVE_KEYS = [
        'password',
        'refresh_token',
        'access_token',
        'token',
        'authorization',
        'secret',
        'api_key',
        'apikey',
        'client_secret',
    ]

    private isSensitiveKey (k: string): boolean {
        const kk = k.toLowerCase().replace(/[-_]/g, '')
        return TlinkLicenseService.SENSITIVE_KEYS.some(s => kk === s.replace(/[-_]/g, '') || kk.endsWith(s.replace(/[-_]/g, '')))
    }

    private redactBody (body: any): any {
        return this.redactValue(body, 0)
    }

    /**
     * Recursively clones `value`, replacing any property whose key is
     * sensitive with a stub. Depth-capped (8 levels) so a pathological
     * payload can't spin us. Arrays and primitives pass through unchanged
     * except for element-level recursion.
     */
    private redactValue (value: any, depth: number): any {
        if (depth > 8 || value === null || value === undefined) {return value}
        if (Array.isArray(value)) {return value.map(v => this.redactValue(v, depth + 1))}
        if (typeof value !== 'object') {return value}
        const out: any = {}
        for (const k of Object.keys(value)) {
            if (this.isSensitiveKey(k)) {
                const v = value[k]
                if (k.toLowerCase().includes('refresh_token') && typeof v === 'string' && v.length > 12) {
                    // Preserve a short prefix so log readers can correlate two
                    // events referencing the same token without exposing the secret.
                    out[k] = v.slice(0, 12) + '…'
                } else if (k.toLowerCase() === 'authorization' && typeof v === 'string') {
                    out[k] = 'Bearer ***'
                } else {
                    out[k] = '***'
                }
            } else {
                out[k] = this.redactValue(value[k], depth + 1)
            }
        }
        return out
    }

    private redactHeaders (headers: Record<string, string> = {}): Record<string, string> {
        const copy: Record<string, string> = {}
        for (const k of Object.keys(headers)) {
            copy[k] = this.isSensitiveKey(k) ? (k.toLowerCase() === 'authorization' ? 'Bearer ***' : '***') : headers[k]
        }
        return copy
    }

    private async loggedFetch (label: string, url: string, init: RequestInit = {}): Promise<any> {
        const method = init.method ?? 'GET'
        const reqBody = init.body ? JSON.parse(init.body as string) : undefined
        // eslint-disable-next-line no-console
        console.info(
            `%c[license:http] → ${method} ${label}`,
            'color:#3b82f6;font-weight:600',
            { url, headers: this.redactHeaders(init.headers as any), body: this.redactBody(reqBody) },
        )
        const t0 = Date.now()
        try {
            const res = await fetch(url, init)
            const bodyText = await res.text()
            let body: any = bodyText
            try { body = JSON.parse(bodyText) } catch { /* non-JSON */ }
            const ms = Date.now() - t0
            // eslint-disable-next-line no-console
            console.info(
                `%c[license:http] ← ${res.status} ${method} ${label} (${ms}ms)`,
                res.ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600',
                this.redactBody(body),
            )
            // Reconstruct a Response-like object so callers can .json()/.ok it.
            return {
                ok: res.ok,
                status: res.status,
                json: async () => body,
                text: async () => bodyText,
            }
        } catch (e: any) {
            const ms = Date.now() - t0
            // eslint-disable-next-line no-console
            console.error(
                `%c[license:http] ✗ ${method} ${label} (${ms}ms)`,
                'color:#dc2626;font-weight:600',
                e?.message ?? e,
            )
            throw e
        }
    }

    // ─── Config / URL ─────────────────────────────────────────────────────

    get serverUrl (): string {
        return localStorage.getItem(STORAGE_KEY_SERVER_URL) ?? this.config.serverUrl
    }

    set serverUrl (url: string) {
        localStorage.setItem(STORAGE_KEY_SERVER_URL, url)
    }

    /**
     * Product code sent to the license server during activate / validate.
     * Editable at runtime via the Settings UI so a user whose tenant uses
     * a non-default product slug doesn't have to rebuild the app to fix
     * a `PRODUCT_NOT_ENTITLED` rejection. Falls back to the build-time
     * default in `TlinkLicenseConfig`.
     */
    get productCode (): string {
        const stored = localStorage.getItem(STORAGE_KEY_PRODUCT_CODE)?.trim()
        return stored || this.config.productCode
    }

    set productCode (code: string) {
        const trimmed = (code || '').trim()
        if (trimmed) {
            localStorage.setItem(STORAGE_KEY_PRODUCT_CODE, trimmed)
        } else {
            localStorage.removeItem(STORAGE_KEY_PRODUCT_CODE)
        }
    }

    /**
     * Last email a user successfully signed in with. Persisted to
     * localStorage so the Settings → License email field can pre-fill on
     * restart, even if the secured token bundle was cleared (offline grace
     * expired, sign-out, etc.). Empty string when nothing has been stored.
     *
     * Passwords are NEVER persisted — that's a deliberate boundary, not an
     * oversight. The user types the password each session.
     */
    get lastSignInEmail (): string {
        return localStorage.getItem(STORAGE_KEY_LAST_EMAIL) ?? ''
    }

    private rememberSignInEmail (email: string): void {
        const trimmed = (email || '').trim()
        if (trimmed) {
            localStorage.setItem(STORAGE_KEY_LAST_EMAIL, trimmed)
        }
    }

    /**
     * Derive the API root + URL shape from the configured server URL.
     *
     * The AWS deployment puts the licenses resource under the API root
     * (`${apiRoot}/licenses/<action>`) but the health probe at the API
     * root itself (`${apiRoot}/health`, NOT under `/licenses`). The
     * local Express server keeps both under `/api/...`. So we need a
     * single "API root" anchor that the rest of the URL builders hang
     * off, regardless of which form the user pasted.
     *
     * Three base-URL shapes:
     *
     *   1. **Bare host / legacy** — `http://localhost:4000`,
     *      `https://license.example.com`. No path or just `/`. The
     *      whole URL is the API root; license + health paths are
     *      prefixed with `/api/...` to match the local Express server.
     *
     *   2. **API root** — `https://…/dev/api/v1`. Path present but no
     *      `/licenses` segment. The base IS the API root; license is
     *      `${base}/licenses/<action>`, health is `${base}/health`.
     *
     *   3. **Licenses-rooted** — `https://…/dev/api/v1/licenses` (with
     *      or without trailing slash). The user pasted past the API
     *      root, so we strip `/licenses` to get back to it. Final URLs
     *      match case 2.
     */
    private classifyBase (base: string): 'bare' | 'versioned' | 'licenses' {
        // Pull the path component without depending on `URL` (which
        // throws on invalid inputs). Strip scheme + authority.
        const m = /^(?:[a-z][a-z0-9+.\-]*:\/\/)?[^/]*(\/.*)?$/i.exec(base)
        const path = (m?.[1] ?? '').replace(/\/+$/, '')
        if (/\/licenses(\/|$)/i.test(path)) return 'licenses'
        if (path && path !== '/') return 'versioned'
        return 'bare'
    }

    /**
     * Strip a trailing `/licenses` segment so cases (2) and (3) collapse
     * to the same API root. For case (1) the base IS the API root.
     */
    private apiRootFromBase (base: string): string {
        const kind = this.classifyBase(base)
        if (kind === 'licenses') return base.replace(/\/licenses$/i, '')
        return base
    }

    private trimmedServerUrl (): string {
        return this.serverUrl.trim().replace(/\/+$/, '')
    }

    /**
     * Build the URL for a license action (`activate`, `deactivate`,
     * `refresh`, `heartbeat`, `validate`, `public-key`).
     *
     * Action-name translation for cloud bases: the AWS API-Gateway
     * server exposes a single `/validate` endpoint that handles both
     * the initial activate-with-credentials call AND the token-refresh
     * call (the request body distinguishes them — credentials vs
     * refresh_token). The local Express server splits these into
     * separate `/activate` and `/refresh` paths.
     *
     * Map both `activate` and `refresh` → `validate` when the base is
     * anything other than a bare host so callers stay shape-agnostic.
     * The response is the same `LicenseEnvelope` shape either way.
     *
     * `heartbeat` and `deactivate` aren't aliased because we don't
     * know yet whether AWS exposes them; if they 404 / 405 we'll
     * extend this map then.
     */
    private translateActionForBase (action: string, kind: 'bare' | 'versioned' | 'licenses'): string {
        // AWS API Gateway exposes a single /validate endpoint that handles
        // initial activation, token refresh, AND periodic heartbeat —
        // distinguishing them by request-body shape. Calling /heartbeat
        // there returns 422 ("Unprocessable Content") because the route
        // doesn't exist (or the validator rejects the bare body).
        if (kind !== 'bare' && (action === 'refresh' || action === 'activate' || action === 'heartbeat')) {
            return 'validate'
        }
        return action
    }

    licenseEndpoint (action: string): string {
        const base = this.trimmedServerUrl()
        const kind = this.classifyBase(base)
        const apiRoot = this.apiRootFromBase(base)
        const cleanAction = this.translateActionForBase(
            String(action).replace(/^\/+/, ''),
            kind
        )
        if (kind === 'bare') return `${apiRoot}/api/licenses/${cleanAction}`
        return `${apiRoot}/licenses/${cleanAction}`
    }

    /**
     * Build the URL for the server health probe. AWS exposes health at
     * the API root (`${apiRoot}/health`, NOT under `/licenses`); local
     * Express server exposes `/api/health` directly off the host. Both
     * collapse via apiRootFromBase().
     */
    healthEndpoint (overrideBase?: string): string {
        const raw = (overrideBase ?? this.serverUrl).trim().replace(/\/+$/, '')
        const kind = this.classifyBase(raw)
        const apiRoot = this.apiRootFromBase(raw)
        if (kind === 'bare') return `${apiRoot}/api/health`
        return `${apiRoot}/health`
    }

    // ─── Bootstrap (call from app startup) ────────────────────────────────

    /**
     * Called once on app start. Tries to restore a valid session from keychain;
     * falls back to `unauthenticated` if none exists. The host app should then
     * show the activation dialog and call `activateLicense()` if needed.
     *
     * Returns the resolved LicenseStatus so the caller can hard-block.
     */
    async bootstrap (): Promise<LicenseStatus> {
        if (this.proxy) {return this.proxy.bootstrap()}

        // Fire-and-forget — pin the RSA public key for offline activation codes
        // while we (probably) have network. Next launch can redeem a code even
        // if the server is blocked by firewall/VPN.
        this.seedOfflinePublicKeyFromServer().catch(() => { /* best-effort */ })

        const bundle = await this.storage.load()

        // Fast path: real license bundle exists — try to refresh against server.
        if (bundle) {
            this.hydrateFromBundle(bundle)

            const envelope = await this.callRefresh()
            if (envelope?.license_status === 'VALID') {
                this.applyEnvelope(envelope)
                // Re-persist so the fresh tokens + (now server-sourced) email
                // make it back to the keychain. Self-heals bundles written by
                // older builds that didn't carry userEmail.
                await this.persist()
                this.scheduleRefresh()
                this.startHeartbeat()
                return this.licenseStatus
            }

            // Server contact failed (unreachable / not VALID).
            // Within grace window we stay active on cached state.
            const withinGrace = this.isWithinGrace(bundle.lastServerContactAt)
            if (withinGrace) {
                this.offlineGrace = true
                this.licenseStatus = 'active'
                this.emit()
                this.startHeartbeat()
                return this.licenseStatus
            }

            // Grace expired AND server either unreachable or said INVALID.
            // A known-paid user doesn't fall back to trial — that would be the
            // same loophole we already closed on sign-out. Go straight to the
            // correct error state and preserve the real reason so the UI can
            // show "device limit reached" / "seat revoked" / etc. instead of a
            // generic "trial expired".
            await this.storage.clear()
            this.reset()
            if (envelope) {
                this.licenseStatus = envelope.reason_code === 'LICENSE_EXPIRED' ? 'expired' : 'invalid'
                this.lastReasonCode = envelope.reason_code
            } else {
                this.licenseStatus = 'unauthenticated'
                this.lastReasonCode = null
            }
            this.emit()
            return this.licenseStatus
        }

        // No prior bundle: first-time user path → trial.
        return this.resolveTrial()
    }

    /**
     * Decides what to do when there's no server-issued license. Either starts
     * a fresh 30-day trial, continues an in-progress one, or (if the trial
     * already expired on a previous launch) blocks with status = expired.
     */
    private async resolveTrial (): Promise<LicenseStatus> {
        let startMs = await this.storage.loadTrialStart()
        if (startMs === null) {
            startMs = Date.now()
            await this.storage.saveTrialStart(startMs)
        }
        this.trialStartAt = startMs

        const remaining = this.trialDaysRemaining
        if (remaining > 0) {
            // Enter trial: full features (TRIAL + INDIVIDUAL, server-equivalent).
            this.isLocalTrial = true
            this.billingType = 'TRIAL'
            this.licenseType = 'INDIVIDUAL'
            this.startDate = new Date(startMs).toISOString().slice(0, 10)
            this.endDate = new Date(startMs + this.config.trialDurationDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            this.licenseStatus = 'active'
            this.emit()
            return this.licenseStatus
        }

        // Trial elapsed — block until sign-in.
        this.isLocalTrial = false
        this.licenseStatus = 'expired'
        this.lastReasonCode = 'LICENSE_EXPIRED'
        this.emit()
        return this.licenseStatus
    }

    /**
     * Whole days left in the local trial, or 0 if not on trial / expired.
     * Floor (not ceil) so "1d left" never over-promises: if only 40 minutes
     * remain, we show 0 and let the UI nudge with "less than a day".
     */
    get trialDaysRemaining (): number {
        if (!this.trialStartAt) {return 0}
        const endMs = this.trialStartAt + this.config.trialDurationDays * 24 * 60 * 60 * 1000
        return Math.max(0, Math.floor((endMs - Date.now()) / (24 * 60 * 60 * 1000)))
    }

    /**
     * Hours left in the trial — for the "< 1 day" edge case where the day
     * counter has already hit 0 but we haven't actually expired yet. Callers
     * should show this when `trialDaysRemaining === 0` and the trial is still
     * technically running, so users get a last-chance warning instead of an
     * abrupt flip.
     */
    get trialHoursRemaining (): number {
        if (!this.trialStartAt) {return 0}
        const endMs = this.trialStartAt + this.config.trialDurationDays * 24 * 60 * 60 * 1000
        return Math.max(0, Math.ceil((endMs - Date.now()) / (60 * 60 * 1000)))
    }

    /**
     * Public accessor for this machine's fingerprint hash. Used by the Settings
     * UI to show users a copy-able value they can send to their admin so an
     * offline activation code can be minted *bound to this specific device*.
     * Returns null until the first compute completes; UI should handle that
     * by falling back to "—" until it resolves.
     */
    getDeviceFingerprint (): Promise<string> {
        if (this.proxy) {return this.proxy.getDeviceFingerprint()}
        return this.fingerprint.get()
    }

    // ─── Public API ───────────────────────────────────────────────────────

    async activateLicense (email: string, password: string): Promise<ActivationResult> {
        if (this.proxy) {return this.proxy.activateLicense(email, password)}
        if (!email.trim() || !password) {
            return { success: false, message: 'Email and password are required' }
        }

        const fp = await this.fingerprint.get()
        const body = {
            email: email.trim(),
            password,
            product_code: this.productCode,
            device_fingerprint_hash: fp,
            platform: this.fingerprint.getPlatform(),
            os_version: this.fingerprint.getOsVersion(),
            app_version: this.config.appVersion,
            mac_address: this.fingerprint.getPrimaryMac(),
        }

        try {
            const res = await this.loggedFetch('licenses/activate', this.licenseEndpoint('activate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const envelope = this.normalizeEnvelope(await res.json())

            if (envelope.license_status === 'VALID') {
                this.userEmail = email.trim()
                // Remember the email separately (localStorage, not keychain)
                // so the Settings UI can pre-fill it on next launch even if
                // the secured bundle gets wiped. Saved BEFORE applyEnvelope
                // so a downstream failure can't lose this UX win.
                this.rememberSignInEmail(this.userEmail)
                // Suppress the trial UI in this session, but leave the trial
                // marker on disk. The 30-day clock counts from install time —
                // not from the current session — so a sign-out / re-login cycle
                // can't mint a fresh trial window.
                this.isLocalTrial = false
                this.applyEnvelope(envelope)
                await this.persist()
                this.scheduleRefresh()
                this.startHeartbeat()
                return { success: true, message: 'Activation successful', reasonCode: 'OK' }
            }

            this.lastReasonCode = envelope.reason_code
            this.emit()
            return { success: false, message: this.humanReason(envelope.reason_code), reasonCode: envelope.reason_code }
        } catch (e: any) {
            // Network error — distinguish from server-returned INVALID so the
            // user knows the app works on trial and where to look next.
            const onTrial = this.isLocalTrial && this.trialDaysRemaining > 0
            const trialHint = onTrial
                ? ` Your ${this.trialDaysRemaining}-day trial is still active.`
                : ''
            return {
                success: false,
                message:
                    `Cannot reach the license server at ${this.serverUrl}. ` +
                    `Check your network, VPN, or firewall — if your organisation blocks outbound HTTP, ` +
                    `ask your admin for an offline activation code.${trialHint}`,
            }
        }
    }

    /**
     * User-triggered refresh from the License management UI. Hits
     * `/api/licenses/refresh` right now (instead of waiting for the ~13-minute
     * preemptive timer), re-applies the envelope, re-schedules the next
     * refresh, and reports the outcome for the caller to toast.
     */
    /**
     * Self-service: lists the signed-in user's own devices (all products).
     * Uses the license access token — not the admin token — so a regular
     * end-user can see their own seats without admin help.
     * On 401 we try one inline refresh; if still 401, the session is truly
     * dead and we drop to unauthenticated so the user is prompted to re-sign-in.
     */
    async listMyDevices (): Promise<any[]> {
        if (this.proxy) {return this.proxy.listMyDevices()}
        if (!this.accessToken) {return []}
        const res = await this.authedFetch('/api/licenses/devices', { method: 'GET' })
        if (!res || !res.ok) {return []}
        try {
            const body = await res.json()
            return (body?.devices) || []
        } catch {
            return []
        }
    }

    /**
     * Self-service: deactivate one of the user's own devices.
     * Returns true on success. Not reversible. Same 401-then-refresh-then-drop
     * behaviour as listMyDevices().
     */
    async deactivateMyDevice (activationId: string): Promise<boolean> {
        if (this.proxy) {return this.proxy.deactivateMyDevice(activationId)}
        if (!this.accessToken) {return false}
        const res = await this.authedFetch(`/api/licenses/devices/${activationId}/deactivate`, {
            method: 'POST',
        })
        return !!res?.ok
    }

    /**
     * Wraps loggedFetch with "one retry after token refresh" semantics for
     * access-token-only endpoints. If the call returns 401 we attempt a
     * refresh; if the refresh succeeds we retry once with the new token. If
     * it still fails, we treat the session as dead and call handleInvalid()
     * so the UI bounces back to sign-in. Network errors return null.
     */
    private async authedFetch (path: string, init: any): Promise<Response | null> {
        const doCall = async () => {
            const headers = { ...(init.headers || {}), Authorization: `Bearer ${this.accessToken ?? ''}` }
            // Map legacy `/api/licenses/<action>` paths through licenseEndpoint
            // so a pre-rooted serverUrl (e.g. AWS API Gateway base ending in
            // `/api/v1/licenses/`) doesn't double the `/api/licenses/` segment.
            // Anything that doesn't match falls back to raw concatenation,
            // which preserves behavior for non-licenses paths if any are
            // added later.
            const m = /^\/api\/licenses\/(.+)$/.exec(path)
            const url = m
                ? this.licenseEndpoint(m[1])
                : `${this.trimmedServerUrl()}${path.startsWith('/') ? path : `/${path}`}`
            return this.loggedFetch(path, url, { ...init, headers })
        }
        try {
            let res = await doCall()
            if (res.status !== 401) {return res}
            const refreshed = await this.callRefresh()
            if (refreshed?.license_status === 'VALID') {
                this.applyEnvelope(refreshed)
                await this.persist()
                res = await doCall()
                if (res.status !== 401) {return res}
            }
            // Still 401 after refresh (or refresh itself failed). Session is dead.
            await this.handleInvalid(refreshed?.reason_code ?? 'INVALID_CREDENTIALS')
            return null
        } catch {
            return null
        }
    }

    async refreshLicense (): Promise<ActivationResult> {
        if (this.proxy) {return this.proxy.refreshLicense()}
        if (!this.refreshToken) {
            return { success: false, message: 'Not signed in — nothing to refresh.' }
        }
        const envelope = await this.callRefresh()
        if (!envelope) {
            return { success: false, message: 'License server unreachable.' }
        }
        if (envelope.license_status === 'VALID') {
            this.applyEnvelope(envelope)
            await this.persist()
            this.scheduleRefresh()
            return { success: true, message: 'License refreshed.', reasonCode: 'OK' }
        }
        // INVALID — mirror the behaviour of an adverse heartbeat so the user
        // is forced back to the sign-in gate cleanly.
        await this.handleInvalid(envelope.reason_code)
        return { success: false, message: this.humanReason(envelope.reason_code), reasonCode: envelope.reason_code }
    }

    async deactivateLicense (skipServerCall = false): Promise<void> {
        if (this.proxy) {return this.proxy.deactivateLicense(skipServerCall)}
        // Best-effort server-side deactivate. If it fails (no network, expired
        // token), we still clear local state so the user can sign in again.
        // skipServerCall=true when the caller already deactivated this device
        // via /devices/:id/deactivate — the token is no longer valid for the
        // device-scoped /deactivate endpoint and calling it returns 403.
        if (!skipServerCall) {
            try {
                const fp = await this.fingerprint.get()
                const res = await this.loggedFetch('licenses/deactivate', this.licenseEndpoint('deactivate'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accessToken ?? ''}` },
                    body: JSON.stringify({ device_fingerprint_hash: fp }),
                })
                if (!res.ok) {
                    // Log — local state still clears below, but support wants to see WHY
                    // a deactivate was rejected (expired token vs revoked seat vs server 5xx).
                    // eslint-disable-next-line no-console
                    console.warn(`[license] server-side deactivate returned ${res.status}; clearing local state anyway`)
                }
            } catch (err) {
                // Network error — same: log and keep going.
                // eslint-disable-next-line no-console
                console.warn('[license] server-side deactivate failed (network):', (err as Error).message)
            }
        }
        this.stopTimers()
        await this.storage.clear()
        this.reset()
        // Intentional sign-out → go straight to unauthenticated. We don't
        // resume the local trial here: trial is for first-time users who've
        // never signed in, not a fallback for a paid user who just signed out.
        this.licenseStatus = 'unauthenticated'
        this.emit()
    }

    /** True when the app should refuse to operate (hard-block). */
    get shouldBlockApp (): boolean {
        return this.licenseStatus !== 'active'
    }

    /** True when a trial banner should be shown. */
    get showTrialBanner (): boolean {
        return this.licenseStatus === 'active' && this.billingType === 'TRIAL'
    }

    /**
     * Feature gate. TRIAL and TEAM always allow. PAID + INDIVIDUAL only allows
     * features not listed in `teamOnlyFeatures`.
     */
    isFeatureAvailable (feature: string): boolean {
        if (this.licenseStatus !== 'active') {return false}
        if (this.billingType === 'TRIAL') {return true}
        if (this.licenseType === 'TEAM') {return true}
        // PAID + INDIVIDUAL:
        return !this.config.teamOnlyFeatures.includes(feature)
    }

    async testServerConnection (url?: string): Promise<ServerTestResult> {
        if (this.proxy) {return this.proxy.testServerConnection(url)}
        const healthUrl = this.healthEndpoint(url)
        const t0 = Date.now()
        try {
            const res = await this.loggedFetch('health', healthUrl, { method: 'GET' })
            const latencyMs = Date.now() - t0
            if (res.ok) {return { reachable: true, message: 'Server reachable', latencyMs }}
            return { reachable: false, message: `HTTP ${res.status}` }
        } catch (e: any) {
            return { reachable: false, message: e?.message || 'Connection failed' }
        }
    }

    getLicenseInfo (): LicenseInfo {
        return this.snapshot()
    }

    // ─── Offline activation code ─────────────────────────────────────────
    //
    // Flow:
    //   1. Admin mints a code: POST /api/users/:id/entitlements/:entId/offline-code
    //   2. Admin delivers the code out-of-band (email, Slack, QR, USB)
    //   3. User pastes it into the activation dialog -> redeemOfflineCode()
    //   4. Client verifies the RS256 signature against the server's public key
    //      (fetched once from /api/licenses/public-key and cached) and applies
    //      the entitlement locally. No network required after step 3.

    private static readonly OFFLINE_KEY_STORAGE = 'tlink-license-offline-public-key'

    /**
     * Returns the RSA public key used to verify offline activation blobs.
     *
     * Offline activation is for users who CAN'T reach the license server, so
     * the key can't come from the server at redeem time. Priority:
     *   1. `config.offlinePublicKey` — baked in at build time (production).
     *   2. localStorage seed — in dev, we allow a one-time fetch so devs don't
     *      need to paste the PEM into config. Never relied on in prod.
     */
    private getOfflinePublicKey (): string | null {
        const fromConfig = this.config.offlinePublicKey
        if (fromConfig && fromConfig.includes('BEGIN PUBLIC KEY')) {return fromConfig}
        try {
            const seeded = localStorage.getItem(TlinkLicenseService.OFFLINE_KEY_STORAGE)
            if (seeded && seeded.includes('BEGIN PUBLIC KEY')) {return seeded}
        } catch { /* localStorage unavailable */ }
        return null
    }

    /**
     * Dev-convenience: if the config didn't bake in a public key, try to
     * fetch it from the license server while we have network. This only runs
     * once per install (cached in localStorage). In production deployments
     * the key should be pinned via `config.offlinePublicKey`.
     */
    private async seedOfflinePublicKeyFromServer (): Promise<void> {
        if (this.config.offlinePublicKey) {return}   // already pinned
        try {
            if (localStorage.getItem(TlinkLicenseService.OFFLINE_KEY_STORAGE)) {return}
        } catch { /* ignore */ }
        try {
            const res = await this.loggedFetch('licenses/public-key', this.licenseEndpoint('public-key'), { method: 'GET' })
            if (!res.ok) {return}
            const pem = await res.text()
            if (typeof pem === 'string' && pem.includes('BEGIN PUBLIC KEY')) {
                try { localStorage.setItem(TlinkLicenseService.OFFLINE_KEY_STORAGE, pem) } catch { /* ignore */ }
            }
        } catch { /* offline is fine — config.offlinePublicKey should be set for prod */ }
    }

    /**
     * Redeems a signed offline activation code. Verifies the RS256 signature
     * with Node's crypto module (no external JWT lib needed) and promotes the
     * local session to `active` using the claims in the blob.
     *
     * The public key is ideally pre-fetched while the user was online; if we
     * can't fetch it now and we don't have it cached, redemption fails.
     */
    async redeemOfflineCode (code: string): Promise<ActivationResult> {
        if (this.proxy) {return this.proxy.redeemOfflineCode(code)}
        const token = code.trim()
        if (!token || !token.startsWith('eyJ') || token.split('.').length !== 3) {
            return { success: false, message: 'Invalid activation code format.' }
        }

        const publicKey = this.getOfflinePublicKey()
        if (!publicKey) {
            return {
                success: false,
                message:
                    'This build of the app has no offline-verification key baked in. ' +
                    'Ask your admin for an app build that includes the public key, or ' +
                    'run the app once on a machine that can reach the license server so the key can be seeded.',
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let payload: any = null
        try {
            const crypto = (window as any).require?.('crypto') ?? require('crypto')
            const [headerB64, payloadB64, sigB64] = token.split('.')

            // Pin alg=RS256 explicitly. createVerify() will reject a mismatched
            // signature anyway, but an attacker-controlled header like
            // `{"alg":"none"}` has historically fooled lax JWT libs. Fail fast
            // and loud on any unexpected header rather than trust the verifier.
            const header = JSON.parse(Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
            if (header?.alg !== 'RS256' || header?.typ !== 'JWT') {
                return { success: false, message: 'Activation code has an unsupported signature algorithm.' }
            }

            const input = `${headerB64}.${payloadB64}`
            const signature = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
            if (signature.length === 0) {
                return { success: false, message: 'Activation code signature is missing.' }
            }
            const verifier = crypto.createVerify('RSA-SHA256')
            verifier.update(input)
            if (!verifier.verify(publicKey, signature)) {
                return { success: false, message: 'Activation code signature is invalid or tampered.' }
            }
            payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
        } catch (e: any) {
            return { success: false, message: 'Could not parse activation code: ' + (e?.message || 'unknown error') }
        }

        if (payload.typ !== 'offline') {
            return { success: false, message: 'Wrong code type — not an offline activation code.' }
        }
        const now = Math.floor(Date.now() / 1000)
        if (payload.exp && payload.exp < now) {
            return { success: false, message: 'Activation code has expired. Ask your admin for a new one.' }
        }

        // If the code was bound to a specific fingerprint, enforce it here.
        const fp = await this.fingerprint.get()
        if (payload.device_fingerprint_hash && payload.device_fingerprint_hash !== fp) {
            return { success: false, message: 'Activation code is bound to a different device.' }
        }

        // Apply claims — no tokens are issued (this is a local session). We
        // stash a synthetic "device id" and a unique "license id" so the admin
        // panel / logs still show a session. lastServerContactAt stays null so
        // the grace-period UI reflects that we've never talked to the server.
        this.userEmail = payload.email || null
        this.licenseId = String(payload.license_id ?? '')
        this.deviceId = 'offline:' + fp.slice(0, 16)
        this.licenseType = payload.license_type ?? null
        this.billingType = payload.billing_type ?? null
        this.startDate = payload.start_date ?? null
        this.endDate = payload.end_date ?? null
        this.accessToken = null
        this.refreshToken = null
        // The offline session ends when the blob itself expires.
        this.accessExpiresAt = payload.exp ? payload.exp * 1000 : 0
        this.refreshExpiresAt = 0
        this.lastReasonCode = 'OK'
        this.isLocalTrial = false
        this.licenseStatus = 'active'
        this.offlineGrace = true
        this.emit()

        // Persist so the session survives restarts (until the blob expires).
        // We stash the blob itself in place of tokens; bootstrap will re-verify
        // on next launch and re-apply or drop back to sign-in.
        try {
            await this.storage.save({
                accessToken: token,        // store the blob here so we can re-verify on load
                refreshToken: 'offline',   // sentinel — marks this as an offline session
                userEmail: this.userEmail ?? '',
                deviceId: this.deviceId,
                licenseId: this.licenseId,
                licenseType: this.licenseType,
                billingType: this.billingType,
                startDate: this.startDate,
                endDate: this.endDate,
                lastServerContactAt: 0,
            } as any)
        } catch (e) {
            // Non-fatal — the session still works for this launch.
        }

        return { success: true, message: 'Activated with offline code.', reasonCode: 'OK' }
    }

    // ─── Internal server calls ────────────────────────────────────────────

    /** Uses the stored refresh_token to obtain a fresh access/refresh pair. */
    private async callRefresh (): Promise<LicenseEnvelope | null> {
        if (!this.refreshToken) {return null}
        try {
            const fp = await this.fingerprint.get()
            const res = await this.loggedFetch('licenses/refresh', this.licenseEndpoint('refresh'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: this.refreshToken, device_fingerprint_hash: fp }),
            })
            // Same defense as callHeartbeat: a non-2xx is NOT a license-
            // revocation signal. Returning null routes the caller through
            // the unreachable / grace branches instead of clearing the
            // session. Also auto-disable refresh on the AWS shape that
            // demands credentials we don't have.
            if (!res.ok) {
                const bodyText = await res.text().catch(() => '')
                const looksLikeMissingCreds = res.status === 422 &&
                    /"loc":\s*\[\s*"body",\s*"(email|password|product_code)"/i.test(bodyText)
                if (looksLikeMissingCreds && !this.heartbeatDisabledByServer) {
                    this.heartbeatDisabledByServer = true
                    this.stopHeartbeat()
                    if (this.refreshTimer) {
                        clearTimeout(this.refreshTimer)
                        this.refreshTimer = null
                    }
                    // eslint-disable-next-line no-console
                    console.warn(
                        '%c[license:refresh] disabled — server requires full credentials (no token-only refresh)',
                        'color:#f59e0b;font-weight:700',
                        { note: 'Sticking with the access token from activate; sign in again when it expires.' })
                }
                // eslint-disable-next-line no-console
                console.error('%c[license:refresh] HTTP error — treating as transient (NOT logging out)',
                    'color:#dc2626;font-weight:700',
                    { status: res.status, body: bodyText })
                return null
            }
            return this.normalizeEnvelope(await res.json())
        } catch {
            return null
        }
    }

    private async callHeartbeat (): Promise<HeartbeatEnvelope | null> {
        // Pre-flight: missing credentials means the user isn't activated yet
        // (or activation got cleared). Surface this clearly so the user can
        // tell "heartbeat isn't running because there's no session" apart
        // from "heartbeat is running but failing".
        if (!this.accessToken || !this.deviceId || !this.licenseId) {
            // eslint-disable-next-line no-console
            console.warn('%c[license:heartbeat] skipped — no active session',
                'color:#f59e0b;font-weight:600',
                {
                    hasAccessToken: !!this.accessToken,
                    hasDeviceId: !!this.deviceId,
                    hasLicenseId: !!this.licenseId,
                    licenseStatus: this.licenseStatus,
                })
            return null
        }
        try {
            const url = this.licenseEndpoint('heartbeat')
            // When the heartbeat alias points at /validate (cloud), the
            // endpoint expects the same body shape as refresh — i.e. a
            // refresh_token. Send it always for cloud bases so AWS doesn't
            // 422 us. For bare-host (local Express server) keep the original
            // shape, only attaching refresh_token when access has expired.
            const cloudBase = this.classifyBase(this.trimmedServerUrl()) !== 'bare'
            const body: any = { device_id: this.deviceId, license_id: this.licenseId }
            if (cloudBase || this.isAccessExpired()) {
                body.refresh_token = this.refreshToken
            }
            // eslint-disable-next-line no-console
            console.info('%c[license:heartbeat] sending',
                'color:#3b82f6;font-weight:600',
                { url, accessExpired: this.isAccessExpired(), inlineRefresh: !!body.refresh_token, cloudBase })
            const res = await this.loggedFetch('licenses/heartbeat', url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.accessToken}`,
                },
                body: JSON.stringify(body),
            })
            // Hard-stop: if the HTTP layer returned non-2xx, do NOT treat
            // the body as a license envelope. A 4xx/5xx means the server
            // rejected our REQUEST shape (or had an internal error) — it's
            // NOT a license-revocation signal. Returning null routes us
            // through the "unreachable" branch which is offline-grace
            // tolerant and won't sign the user out.
            if (!res.ok) {
                const bodyText = await res.text().catch(() => '')
                // Sticky-disable detection: AWS-style /validate-as-activate
                // returns 422 with a "missing email"/"missing password"
                // body when we send token-only. The server fundamentally
                // doesn't support periodic check-ins; future ticks would
                // just produce the same noise. Stop the timer and surface
                // this clearly. Activation tokens stay valid until the
                // user signs out or restarts.
                const looksLikeMissingCreds = res.status === 422 &&
                    /"loc":\s*\[\s*"body",\s*"(email|password|product_code)"/i.test(bodyText)
                if (looksLikeMissingCreds && !this.heartbeatDisabledByServer) {
                    this.heartbeatDisabledByServer = true
                    this.stopHeartbeat()
                    // eslint-disable-next-line no-console
                    console.warn(
                        '%c[license:heartbeat] disabled — server requires full credentials (no token-only refresh)',
                        'color:#f59e0b;font-weight:700',
                        {
                            url,
                            note: 'This is the AWS /validate-as-activate shape. Heartbeat + scheduled-refresh are turned off for this session; tokens stay valid until you sign out or restart. Settings → License → "Run now" will be a no-op.',
                        })
                }
                // eslint-disable-next-line no-console
                console.error('%c[license:heartbeat] HTTP error — treating as transient (NOT logging out)',
                    'color:#dc2626;font-weight:700',
                    { status: res.status, body: bodyText })
                return null
            }
            const rawJson = await res.json()
            // Cloud /validate response is a full LicenseEnvelope, not the
            // slim HeartbeatEnvelope. normalizeHeartbeat is permissive
            // enough to pull the status + tokens out regardless.
            const envelope = this.normalizeHeartbeat(rawJson)
            // eslint-disable-next-line no-console
            console.info('%c[license:heartbeat] response',
                envelope.status === 'VALID' ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600',
                {
                    status: envelope.status,
                    reason: envelope.reason_code,
                    rotatedAccessToken: !!envelope.access_token,
                    rotatedRefreshToken: !!envelope.refresh_token,
                })
            return envelope
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error('%c[license:heartbeat] FAILED',
                'color:#dc2626;font-weight:700',
                {
                    error: e?.message || String(e),
                    name: e?.name,
                    stack: e?.stack,
                })
            return null
        }
    }

    // ─── State helpers ────────────────────────────────────────────────────

    /**
     * Normalize a license-server JSON response into the client's canonical
     * `LicenseEnvelope` shape. Different deployments use slightly different
     * field semantics:
     *
     *   - **Local Express server** returns `license_type` as the SEAT tier
     *     (`'INDIVIDUAL' | 'TEAM'`) and `billing_type` as the billing
     *     flavor (`'TRIAL' | 'PAID'`). Two distinct fields.
     *
     *   - **AWS API Gateway server** returns `license_type` as the BILLING
     *     flavor (`'PAID'`, `'TRIAL'`) and omits `billing_type` entirely.
     *     The seat tier isn't surfaced.
     *
     * Detection: if `license_type` matches a billing value AND `billing_type`
     * is absent, swap them. Default the missing seat tier to `INDIVIDUAL`
     * since the AWS server doesn't surface team-vs-individual yet — team-
     * only feature flags will gate appropriately on `isFeatureAvailable()`.
     *
     * Also coerces `reason_code: null` → 'OK' when status is VALID so the
     * downstream `lastReasonCode` field stays typed.
     */
    private normalizeEnvelope (raw: any): LicenseEnvelope {
        const r = raw && typeof raw === 'object' ? raw : {}
        const licenseTypeRaw = r.license_type ?? null
        const billingTypeRaw = r.billing_type ?? null

        // Detect AWS-style "license_type holds billing flavor" responses.
        const looksLikeBilling = (v: any): v is BillingType =>
            v === 'PAID' || v === 'TRIAL'

        let licenseType: LicenseType | null = licenseTypeRaw
        let billingType: BillingType | null = billingTypeRaw
        if (billingType == null && looksLikeBilling(licenseTypeRaw)) {
            billingType = licenseTypeRaw
            // Server didn't tell us seat tier — assume individual; team-only
            // features check `licenseType` and will deny correctly.
            licenseType = 'INDIVIDUAL'
        }

        const status: 'VALID' | 'INVALID' = r.license_status === 'VALID' ? 'VALID' : 'INVALID'
        const reasonCode: ReasonCode = r.reason_code ?? (status === 'VALID' ? 'OK' : 'INVALID_CREDENTIALS')

        return {
            license_status: status,
            reason_code: reasonCode,
            user_email: r.user_email ?? null,
            device_id: r.device_id ?? null,
            license_id: r.license_id ?? null,
            license_type: licenseType,
            billing_type: billingType,
            start_date: r.start_date ?? null,
            end_date: r.end_date ?? null,
            access_token: r.access_token ?? null,
            refresh_token: r.refresh_token ?? null,
            access_expires_in_sec: typeof r.access_expires_in_sec === 'number' ? r.access_expires_in_sec : null,
            refresh_expires_in_sec: typeof r.refresh_expires_in_sec === 'number' ? r.refresh_expires_in_sec : null,
        }
    }

    private normalizeHeartbeat (raw: any): HeartbeatEnvelope {
        const r = raw && typeof raw === 'object' ? raw : {}
        return {
            status: r.status === 'VALID' ? 'VALID' : 'INVALID',
            reason_code: r.reason_code ?? null,
            access_token: r.access_token,
            refresh_token: r.refresh_token,
            access_expires_in_sec: typeof r.access_expires_in_sec === 'number' ? r.access_expires_in_sec : undefined,
            refresh_expires_in_sec: typeof r.refresh_expires_in_sec === 'number' ? r.refresh_expires_in_sec : undefined,
        }
    }

    private applyEnvelope (e: LicenseEnvelope): void {
        this.accessToken = e.access_token
        this.refreshToken = e.refresh_token
        // Prefer the server-provided email; fall back to whatever was already
        // set (e.g. from activate() where the user typed it, or from hydrate).
        if (e.user_email) {this.userEmail = e.user_email}
        this.deviceId = e.device_id
        this.licenseId = e.license_id
        this.licenseType = e.license_type
        this.billingType = e.billing_type
        this.startDate = e.start_date
        this.endDate = e.end_date
        this.accessExpiresAt = e.access_expires_in_sec ? Date.now() + e.access_expires_in_sec * 1000 : 0
        this.refreshExpiresAt = e.refresh_expires_in_sec ? Date.now() + e.refresh_expires_in_sec * 1000 : 0
        this.lastReasonCode = e.reason_code
        this.lastServerContactAt = new Date()
        this.offlineGrace = false
        this.licenseStatus = 'active'
        this.emit()
    }

    private applyHeartbeat (h: HeartbeatEnvelope): void {
        if (h.access_token) {this.accessToken = h.access_token}
        if (h.refresh_token) {this.refreshToken = h.refresh_token}
        if (h.access_expires_in_sec) {this.accessExpiresAt = Date.now() + h.access_expires_in_sec * 1000}
        if (h.refresh_expires_in_sec) {this.refreshExpiresAt = Date.now() + h.refresh_expires_in_sec * 1000}
        this.lastReasonCode = h.reason_code
        this.lastServerContactAt = new Date()
        this.offlineGrace = false
        this.emit()
    }

    private hydrateFromBundle (b: StoredLicenseBundle): void {
        this.accessToken = b.accessToken
        this.refreshToken = b.refreshToken
        this.userEmail = b.userEmail
        this.deviceId = b.deviceId
        this.licenseId = b.licenseId
        this.licenseType = b.licenseType as LicenseType | null
        this.billingType = b.billingType as BillingType | null
        this.startDate = b.startDate
        this.endDate = b.endDate
        this.lastServerContactAt = b.lastServerContactAt ? new Date(b.lastServerContactAt) : null
        this.licenseStatus = 'unknown'   // will resolve after network call
    }

    private async persist (): Promise<void> {
        if (!this.accessToken || !this.refreshToken || !this.userEmail || !this.deviceId || !this.licenseId) {
            return
        }
        await this.storage.save({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            userEmail: this.userEmail,
            deviceId: this.deviceId,
            licenseId: this.licenseId,
            licenseType: this.licenseType,
            billingType: this.billingType,
            startDate: this.startDate,
            endDate: this.endDate,
            lastServerContactAt: this.lastServerContactAt?.getTime() ?? Date.now(),
        })
    }

    private reset (): void {
        this.accessToken = null
        this.refreshToken = null
        this.userEmail = null
        this.deviceId = null
        this.licenseId = null
        this.licenseType = null
        this.billingType = null
        this.startDate = null
        this.endDate = null
        this.accessExpiresAt = 0
        this.refreshExpiresAt = 0
        this.offlineGrace = false
        this.lastServerContactAt = null
        this.isLocalTrial = false
        this.trialStartAt = null
    }

    private isAccessExpired (): boolean {
        if (!this.accessExpiresAt) {return false}
        return Date.now() >= this.accessExpiresAt - this.config.refreshSkewSec * 1000
    }

    private isWithinGrace (lastContactMs: number): boolean {
        const ageHours = (Date.now() - lastContactMs) / (1000 * 60 * 60)
        return ageHours <= this.config.gracePeriodHours
    }

    private humanReason (code: ReasonCode): string {
        switch (code) {
            case 'INVALID_CREDENTIALS': return 'Incorrect email or password.'
            case 'PRODUCT_NOT_ENTITLED': return 'This account has no license for this product.'
            case 'LICENSE_EXPIRED': return 'Your license has expired.'
            case 'SEAT_REVOKED': return 'Your seat was revoked. Please contact your admin.'
            case 'DEVICE_LIMIT_REACHED': return 'Maximum devices reached. Deactivate another device first.'
            case 'DEVICE_ALREADY_BOUND': return 'This device is already bound to a different account.'
            case 'APP_VERSION_BLOCKED': return 'This app version is blocked. Please update.'
            case 'TOO_MANY_ATTEMPTS': return 'Too many failed attempts. Try again in a few minutes.'
            case 'SIGNATURE_INVALID': return 'Session is invalid. Please sign in again.'
            case 'DEVICE_MISMATCH': return 'Device mismatch. Please sign in again.'
            case 'INVALID_REQUEST': return 'Invalid request.'
            default: return 'Activation failed.'
        }
    }

    /**
     * Short label shown on the dock sign-in pill. Callers still render the
     * pill with their own chrome/icon; this just gives them a state-specific
     * string so the UX can distinguish "trial is fine, sign in to upgrade"
     * from "your session is dead, you need to re-auth".
     */
    get dockPillLabel (): string {
        if (this.licenseStatus === 'expired') {return 'License expired'}
        if (this.licenseStatus === 'invalid') {
            if (this.lastReasonCode === 'SEAT_REVOKED') {return 'Seat revoked'}
            if (this.lastReasonCode === 'DEVICE_LIMIT_REACHED') {return 'Device limit reached'}
            if (this.lastReasonCode === 'DEVICE_ALREADY_BOUND') {return 'Device taken'}
            if (this.lastReasonCode === 'PRODUCT_NOT_ENTITLED') {return 'No entitlement'}
            if (this.lastReasonCode === 'APP_VERSION_BLOCKED') {return 'App update required'}
            return 'Session expired'
        }
        return 'Sign in'
    }

    /**
     * Longer descriptive text for the pill's hover tooltip. Always ends in a
     * call-to-action so the user knows what clicking the pill will do.
     */
    get dockPillTooltip (): string {
        if (this.lastReasonCode && this.lastReasonCode !== 'OK') {
            return this.humanReason(this.lastReasonCode) + ' Click to sign in.'
        }
        if (this.licenseStatus === 'expired') {return 'License expired — sign in to continue.'}
        if (this.licenseStatus === 'invalid') {return 'Your session is no longer valid — sign in again.'}
        if (this.isLocalTrial) {
            const d = this.trialDaysRemaining
            if (d > 0) {return `Trial: ${d} day(s) left — sign in to activate.`}
            return `Trial: ${this.trialHoursRemaining} hour(s) left — sign in to activate.`
        }
        return 'Sign in to activate your license.'
    }

    private snapshot (): LicenseInfo {
        return {
            status: this.licenseStatus,
            userEmail: this.userEmail,
            licenseType: this.licenseType,
            billingType: this.billingType,
            deviceId: this.deviceId,
            licenseId: this.licenseId,
            startDate: this.startDate,
            endDate: this.endDate,
            accessExpiresInSec: this.accessExpiresAt ? Math.max(0, Math.round((this.accessExpiresAt - Date.now()) / 1000)) : 0,
            lastReasonCode: this.lastReasonCode,
            lastServerContactAt: this.lastServerContactAt,
            offlineGrace: this.offlineGrace,
            isLocalTrial: this.isLocalTrial,
            trialDaysRemaining: this.trialDaysRemaining,
        }
    }

    private emit (): void {
        this.info$.next(this.snapshot())
    }

    // ─── Timers ───────────────────────────────────────────────────────────

    private startHeartbeat (): void {
        this.stopHeartbeat()
        this.heartbeatTimer = setInterval(() => this.heartbeatTick(), this.config.heartbeatIntervalMs)
    }

    private stopHeartbeat (): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
    }

    private scheduleRefresh (): void {
        if (this.refreshTimer) {clearTimeout(this.refreshTimer)}
        if (!this.accessExpiresAt) {return}
        const ms = this.accessExpiresAt - Date.now() - this.config.refreshSkewSec * 1000
        if (ms <= 0) {
            this.refreshTick()
            return
        }
        this.refreshTimer = setTimeout(() => this.refreshTick(), ms)
    }

    private async refreshTick (): Promise<void> {
        const envelope = await this.callRefresh()
        if (envelope?.license_status === 'VALID') {
            this.applyEnvelope(envelope)
            await this.persist()
            this.scheduleRefresh()
        } else if (envelope) {
            // Server returned a structurally-INVALID envelope. Only clear
            // the session if it's tagged with a known revocation reason —
            // anything else (server bug, malformed response, unknown
            // status) is treated as transient. Same policy as
            // heartbeatTick.
            const REVOCATION_CODES = new Set<string>([
                'LICENSE_EXPIRED', 'SEAT_REVOKED', 'DEVICE_LIMIT_REACHED',
                'DEVICE_MISMATCH', 'SIGNATURE_INVALID', 'PRODUCT_NOT_ENTITLED',
                'APP_VERSION_BLOCKED', 'INVALID_CREDENTIALS',
            ])
            if (envelope.reason_code && REVOCATION_CODES.has(envelope.reason_code)) {
                await this.handleInvalid(envelope.reason_code)
            } else {
                // eslint-disable-next-line no-console
                console.warn('[license:refresh] INVALID without revocation reason — keeping session',
                    { reason: envelope.reason_code })
            }
        }
        // envelope === null → unreachable, rely on grace window; will retry next heartbeat.
    }

    private async heartbeatTick (): Promise<void> {
        if (this.heartbeatDisabledByServer) {
            // Sticky off after a 422 "missing credentials" response —
            // server doesn't support token-only check-ins. Don't even
            // log on subsequent ticks; the warn at disable-time covered it.
            return
        }
        // Increment count + start timer up front so even an exception in
        // callHeartbeat() leaves the observability state consistent.
        this.heartbeatCount += 1
        const startedAt = Date.now()
        // eslint-disable-next-line no-console
        console.group(`%c[license:heartbeat] tick #${this.heartbeatCount}`,
            'color:#3b82f6;font-weight:600')
        let h: HeartbeatEnvelope | null = null
        try {
            h = await this.callHeartbeat()
        } catch (e: any) {
            this.heartbeatLastError = e?.message || String(e ?? '')
            // eslint-disable-next-line no-console
            console.error('[license:heartbeat] uncaught exception in callHeartbeat', e)
        }
        this.heartbeatLastAt = new Date()
        this.heartbeatLastDurationMs = Date.now() - startedAt
        this.emit()

        if (!h) {
            // Unreachable. Flip to offline-grace if we're still within window.
            this.heartbeatFailureCount += 1
            this.heartbeatLastStatus = 'unreachable'
            this.heartbeatLastReason = null
            const withinGrace = !!(this.lastServerContactAt && this.isWithinGrace(this.lastServerContactAt.getTime()))
            const noSession = !this.accessToken || !this.deviceId || !this.licenseId
            // eslint-disable-next-line no-console
            console.warn(`%c[license:heartbeat] tick #${this.heartbeatCount} → UNREACHABLE`,
                'color:#f59e0b;font-weight:700',
                {
                    durationMs: this.heartbeatLastDurationMs,
                    error: this.heartbeatLastError,
                    // When duration is ~1ms with no error, the call short-
                    // circuited before HTTP. Surface why explicitly.
                    diagnostic: noSession
                        ? 'no-session (sign in first; heartbeat needs an active access_token + device_id + license_id)'
                        : (this.heartbeatLastError ? 'fetch threw (network / DNS / CORS)' : 'request returned non-OK or invalid JSON'),
                    lastServerContactAt: this.lastServerContactAt?.toISOString() ?? null,
                    gracePeriodHours: this.config.gracePeriodHours,
                    withinGrace,
                    serverUrl: this.serverUrl,
                    heartbeatUrl: this.licenseEndpoint('heartbeat'),
                })
            if (withinGrace) {
                this.offlineGrace = true
                this.emit()
            } else if (this.lastServerContactAt) {
                // Beyond grace — hard-block.
                // eslint-disable-next-line no-console
                console.error('[license:heartbeat] beyond grace window — clearing session')
                await this.handleInvalid(null)
            }
            // eslint-disable-next-line no-console
            console.groupEnd()
            return
        }
        if (h.status === 'VALID') {
            this.heartbeatSuccessCount += 1
            this.heartbeatLastStatus = 'ok'
            this.heartbeatLastReason = h.reason_code ?? null
            this.heartbeatLastError = null
            // eslint-disable-next-line no-console
            console.info(`%c[license:heartbeat] tick #${this.heartbeatCount} → OK`,
                'color:#16a34a;font-weight:700',
                {
                    durationMs: this.heartbeatLastDurationMs,
                    reason: h.reason_code,
                    rotatedAccessToken: !!h.access_token,
                    rotatedRefreshToken: !!h.refresh_token,
                })
            this.applyHeartbeat(h)
            await this.persist()
        } else {
            this.heartbeatFailureCount += 1
            this.heartbeatLastStatus = 'invalid'
            this.heartbeatLastReason = h.reason_code ?? null
            // Only ACTUALLY log the user out for license-revocation reason
            // codes. Anything else (server returned INVALID with no reason,
            // or with a code that means "your request was malformed" rather
            // than "your license is dead") is treated as transient. Loud
            // log either way so a real revocation is still obvious.
            const REVOCATION_CODES = new Set<string>([
                'LICENSE_EXPIRED', 'SEAT_REVOKED', 'DEVICE_LIMIT_REACHED',
                'DEVICE_MISMATCH', 'SIGNATURE_INVALID', 'PRODUCT_NOT_ENTITLED',
                'APP_VERSION_BLOCKED', 'INVALID_CREDENTIALS',
            ])
            const reason = h.reason_code ?? null
            const shouldLogOut = !!reason && REVOCATION_CODES.has(reason)
            // eslint-disable-next-line no-console
            console.error(`%c[license:heartbeat] tick #${this.heartbeatCount} → INVALID`,
                'color:#dc2626;font-weight:700',
                {
                    durationMs: this.heartbeatLastDurationMs,
                    reason,
                    action: shouldLogOut ? 'CLEARING SESSION' : 'keeping session (no revocation reason)',
                })
            if (shouldLogOut) {
                await this.handleInvalid(reason)
            }
        }
        // eslint-disable-next-line no-console
        console.groupEnd()
    }

    // ─── Heartbeat observability (read-only getters for the Settings UI) ──

    /** Configured heartbeat interval in ms. Read from merged config. */
    get heartbeatIntervalMs (): number {
        if (this.proxy) return this.proxy.heartbeatIntervalMs
        return this.config.heartbeatIntervalMs
    }

    /** Total heartbeat attempts made this process run. Resets on app restart. */
    get heartbeatAttemptCount (): number {
        if (this.proxy) return this.proxy.heartbeatAttemptCount
        return this.heartbeatCount
    }

    get heartbeatSuccesses (): number {
        if (this.proxy) return this.proxy.heartbeatSuccesses
        return this.heartbeatSuccessCount
    }

    get heartbeatFailures (): number {
        if (this.proxy) return this.proxy.heartbeatFailures
        return this.heartbeatFailureCount
    }

    /** Wall-clock of the most recent heartbeat attempt, or null if none yet. */
    get heartbeatLastRunAt (): Date | null {
        if (this.proxy) return this.proxy.heartbeatLastRunAt
        return this.heartbeatLastAt
    }

    get heartbeatLastResult (): { status: 'ok' | 'unreachable' | 'invalid' | null; reason: ReasonCode | null; durationMs: number | null; error: string | null } {
        if (this.proxy) return this.proxy.heartbeatLastResult
        return {
            status: this.heartbeatLastStatus,
            reason: this.heartbeatLastReason,
            durationMs: this.heartbeatLastDurationMs,
            error: this.heartbeatLastError,
        }
    }

    /**
     * Manually fire a heartbeat right now. Useful from the Settings UI to
     * verify reachability without waiting up to `heartbeatIntervalMs` (4h
     * by default). Caller can `await` to know when the result is in.
     * Doesn't disturb the periodic timer.
     */
    async triggerHeartbeat (): Promise<void> {
        if (this.proxy) return this.proxy.triggerHeartbeat()
        await this.heartbeatTick()
    }

    /**
     * True after the server returned 422 "missing credentials" once —
     * meaning periodic heartbeat / refresh aren't supported on this
     * deployment. The Settings UI can use this to show a "disabled"
     * badge instead of letting the user wonder why "Run now" does
     * nothing on subsequent clicks.
     */
    get heartbeatDisabled (): boolean {
        if (this.proxy) return this.proxy.heartbeatDisabled
        return this.heartbeatDisabledByServer
    }

    // Guards against concurrent invalidation: heartbeat + refresh + self-service
    // endpoints can all trip a 401 in the same few-millisecond window. Only the
    // first caller runs the async clear; subsequent callers short-circuit.
    private handlingInvalid: Promise<void> | null = null

    private async handleInvalid (reason: ReasonCode | null): Promise<void> {
        if (this.handlingInvalid) {return this.handlingInvalid}
        this.handlingInvalid = (async () => {
            try {
                this.stopTimers()
                await this.storage.clear()
                this.reset()
                this.licenseStatus = reason === 'LICENSE_EXPIRED' ? 'expired' : 'invalid'
                this.lastReasonCode = reason
                this.emit()
            } finally {
                this.handlingInvalid = null
            }
        })()
        return this.handlingInvalid
    }

    private stopTimers (): void {
        this.stopHeartbeat()
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
            this.refreshTimer = null
        }
    }
}
