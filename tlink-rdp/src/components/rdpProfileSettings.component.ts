/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, OnInit } from '@angular/core'

import { ProfileSettingsComponent, NotificationsService, HostAppService, Platform, PlatformService } from 'tlink-core'
import { RDPProfile } from '../api'
import { RDPService } from '../services/rdp.service'
import { RDPPasswordStorageService } from '../services/passwordStorage.service'

/** @hidden */
@Component({
    templateUrl: './rdpProfileSettings.component.pug',
    styleUrls: ['./rdpProfileSettings.component.scss'],
})
export class RDPProfileSettingsComponent implements ProfileSettingsComponent<RDPProfile>, OnInit {
    profile: RDPProfile
    showPassword = false

    testing = false
    testResult: { success: boolean, error?: string, latencyMs?: number } | null = null

    sessionLogEnabled = false
    sessionLogInputEvents = false

    rdpHandlerInstalled = true
    xquartzInstalled = true
    currentPlatform: Platform

    constructor (
        private rdpService: RDPService,
        private passwordStorage: RDPPasswordStorageService,
        private notifications: NotificationsService,
        private hostApp: HostAppService,
        private platform: PlatformService,
    ) {
        this.currentPlatform = this.hostApp.platform
        this.rdpService.hasSystemRDPHandler().then(v => { this.rdpHandlerInstalled = v })
        if (this.hostApp.platform === Platform.macOS) {
            try {
                const fs = require('fs')
                this.xquartzInstalled = fs.existsSync('/Applications/Utilities/XQuartz.app')
            } catch { /* ignore */ }
        }
    }

    ngOnInit (): void {
        this.sessionLogEnabled = !!this.profile?.options?.sessionLog?.enabled
        this.sessionLogInputEvents = !!this.profile?.options?.sessionLog?.logInputEvents
    }

    installXQuartz (): void {
        (this.platform as any).openExternal?.('https://www.xquartz.org/') ||
        (this.platform as any).openPath?.('https://www.xquartz.org/')
        this.notifications.info('Opening XQuartz download page...')
    }

    installRDPClient (): void {
        if (this.currentPlatform === Platform.macOS) {
            (this.platform as any).openExternal?.('macappstore://apps.apple.com/app/id1295203466') ||
            (this.platform as any).openPath?.('macappstore://apps.apple.com/app/id1295203466')
            this.notifications.info('Opening App Store...')
        } else if (this.currentPlatform === Platform.Linux) {
            const cmd = 'sudo apt install -y remmina remmina-plugin-rdp'
            try { navigator.clipboard?.writeText(cmd) } catch { /* ignore */ }
            this.notifications.info('Run in terminal: ' + cmd)
        }
    }

    async testConnection (): Promise<void> {
        if (this.testing || !this.profile.options.host) {
            return
        }
        this.testing = true
        this.testResult = null
        try {
            this.testResult = await this.rdpService.testConnection(
                this.profile.options.host,
                this.profile.options.port ?? 3389,
            )
        } catch (error: any) {
            this.testResult = { success: false, error: error?.message ?? 'Unknown error' }
        } finally {
            this.testing = false
        }
    }

    async saveToKeychain (): Promise<void> {
        if (!this.profile.options.password || !this.profile.options.host) {
            return
        }
        try {
            await this.passwordStorage.savePassword(this.profile, this.profile.options.password)
            this.notifications.info('Password saved to keychain')
        } catch (error: any) {
            this.notifications.error('Failed to save password: ' + (error?.message ?? ''))
        }
    }

    async clearFromKeychain (): Promise<void> {
        try {
            await this.passwordStorage.deletePassword(this.profile)
            this.notifications.info('Saved password cleared')
        } catch (error: any) {
            this.notifications.error('Failed to clear password: ' + (error?.message ?? ''))
        }
    }

    exportProfile (): void {
        const exported = {
            type: 'rdp',
            name: (this.profile as any).name ?? '',
            options: { ...this.profile.options },
        }
        delete (exported.options as any).password

        const json = JSON.stringify(exported, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `rdp-profile-${this.profile.options.host || 'export'}.json`
        a.click()
        URL.revokeObjectURL(url)
        this.notifications.info('Profile exported')
    }

    importProfile (): void {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) {
                return
            }
            try {
                const text = await file.text()
                const imported = JSON.parse(text)
                if (!imported?.options?.host) {
                    this.notifications.error('Invalid profile: missing host')
                    return
                }
                Object.assign(this.profile.options, imported.options)
                if (imported.name) {
                    (this.profile as any).name = imported.name
                }
                this.notifications.info('Profile imported')
            } catch (error: any) {
                this.notifications.error('Failed to import: ' + (error?.message ?? 'Invalid JSON'))
            }
        }
        input.click()
    }

    onSessionLogToggle (enabled: boolean): void {
        if (!this.profile.options.sessionLog) {
            this.profile.options.sessionLog = { enabled: false }
        }
        this.profile.options.sessionLog.enabled = enabled
    }

    onSessionLogInputToggle (enabled: boolean): void {
        if (!this.profile.options.sessionLog) {
            this.profile.options.sessionLog = { enabled: true }
        }
        this.profile.options.sessionLog.logInputEvents = enabled
    }
}
