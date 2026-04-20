import { InjectionToken } from '@angular/core'

/**
 * Features that should be treated as TEAM-tier. When billingType is PAID and
 * licenseType is INDIVIDUAL, these are denied. TEAM and TRIAL get everything.
 */
export interface TlinkLicenseConfig {
    /** License server base URL (default: http://localhost:4000). */
    serverUrl?: string
    /** Product code sent to the server (matches an app row on the license server). */
    productCode?: string
    /** Application display version, sent to the server for blocklist checks. */
    appVersion?: string
    /** Heartbeat interval (default: 4 hours). */
    heartbeatIntervalMs?: number
    /** Preemptive access-token refresh if < this many seconds until expiry (default: 120). */
    refreshSkewSec?: number
    /** How long offline state remains VALID from last successful server contact (default: 48h). */
    gracePeriodHours?: number
    /** Local trial duration when the user hasn't signed in yet (default: 30 days). */
    trialDurationDays?: number
    /** Purchase / upgrade URL shown on the trial banner. */
    purchaseUrl?: string
    /** Application name shown on the splash/lock screen. */
    appName?: string
    /** Logo URL shown on the splash/lock screen. */
    appLogoUrl?: string
    /** Splash screen minimum visible duration. */
    splashDurationMs?: number
    /**
     * Feature flags gated behind TEAM. Use `isFeatureAvailable(flag)` on the
     * service to check. TRIAL and TEAM always get these; INDIVIDUAL is denied.
     */
    teamOnlyFeatures?: string[]
    /**
     * PEM-encoded RSA public key (SPKI) used to verify offline activation
     * codes. Paste your server's `./data/offline-keys/offline-public.pem`
     * contents here at build time — clients that can't reach the license
     * server still need to verify offline codes locally.
     */
    offlinePublicKey?: string
}

export const TLINK_LICENSE_CONFIG = new InjectionToken<TlinkLicenseConfig>('TLINK_LICENSE_CONFIG')

export const DEFAULT_LICENSE_CONFIG: Required<TlinkLicenseConfig> = {
    serverUrl: 'http://localhost:4000',
    productCode: 'tyllink_terminal',
    appVersion: '1.0.0',
    heartbeatIntervalMs: 4 * 60 * 60 * 1000,
    refreshSkewSec: 120,
    gracePeriodHours: 48,
    trialDurationDays: 30,
    purchaseUrl: 'https://tlink.io/pricing',
    appName: 'Tlink Dev',
    appLogoUrl: '',
    splashDurationMs: 2500,
    teamOnlyFeatures: ['team.collab', 'team.share-sessions', 'team.audit-log'],
    offlinePublicKey: '',
}
