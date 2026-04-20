import { Component, EventEmitter, OnDestroy, OnInit, Output, HostListener, ElementRef } from '@angular/core'
import { Subscription } from 'rxjs'
import { TlinkLicenseService } from '../../tlink-license.service'
import { LicenseInfo } from '../../models/license.models'

@Component({
    standalone: false,
    selector: 'tlink-license-menu',
    template: `
    <div class="tlink-menu">
      <button class="tlink-menu__trigger" (click)="toggleMenu()">
        <span class="tlink-menu__badge" [ngClass]="badgeClass">{{ badgeLabel }}</span>
        <span class="tlink-menu__caret">&#9662;</span>
      </button>

      <div class="tlink-menu__dropdown" *ngIf="open">
        <div class="tlink-menu__header" *ngIf="info?.status === 'active'">
          <span class="tlink-menu__badge" [ngClass]="badgeClass">{{ badgeLabel | uppercase }}</span>
          <span class="tlink-menu__header-expiry">{{ info?.endDate ? 'Expires ' + info?.endDate : '' }}</span>
        </div>
        <button class="tlink-menu__item" (click)="onAction('activate')" *ngIf="info?.status !== 'active'">
          <span class="tlink-menu__item-icon">🔑</span>
          Sign in
        </button>
        <button class="tlink-menu__item" (click)="onAction('info')">
          <span class="tlink-menu__item-icon">⚙</span>
          License Details
          <span class="tlink-menu__shortcut">⌃⇧L</span>
        </button>
        <div class="tlink-menu__separator"></div>
        <button class="tlink-menu__item" (click)="onAction('deactivate')" *ngIf="info?.status === 'active'">
          <span class="tlink-menu__item-icon">✕</span>
          Sign out
        </button>
        <button class="tlink-menu__item" (click)="onAction('server-settings')">
          <span class="tlink-menu__item-icon">🌐</span>
          Server Settings
        </button>
        <div class="tlink-menu__separator"></div>
        <button class="tlink-menu__item" (click)="onAction('buy')">
          <span class="tlink-menu__item-icon">🛒</span>
          Buy License
        </button>
      </div>
    </div>
  `,
    styles: [`
    :host { display: inline-block; position: relative; }

    .tlink-menu {
      position: relative;
      font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }

    .tlink-menu__trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid var(--tlink-border, #e5e7eb);
      border-radius: 6px;
      background: var(--tlink-menu-trigger-bg, transparent);
      cursor: pointer;
      font-size: 13px;
      color: var(--tlink-dialog-color, #1a1a2e);
      transition: background 0.15s;
    }

    .tlink-menu__trigger:hover {
      background: var(--tlink-menu-trigger-hover, #f3f4f6);
    }

    .tlink-menu__badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #fff;
    }

    .tlink-menu__badge--trial { background: #d97706; }
    .tlink-menu__badge--individual { background: #2563eb; }
    .tlink-menu__badge--team { background: #7c3aed; }
    .tlink-menu__badge--expired { background: #dc2626; }
    .tlink-menu__badge--invalid { background: #6b7280; }

    .tlink-menu__caret {
      font-size: 10px;
      color: var(--tlink-dialog-muted, #666);
    }

    .tlink-menu__dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 200px;
      background: var(--tlink-dialog-bg, #fff);
      border: 1px solid var(--tlink-border, #e5e7eb);
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      z-index: var(--tlink-menu-z-index, 9999);
      padding: 4px;
      animation: tlink-menu-fade-in 0.1s ease-out;
    }

    @keyframes tlink-menu-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .tlink-menu__item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: none;
      font-size: 13px;
      color: var(--tlink-dialog-color, #1a1a2e);
      cursor: pointer;
      border-radius: 4px;
      text-align: left;
    }

    .tlink-menu__item:hover {
      background: var(--tlink-menu-item-hover, #f3f4f6);
    }

    .tlink-menu__item-icon {
      width: 16px;
      text-align: center;
      font-size: 14px;
    }

    .tlink-menu__header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--tlink-border-light, #f3f4f6);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tlink-menu__header-expiry {
      font-size: 12px;
      color: var(--tlink-dialog-muted, #666);
    }

    .tlink-menu__header-trial {
      font-size: 12px;
      color: #d97706;
      font-weight: 600;
    }

    .tlink-menu__shortcut {
      margin-left: auto;
      font-size: 11px;
      color: var(--tlink-dialog-muted, #999);
    }

    .tlink-menu__separator {
      height: 1px;
      background: var(--tlink-border-light, #f3f4f6);
      margin: 4px 8px;
    }
  `],
})
export class LicenseMenuComponent implements OnInit, OnDestroy {
    @Output() showInfo = new EventEmitter<void>()
    @Output() showActivation = new EventEmitter<void>()
    @Output() showDeactivation = new EventEmitter<void>()
    @Output() showServerSettings = new EventEmitter<void>()
    @Output() buyLicense = new EventEmitter<void>()

    open = false
    info: LicenseInfo | null = null
    badgeLabel = ''
    badgeClass = ''

    private _sub?: Subscription

    constructor(
        private licenseService: TlinkLicenseService,
        private elRef: ElementRef,
    ) {}

    ngOnInit(): void {
        this._sub = this.licenseService.licenseInfo$.subscribe(info => {
            this.info = info
            this._updateBadge(info)
        })
    }

    ngOnDestroy(): void {
        this._sub?.unsubscribe()
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.elRef.nativeElement.contains(event.target)) {
            this.open = false
        }
    }

    toggleMenu(): void {
        this.open = !this.open
    }

    onAction(action: string): void {
        this.open = false
        switch (action) {
            case 'info': this.showInfo.emit(); break
            case 'activate': this.showActivation.emit(); break
            case 'deactivate': this.showDeactivation.emit(); break
            case 'server-settings': this.showServerSettings.emit(); break
            case 'buy': this.buyLicense.emit(); break
        }
    }

    private _updateBadge(info: LicenseInfo): void {
        if (info.status === 'active') {
            if (info.billingType === 'TRIAL') {
                this.badgeLabel = 'Trial'
                this.badgeClass = 'tlink-menu__badge--trial'
            } else if (info.licenseType === 'TEAM') {
                this.badgeLabel = 'Team'
                this.badgeClass = 'tlink-menu__badge--team'
            } else {
                this.badgeLabel = 'Individual'
                this.badgeClass = 'tlink-menu__badge--individual'
            }
        } else if (info.status === 'expired') {
            this.badgeLabel = 'Expired'
            this.badgeClass = 'tlink-menu__badge--expired'
        } else {
            this.badgeLabel = 'Sign in'
            this.badgeClass = 'tlink-menu__badge--invalid'
        }
    }
}
