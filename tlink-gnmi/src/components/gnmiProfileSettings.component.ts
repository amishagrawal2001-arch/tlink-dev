/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, OnInit } from '@angular/core'
import { ProfileSettingsComponent, NotificationsService } from 'tlink-core'
import { GnmiProfile } from '../api'
import { GnmiService } from '../services/gnmi.service'
import { GnmiPasswordStorageService } from '../services/passwordStorage.service'
import { GnmiHistoryRetentionService } from '../services/historyRetention.service'

/**
 * The New Target dialog body — rendered by the Profiles UI when the
 * user picks "New profile → gNMI target" (or edits an existing one).
 *
 * State beyond the profile itself lives here rather than in the
 * service because it's dialog-scoped: the visible-password toggle,
 * the "Test connection" in-flight flag, and the last test result.
 * None of it needs to survive dialog close.
 */
@Component({
    templateUrl: './gnmiProfileSettings.component.pug',
    styleUrls: ['./gnmiProfileSettings.component.scss'],
})
export class GnmiProfileSettingsComponent implements ProfileSettingsComponent<GnmiProfile>, OnInit {
    profile: GnmiProfile
    showPassword = false

    testing = false
    testResult: {
        success: boolean
        message?: string
        /** One-line human hint derived from error-pattern matching; empty when no pattern matched. */
        hint?: string
        gnmiVersion?: string
        modelCount?: number
        encodings?: string
        latencyMs?: number
    } | null = null

    /**
     * On-disk history usage for this profile — refreshed on component
     * init and after any Clear operation. Null while pending, zero
     * fileCount when retention is disabled or no data recorded yet.
     */
    historySize: { totalBytes: number; fileCount: number; oldestDate: string | null } | null = null

    /** Two-step confirmation state for Clear (first click flips to "Really?"). */
    clearHistoryConfirming = false
    private clearConfirmTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * Vendor-labeled default ports so a user picking "arista" gets 6030
     * without having to remember. Only prefills when the port is empty
     * — never overwrites an intentional user choice.
     */
    private static readonly VENDOR_DEFAULT_PORTS: Record<string, number> = {
        arista: 6030,
        'cisco-iosxr': 57400,
        'juniper-junos': 32767,
        'nokia-srlinux': 57400,
        'nokia-sros': 57400,
    }

    // eslint-disable-next-line @typescript-eslint/max-params
    constructor (
        private gnmi: GnmiService,
        private passwordStorage: GnmiPasswordStorageService,
        private notifications: NotificationsService,
        private retention: GnmiHistoryRetentionService,
    ) { }

    ngOnInit (): void {
        this.refreshHistorySize()
    }

    /** Fill an empty port field from the vendor default when the user picks a vendor. */
    onVendorChange (): void {
        if (this.profile.options.port) { return }
        const defaultPort = GnmiProfileSettingsComponent.VENDOR_DEFAULT_PORTS[this.profile.options.vendor ?? '']
        if (defaultPort) {
            this.profile.options.port = defaultPort
        }
    }

    async testConnection (): Promise<void> {
        if (this.testing || !this.profile.options.host) { return }
        this.testing = true
        this.testResult = null

        const startedAt = Date.now()
        try {
            const cap = await this.gnmi.capabilities(this.profile)
            this.testResult = {
                success: true,
                gnmiVersion: cap.gnmiVersion,
                modelCount: cap.supportedModels.length,
                encodings: cap.supportedEncodings.join(', '),
                latencyMs: Date.now() - startedAt,
            }
        } catch (err) {
            const { message } = err as Error
            this.testResult = {
                success: false,
                message,
                hint: this.diagnoseFailure(message),
                latencyMs: Date.now() - startedAt,
            }
        } finally {
            this.testing = false
        }
    }

