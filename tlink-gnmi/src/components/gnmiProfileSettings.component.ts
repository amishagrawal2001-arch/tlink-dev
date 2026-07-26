/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component } from '@angular/core'
import { ProfileSettingsComponent, NotificationsService } from 'tlink-core'
import { GnmiProfile } from '../api'
import { GnmiService } from '../services/gnmi.service'
import { GnmiPasswordStorageService } from '../services/passwordStorage.service'

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
export class GnmiProfileSettingsComponent implements ProfileSettingsComponent<GnmiProfile> {
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

    constructor (
        private gnmi: GnmiService,
        private passwordStorage: GnmiPasswordStorageService,
        private notifications: NotificationsService,
    ) { }

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
}
