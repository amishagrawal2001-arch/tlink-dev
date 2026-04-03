import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { TlinkLicenseService } from '../../tlink-license.service';
import { LicenseInfo } from '../../models/license.models';

@Component({
  selector: 'tlink-trial-banner',
  template: `
    <div class="tlink-banner" *ngIf="visible" [ngClass]="bannerClass">
      <span class="tlink-banner__icon">{{ icon }}</span>
      <span class="tlink-banner__text">{{ message }}</span>
      <button
        *ngIf="info?.status === 'trial'"
        class="tlink-banner__btn"
        (click)="upgrade.emit()">
        Upgrade
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .tlink-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      font-size: 13px;
      font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--tlink-banner-color, #fff);
    }

    .tlink-banner--trial {
      background: var(--tlink-banner-trial-bg, #d97706);
    }

    .tlink-banner--pro {
      background: var(--tlink-banner-pro-bg, #2563eb);
    }

    .tlink-banner--enterprise {
      background: var(--tlink-banner-enterprise-bg, #7c3aed);
    }

    .tlink-banner__icon {
      font-size: 16px;
    }

    .tlink-banner__text {
      flex: 1;
    }

    .tlink-banner__btn {
      padding: 3px 12px;
      border: 1px solid rgba(255,255,255,0.6);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .tlink-banner__btn:hover {
      background: rgba(255,255,255,0.15);
    }
  `],
})
export class TrialBannerComponent implements OnInit, OnDestroy {
  @Output() upgrade = new EventEmitter<void>();

  info: LicenseInfo | null = null;
  visible = false;
  message = '';
  icon = '';
  bannerClass = '';

  private _sub?: Subscription;

  constructor(private licenseService: TlinkLicenseService) {}

  ngOnInit(): void {
    this._sub = this.licenseService.licenseInfo$.subscribe(info => {
      this.info = info;
      this._update(info);
    });
  }

  ngOnDestroy(): void {
    this._sub?.unsubscribe();
  }

  private _update(info: LicenseInfo): void {
    if (info.status === 'trial') {
      this.visible = true;
      this.bannerClass = 'tlink-banner--trial';
      this.icon = '\u23F3';
      this.message = `Trial: ${info.trialDaysRemaining} day${info.trialDaysRemaining !== 1 ? 's' : ''} remaining`;
    } else if (info.status === 'active' && info.tier === 'pro') {
      this.visible = true;
      this.bannerClass = 'tlink-banner--pro';
      this.icon = '\u2605';
      this.message = 'Pro License';
    } else if (info.status === 'active' && info.tier === 'enterprise') {
      this.visible = true;
      this.bannerClass = 'tlink-banner--enterprise';
      this.icon = '\u2756';
      this.message = 'Enterprise License';
    } else {
      this.visible = false;
    }
  }
}
