import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core'
import { Subscription } from 'rxjs'
import { TlinkLicenseService } from '../../tlink-license.service'
import { LicenseInfo } from '../../models/license.models'

@Component({
    standalone: false,
    selector: 'tlink-trial-banner',
    template: `
    <div class="tlink-banner" *ngIf="visible" [ngClass]="bannerClass">
      <span class="tlink-banner__icon">{{ icon }}</span>
      <span class="tlink-banner__text">{{ message }}</span>
      <button *ngIf="showUpgrade" class="tlink-banner__btn" (click)="upgrade.emit()">Upgrade</button>
    </div>
  `,
    styles: [`
    :host { display: block; }
    .tlink-banner { display: flex; align-items: center; gap: 8px; padding: 6px 16px; font-size: 13px; font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); color: var(--tlink-banner-color, #fff); }
    .tlink-banner--trial { background: var(--tlink-banner-trial-bg, #d97706); }
    .tlink-banner--team { background: var(--tlink-banner-team-bg, #7c3aed); }
    .tlink-banner--offline { background: var(--tlink-banner-offline-bg, #6b7280); }
    .tlink-banner__icon { font-size: 16px; }
    .tlink-banner__text { flex: 1; }
    .tlink-banner__btn { padding: 3px 12px; border: 1px solid rgba(255,255,255,0.6); border-radius: 4px; background: transparent; color: inherit; font-size: 12px; cursor: pointer; transition: background 0.15s; }
    .tlink-banner__btn:hover { background: rgba(255,255,255,0.15); }
  `],
})
export class TrialBannerComponent implements OnInit, OnDestroy {
    @Output() upgrade = new EventEmitter<void>()

    info: LicenseInfo | null = null
    visible = false
    message = ''
    icon = ''
    bannerClass = ''
    showUpgrade = false

    private sub?: Subscription

    constructor (private licenseService: TlinkLicenseService) {}

    ngOnInit (): void {
        this.sub = this.licenseService.licenseInfo$.subscribe(info => {
            this.info = info
            this.update(info)
        })
    }

    ngOnDestroy (): void {
        this.sub?.unsubscribe()
    }

    private update (info: LicenseInfo): void {
        if (info.status !== 'active') {
            this.visible = false
            return
        }
        // Offline takes priority — users should know their cached state isn't fresh.
        if (info.offlineGrace) {
            this.visible = true
            this.bannerClass = 'tlink-banner--offline'
            this.icon = '\u26A0'
            this.message = 'Offline — using cached license (48h grace)'
            this.showUpgrade = false
            return
        }
        if (info.billingType === 'TRIAL') {
            this.visible = true
            this.bannerClass = 'tlink-banner--trial'
            this.icon = '\u23F3'
            this.message = info.endDate ? `Trial — expires ${info.endDate}` : 'Trial active'
            this.showUpgrade = true
            return
        }
        if (info.licenseType === 'TEAM') {
            this.visible = true
            this.bannerClass = 'tlink-banner--team'
            this.icon = '\u2605'
            this.message = 'Team License'
            this.showUpgrade = false
            return
        }
        // INDIVIDUAL/PAID users get no banner — they're paid + solo; quiet mode.
        this.visible = false
    }
}
