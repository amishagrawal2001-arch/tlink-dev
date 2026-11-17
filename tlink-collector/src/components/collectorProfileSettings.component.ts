/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, OnInit } from '@angular/core'
import { ProfileSettingsComponent, NotificationsService } from 'tlink-core'
import { CollectorProfile } from '../api'
import { CollectorHistoryRetentionService } from '../services/historyRetention.service'

/**
 * New Collector Target dialog. Three tabs today: Source (data source +
 * scrape interval), Mock OR Prometheus (source-specific config), and
 * Retention (on-disk history knobs).
 *
 * Prometheus tab is hidden when source=mock and vice-versa so the form
 * doesn't carry inert fields; Retention stays always-visible since it
 * applies to every source.
 */
@Component({
    templateUrl: './collectorProfileSettings.component.pug',
    styleUrls: ['./collectorProfileSettings.component.scss'],
})
export class CollectorProfileSettingsComponent implements ProfileSettingsComponent<CollectorProfile>, OnInit {
    profile: CollectorProfile

    /**
     * On-disk history usage for this profile — refreshed on init and
     * after any Clear. Null while pending, zero fileCount when
     * retention is disabled or no data recorded yet. Same shape as
     * the gNMI profile settings panel so the UX reads identically.
     */
    historySize: { totalBytes: number; fileCount: number; oldestDate: string | null } | null = null

    /** Two-step confirmation for Clear (first click flips to "Really?"). */
    clearHistoryConfirming = false
    private clearConfirmTimer: ReturnType<typeof setTimeout> | null = null

    constructor (
        private notifications: NotificationsService,
        private retention: CollectorHistoryRetentionService,
    ) { }

    ngOnInit (): void {
        this.refreshHistorySize()
    }

    /**
     * Fill mock defaults when the user picks 'mock' with an empty
     * mock config, so switching source types doesn't leave the form
     * missing required fields.
     */
    onSourceChange (): void {
        if (this.profile.options.source === 'mock' && !this.profile.options.mock) {
            this.profile.options.mock = { hostCount: 5, scenario: 'idle' }
        }
    }

    // ─── On-disk history retention ──────────────────────────────────

    refreshHistorySize (): void {
        this.historySize = this.retention.sizeOf(this.profile)
    }

    /**
     * Two-step Clear — first click flips the button to a "Really?"
     * state that auto-reverts after 3 s. Second click within that
     * window performs the delete. Avoids a stray click nuking days
     * of retained data; matches the gNMI profile settings UX.
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
     * Mirrors the formatter in gnmiProfileSettings so the two panels
     * display sizes identically.
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
