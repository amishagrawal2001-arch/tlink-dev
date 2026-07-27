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
            this.testResult = {
                success: false,
                message: (err as Error).message,
                latencyMs: Date.now() - startedAt,
            }
        } finally {
            this.testing = false
        }
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
