import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { TlinkLicenseService } from '../../tlink-license.service';
import { LicenseInfo } from '../../models/license.models';

@Component({
  selector: 'tlink-admin-panel',
  template: `
    <div class="tlink-overlay" *ngIf="visible" (click)="onOverlayClick($event)">
      <div class="tlink-panel">
        <div class="tlink-panel__header">
          <h2 class="tlink-panel__title">License Information</h2>
          <button class="tlink-panel__close" (click)="close()">&times;</button>
        </div>

        <div class="tlink-panel__body">
          <div class="tlink-panel__row">
            <span class="tlink-panel__label">Status</span>
            <span class="tlink-panel__value" [ngClass]="'tlink-panel__status--' + info?.status">
              {{ info?.status | titlecase }}
            </span>
          </div>

          <div class="tlink-panel__row">
            <span class="tlink-panel__label">Tier</span>
            <span class="tlink-panel__value">{{ licenseService.tierDisplayName }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="licenseService.maskedKey">
            <span class="tlink-panel__label">License Key</span>
            <span class="tlink-panel__value tlink-panel__mono">{{ licenseService.maskedKey }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="licenseService.formattedExpiry">
            <span class="tlink-panel__label">Expiry</span>
            <span class="tlink-panel__value">{{ licenseService.formattedExpiry }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info?.status === 'trial'">
            <span class="tlink-panel__label">Trial Remaining</span>
            <span class="tlink-panel__value">{{ info?.trialDaysRemaining }} day{{ info?.trialDaysRemaining !== 1 ? 's' : '' }}</span>
          </div>

          <div class="tlink-panel__row">
            <span class="tlink-panel__label">Machine ID</span>
            <span class="tlink-panel__value tlink-panel__mono">{{ machineId }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="info?.source">
            <span class="tlink-panel__label">Source</span>
            <span class="tlink-panel__value">{{ info?.source | titlecase }}</span>
          </div>

          <div class="tlink-panel__row" *ngIf="licenseService.heartbeatWarning">
            <span class="tlink-panel__label">Warning</span>
            <span class="tlink-panel__value tlink-panel__warning">{{ licenseService.heartbeatWarning }}</span>
          </div>
        </div>

        <div class="tlink-panel__footer" *ngIf="info?.status === 'active'">
          <button class="tlink-panel__btn tlink-panel__btn--danger" (click)="deactivate()">
            Deactivate License
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .tlink-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--tlink-dialog-z-index, 10000);
      font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }

    .tlink-panel {
      background: var(--tlink-dialog-bg, #fff);
      color: var(--tlink-dialog-color, #1a1a2e);
      border-radius: 12px;
      width: 460px;
      max-width: 90vw;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    .tlink-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--tlink-border, #e5e7eb);
    }

    .tlink-panel__title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .tlink-panel__close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: var(--tlink-dialog-muted, #666);
      line-height: 1;
    }

    .tlink-panel__close:hover {
      color: var(--tlink-dialog-color, #1a1a2e);
    }

    .tlink-panel__body {
      padding: 16px 24px;
    }

    .tlink-panel__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--tlink-border-light, #f3f4f6);
    }

    .tlink-panel__row:last-child {
      border-bottom: none;
    }

    .tlink-panel__label {
      font-size: 13px;
      color: var(--tlink-dialog-muted, #666);
      font-weight: 500;
    }

    .tlink-panel__value {
      font-size: 13px;
      font-weight: 600;
    }

    .tlink-panel__mono {
      font-family: monospace;
      font-size: 12px;
      letter-spacing: 0.5px;
    }

    .tlink-panel__status--active { color: #16a34a; }
    .tlink-panel__status--trial { color: #d97706; }
    .tlink-panel__status--expired { color: #dc2626; }
    .tlink-panel__status--invalid { color: #6b7280; }

    .tlink-panel__warning {
      color: #dc2626;
      font-weight: 500;
      font-size: 12px;
    }

    .tlink-panel__footer {
      padding: 16px 24px;
      border-top: 1px solid var(--tlink-border, #e5e7eb);
      text-align: right;
    }

    .tlink-panel__btn {
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }

    .tlink-panel__btn--danger {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }

    .tlink-panel__btn--danger:hover {
      background: #fee2e2;
    }
  `],
})
export class AdminPanelComponent implements OnInit, OnDestroy {
  @Input() visible = false;
  @Output() closed = new EventEmitter<void>();

  info: LicenseInfo | null = null;
  machineId = '';

  private _sub?: Subscription;

  constructor(public licenseService: TlinkLicenseService) {}

  ngOnInit(): void {
    this.machineId = this.licenseService.getMachineId();
    this._sub = this.licenseService.licenseInfo$.subscribe(info => {
      this.info = info;
    });
  }

  ngOnDestroy(): void {
    this._sub?.unsubscribe();
  }

  deactivate(): void {
    this.licenseService.deactivateLicense();
  }

  close(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('tlink-overlay')) {
      this.close();
    }
  }
}
