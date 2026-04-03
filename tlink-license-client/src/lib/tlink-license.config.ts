import { InjectionToken } from '@angular/core';

export interface TlinkLicenseConfig {
  /** License server URL (default: http://localhost:4000) */
  serverUrl?: string;
  /** Application code sent during activation (e.g. 'NO' for NetOps) */
  appCode?: string;
  /** Application version string */
  appVersion?: string;
  /** Trial duration in days (default: 30) */
  trialDurationDays?: number;
  /** Heartbeat interval in milliseconds (default: 4 hours) */
  heartbeatIntervalMs?: number;
  /** Salt used for 6-segment server key checksums */
  serverKeySalt?: string;
  /** URL for purchasing licenses */
  purchaseUrl?: string;
  /** Application display name (used in splash screen) */
  appName?: string;
  /** Application logo URL (used in splash screen) */
  appLogoUrl?: string;
  /** Splash screen duration in milliseconds (default: 2500) */
  splashDurationMs?: number;
  /** Pro-tier gated features */
  proFeatures?: string[];
}

export const TLINK_LICENSE_CONFIG = new InjectionToken<TlinkLicenseConfig>('TLINK_LICENSE_CONFIG');

export const DEFAULT_LICENSE_CONFIG: TlinkLicenseConfig = {
  serverUrl: 'http://localhost:4000',
  appCode: 'TD',
  appVersion: '1.0.0',
  trialDurationDays: 30,
  heartbeatIntervalMs: 4 * 60 * 60 * 1000,
  serverKeySalt: 'tlink-key-salt-change-in-production',
  purchaseUrl: 'https://tlink.io/pricing',
  appName: 'Tlink Dev',
  appLogoUrl: '',
  splashDurationMs: 2500,
  proFeatures: [
    'save', 'export', 'add-shapes', 'add-nodes', 'add-links',
    'edit-properties', 'templates', 'snmp', 'syslog',
  ],
};
