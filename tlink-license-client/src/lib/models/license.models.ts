export type LicenseStatus = 'trial' | 'active' | 'expired' | 'invalid';
export type LicenseTier = 'trial' | 'pro' | 'enterprise';
export type LicenseSource = 'server' | 'local';

export interface LicenseInfo {
  status: LicenseStatus;
  trialDaysRemaining: number;
  licenseKey: string | null;
  tier: LicenseTier;
  expiry: Date | null;
  source: LicenseSource | null;
}

export interface KeyValidation {
  valid: boolean;
  tier: 'pro' | 'enterprise' | null;
  expiry: Date | null;
  expired: boolean;
}

export interface ServerActivationResponse {
  valid: boolean;
  tier: string;
  expiry: string;
  customer: string;
  message: string;
}

export interface ActivationResult {
  success: boolean;
  message: string;
}

export interface ServerTestResult {
  reachable: boolean;
  message: string;
  latencyMs?: number;
}
