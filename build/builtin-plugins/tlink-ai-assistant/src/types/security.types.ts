/**
 * Security-related type definitions
 */

// Risk level
export enum RiskLevel {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

// Risk assessment result
export interface RiskAssessment {
    level: RiskLevel;
    score: number; // 0-100
    reasons: string[];
    patterns: {
        pattern: string;
        match: string;
        severity: RiskLevel;
    }[];
    suggestions?: string[];
}

// Validation result
export interface ValidationResult {
    approved: boolean;
    riskLevel: RiskLevel;
    skipConfirmation?: boolean;
    reason?: string;
    timestamp?: Date;
}

// Stored consent
export interface StoredConsent {
    commandHash: string;
    riskLevel: RiskLevel;
    timestamp: number;
    expiry: number;
    userId?: string;
}

// Password validation result
export interface PasswordValidationResult {
    valid: boolean;
    attempts: number;
    locked: boolean;
    lockExpiry?: number;
}

// Security configuration
export interface SecurityConfig {
    enablePasswordProtection: boolean;
    passwordHash?: string;
    consentExpiryDays: number;
    maxConsentAge: number;
    enableRiskAssessment: boolean;
    autoApproveLowRisk: boolean;
    promptForMediumRisk: boolean;
    requirePasswordForHighRisk: boolean;
    dangerousPatterns: string[];
    allowedCommands: string[];
    forbiddenCommands: string[];
}

// Security event
export interface SecurityEvent {
    type: 'risk_assessed' | 'consent_given' | 'consent_rejected' | 'password_verified' | 'password_failed' | 'command_blocked' | 'command_allowed';
    timestamp: Date;
    command?: string;
    riskLevel?: RiskLevel;
    details?: Record<string, any>;
}

// Security statistics
export interface SecurityStats {
    totalCommandsEvaluated: number;
    totalCommandsBlocked: number;
    totalConsentsGiven: number;
    totalConsentsRejected: number;
    totalPasswordAttempts: number;
    failedPasswordAttempts: number;
    averageRiskScore: number;
    riskLevelDistribution: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
}

// Password policy
export interface PasswordPolicy {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    prohibitCommonPasswords: boolean;
    prohibitReuse: number; // number of previous passwords to check
}