    /**
     * Turn common gnmic error shapes into a one-line human hint. Users
     * hit "transport: authentication handshake failed … connection
     * reset by peer" and don't know that means "the device isn't
     * actually doing TLS on this port, flip Security → Insecure";
     * similarly for cert-trust and timeout and auth failures. Returns
     * empty string when nothing matches so the UI can conditionally
     * render the hint row.
     */
    private diagnoseFailure (message: string): string {
        const m = message.toLowerCase()
        // Juniper Junos `grpc clear-text` / Arista `management api gnmi
        // transport grpc INSECURE` both reset the TCP connection the
        // moment a TLS ClientHello arrives. Classic symptom: handshake
        // "read … connection reset by peer".
        if (m.includes('handshake failed') && m.includes('reset by peer')) {
            return 'Device may not be using TLS on this port. Try Security tab → Insecure (plain gRPC).'
        }
        if (m.includes('certificate signed by unknown authority') ||
            m.includes('x509: ') ||
            m.includes('certificate has expired')) {
            return 'Server certificate isn\'t trusted. Try Security tab → "TLS · skip cert verification", or supply the device\'s CA cert.'
        }
        if (m.includes('tls: handshake failure') || m.includes('tls: no cipher suite supported')) {
            return 'TLS version or cipher mismatch between client and device. Try Security tab → "TLS · skip cert verification" first; if that still fails, the device is using unsupported TLS settings.'
        }
        if (m.includes('context deadline exceeded') || m.includes('deadline exceeded') || m.includes('i/o timeout')) {
            return 'Connection timed out. Check that the port is open end-to-end (firewall, ACLs, device reachability).'
        }
        if (m.includes('no such host') || m.includes('name resolution')) {
            return 'Hostname didn\'t resolve. Check DNS or use the device IP.'
        }
        if (m.includes('connection refused')) {
            return 'Device isn\'t listening on this port. Check the gNMI service config on the target (port + enabled state).'
        }
        if (m.includes('code = unauthenticated') || m.includes('invalid credentials') || m.includes('authentication failed')) {
            return 'Credentials rejected. Check the Auth tab username/password.'
        }
        if (m.includes('code = unavailable') && m.includes('handshake')) {
            // Falls through from other handshake cases — generic hint.
            return 'Device didn\'t complete the gNMI handshake. If the target is in plaintext mode, flip Security → Insecure; otherwise check vendor + encoding on the Target tab.'
        }
        return ''
    }

    async saveToKeychain (): Promise<void> {
        if (!this.profile.options.password || !this.profile.options.host) { return }
        try {
            await this.passwordStorage.savePassword(this.profile, this.profile.options.password)
            this.notifications.info('Password saved to keychain')
        } catch (err) {
            this.notifications.error('Failed to save password: ' + (err as Error).message)
        }
    }

    async clearFromKeychain (): Promise<void> {
        try {
            await this.passwordStorage.deletePassword(this.profile)
            this.notifications.info('Password removed from keychain')
        } catch (err) {
            this.notifications.error('Failed to remove password: ' + (err as Error).message)
        }
    }

    // ─── On-disk history retention ──────────────────────────────────

    /**
     * Refresh the size display — user-triggered via a small icon, and
     * fired once from ngOnInit so the initial render isn't stuck on
     * "loading".
     */
    refreshHistorySize (): void {
        this.historySize = this.retention.sizeOf(this.profile)
    }

    /**
     * Two-step Clear — first click flips the button to a "Really?"
     * state that auto-reverts after 3 s. Second click within that
     * window performs the delete. Better than a native confirm()
     * modal because it stays visually consistent with the rest of
     * the profile dialog.
     */
    clearHistory (): void {
        if (!this.clearHistoryConfirming) {
            this.clearHistoryConfirming = true
            this.clearConfirmTimer = setTimeout(() => {
                this.clearHistoryConfirming = false
                this.clearConfirmTimer = null
            }, 3000)
            return
        }
        if (this.clearConfirmTimer) {
            clearTimeout(this.clearConfirmTimer)
            this.clearConfirmTimer = null
        }
        this.clearHistoryConfirming = false
        const removed = this.retention.clearAll(this.profile)
        this.refreshHistorySize()
        if (removed > 0) {
            this.notifications.info(`Cleared ${removed} history file${removed === 1 ? '' : 's'}`)
        } else {
            this.notifications.info('No retained history to clear')
        }
    }

    /**
     * Format a byte count as a compact human string (KB / MB / GB).
     * Used by the template — kept here so it doesn't fight with the
     * ExpressionChangedAfterItHasBeenCheckedError checker (a pure
     * function of its args, no this.now / Date.now dependencies).
     */
    formatSize (bytes: number): string {
        if (bytes < 1024) { return `${bytes} B` }
        const units = ['KB', 'MB', 'GB', 'TB']
        let v = bytes / 1024
        let i = 0
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1 }
        const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2
        return `${v.toFixed(digits)} ${units[i]}`
    }
}
