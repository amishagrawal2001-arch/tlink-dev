import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core'
import { Subscription } from 'rxjs'
import { TlinkLicenseService } from '../../tlink-license.service'
import { LicenseInfo } from '../../models/license.models'
import { FingerprintService } from '../../services/fingerprint.service'

@Component({
    standalone: false,
    selector: 'tlink-admin-panel',
    template: `
    <div class="tlink-overlay" *ngIf="visible" (click)="onOverlayClick($event)">
      <div class="tlink-panel">
        <div class="tlink-panel__header">
          <h2 class="tlink-panel__title">License Information</h2>
          <button class="tlink-panel__close" (click)="close()">&times;</button>
        </div>

        <div class="tlink-panel__body" *ngIf="info">
          <div class="tlink-panel__row">
            <span class="tlink-panel__label">Status</span>
            <span class="tlink-panel__value" [ngClass]="'tlink-panel__status--' + info.status">
              {{ info.status | titlecase }}{{ info.offlineGrace ? ' (offline)' : '' }}
            </span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.userEmail">
            <span class="tlink-panel__label">Account</span>
            <span class="tlink-panel__value">{{ info.userEmail }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.licenseType">
            <span class="tlink-panel__label">License</span>
            <span class="tlink-panel__value">{{ info.licenseType }} / {{ info.billingType }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.startDate">
            <span class="tlink-panel__label">Starts</span>
            <span class="tlink-panel__value">{{ info.startDate }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.endDate">
            <span class="tlink-panel__label">Expires</span>
            <span class="tlink-panel__value">{{ info.endDate }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.deviceId">
            <span class="tlink-panel__label">Device ID</span>
            <span class="tlink-panel__value tlink-panel__mono">{{ info.deviceId }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.licenseId">
            <span class="tlink-panel__label">License ID</span>
            <span class="tlink-panel__value tlink-panel__mono">{{ info.licenseId }}</span>
          </div>

          <div class="tlink-panel__row">
            <span class="tlink-panel__label">Fingerprint</span>
            <span class="tlink-panel__value tlink-panel__mono">{{ fingerprintShort }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.lastServerContactAt">
            <span class="tlink-panel__label">Last server contact</span>
            <span class="tlink-panel__value">{{ info.lastServerContactAt | date:'medium' }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info.lastReasonCode && info.lastReasonCode !== 'OK'">
            <span class="tlink-panel__label">Last reason</span>
            <span class="tlink-panel__value tlink-panel__warning">{{ info.lastReasonCode }}</span>
          </div>
        </div>

        <div class="tlink-panel__footer" *ngIf="info?.status === 'active'">
          <button class="tlink-panel__btn tlink-panel__btn--danger" (click)="deactivate()">
            Sign out of this device
          </button>
        </div>
      </div>
    </div>
  `,
    styles: [`
    :host { display: block; }
    .tlink-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: var(--tlink-dialog-z-index, 10000); font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
    .tlink-panel { background: var(--tlink-dialog-bg, #fff); color: var(--tlink-dialog-color, #1a1a2e); border-radius: 12px; width: 460px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
    .tlink-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--tlink-border, #e5e7eb); }
    .tlink-panel__title { margin: 0; font-size: 18px; font-weight: 600; }
    .tlink-panel__close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--tlink-dialog-muted, #666); line-height: 1; }
    .tlink-panel__close:hover { color: var(--tlink-dialog-color, #1a1a2e); }
    .tlink-panel__body { padding: 16px 24px; }
    .tlink-panel__row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--tlink-border-light, #f3f4f6); }
    .tlink-panel__row:last-child { border-bottom: none; }
    .tlink-panel__label { font-size: 13px; color: var(--tlink-dialog-muted, #666); font-weight: 500; }
    .tlink-panel__value { font-size: 13px; font-weight: 600; text-align: right; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tlink-panel__mono { font-family: monospace; font-size: 11px; letter-spacing: 0.5px; }
    .tlink-panel__status--active { color: #16a34a; }
    .tlink-panel__status--unauthenticated { color: #6b7280; }
    .tlink-panel__status--expired { color: #dc2626; }
    .tlink-panel__status--invalid { color: #dc2626; }
    .tlink-panel__status--unknown { color: #6b7280; }
    .tlink-panel__warning { color: #dc2626; font-weight: 500; font-size: 12px; }
    .tlink-panel__footer { padding: 16px 24px; border-top: 1px solid var(--tlink-border, #e5e7eb); text-align: right; }
    .tlink-panel__btn { padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: background 0.15s; }
    .tlink-panel__btn--danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .tlink-panel__btn--danger:hover { background: #fee2e2; }
  `],
})
export class AdminPanelComponent implements OnInit, OnDestroy {
    @Input() visible = false
    @Output() closed = new EventEmitter<void>()

    info: LicenseInfo | null = null
    fingerprintShort = ''

    private sub?: Subscription

    constructor (
        public licenseService: TlinkLicenseService,
        private fingerprint: FingerprintService,
    ) {}

    async ngOnInit (): Promise<void> {
        const fp = await this.fingerprint.get()
        this.fingerprintShort = fp ? fp.slice(0, 16) + '…' : ''
        this.sub = this.licenseService.licenseInfo$.subscribe(info => { this.info = info })
    }

    ngOnDestroy (): void {
        this.sub?.unsubscribe()
    }

    async deactivate (): Promise<void> {
        await this.licenseService.deactivateLicense()
    }

    close (): void {
        this.closed.emit()
    }

    onOverlayClick (event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('tlink-overlay')) {
            this.close()
        }
    }
}
