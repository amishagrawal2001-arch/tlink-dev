// ─── License State (client-observable) ──────────────────────────────────────

/** Overall auth/licensing state emitted by the service. */
export type LicenseStatus = 'unknown' | 'active' | 'expired' | 'invalid' | 'unauthenticated'

/** Tier of entitlement returned by the server. */
export type LicenseType = 'INDIVIDUAL' | 'TEAM'

/** Billing flavour. TRIAL unlocks all features; PAID follows `licenseType`. */
export type BillingType = 'TRIAL' | 'PAID'

/** Reason code returned by the server on INVALID responses (activate/validate/refresh). */
export type ReasonCode =
    | 'OK'
    | 'INVALID_CREDENTIALS'
    | 'PRODUCT_NOT_ENTITLED'
    | 'LICENSE_EXPIRED'
    | 'SEAT_REVOKED'
    | 'DEVICE_LIMIT_REACHED'
    | 'DEVICE_ALREADY_BOUND'
    | 'DEVICE_MISMATCH'
    | 'SIGNATURE_INVALID'
    | 'APP_VERSION_BLOCKED'
    | 'TOO_MANY_ATTEMPTS'
    | 'INVALID_REQUEST'

/** Compact view of current state, emitted on `licenseInfo$`. */
export interface LicenseInfo {
    status: LicenseStatus
    userEmail: string | null
    licenseType: LicenseType | null
    billingType: BillingType | null
    deviceId: string | null
    licenseId: string | null
    startDate: string | null
    endDate: string | null
    /** Seconds until the access token expires (0 if no token). */
    accessExpiresInSec: number
    /** The last reason code seen (if any). */
    lastReasonCode: ReasonCode | null
    /** Last successful contact with the server. */
    lastServerContactAt: Date | null
    /** True when running on cached state within the offline grace window. */
    offlineGrace: boolean
    /** True while running on a local trial (no server session yet). */
    isLocalTrial: boolean
    /** Days remaining in the local trial (0 if not on trial). */
    trialDaysRemaining: number
}

// ─── Server envelopes ───────────────────────────────────────────────────────

/** Envelope returned by /activate, /validate, /refresh. */
export interface LicenseEnvelope {
    license_status: 'VALID' | 'INVALID'
    reason_code: ReasonCode
    user_email: string | null
    device_id: string | null
    license_id: string | null
    license_type: LicenseType | null
    billing_type: BillingType | null
    start_date: string | null
    end_date: string | null
    access_token: string | null
    refresh_token: string | null
    access_expires_in_sec: number | null
    refresh_expires_in_sec: number | null
}

/** Slim envelope returned by /heartbeat (optionally with rotated tokens). */
export interface HeartbeatEnvelope {
    status: 'VALID' | 'INVALID'
    reason_code: ReasonCode | null
    access_token?: string
    refresh_token?: string
    access_expires_in_sec?: number
    refresh_expires_in_sec?: number
}

// ─── Result shapes returned to callers ──────────────────────────────────────

/** Returned by activateLicense() for UI feedback. */
export interface ActivationResult {
    success: boolean
    message: string
    reasonCode?: ReasonCode
}

/** Returned by testServerConnection() for the server-settings dialog. */
export interface ServerTestResult {
    reachable: boolean
    message: string
    latencyMs?: number
}
