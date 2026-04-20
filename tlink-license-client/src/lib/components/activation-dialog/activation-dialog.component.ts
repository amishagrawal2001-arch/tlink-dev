import { Component, EventEmitter, Inject, Input, Optional, Output } from '@angular/core'
import { TlinkLicenseService } from '../../tlink-license.service'
import { TlinkLicenseConfig, TLINK_LICENSE_CONFIG, DEFAULT_LICENSE_CONFIG } from '../../tlink-license.config'

@Component({
    standalone: false,
    selector: 'tlink-activation-dialog',
    template: `
    <div class="tlink-overlay" *ngIf="visible" (click)="onOverlayClick($event)">
      <div class="tlink-dialog">
        <button class="tlink-dialog__close" (click)="close()" *ngIf="!blocking">&times;</button>
        <h2 class="tlink-dialog__title">{{ blocking ? 'Sign in required' : 'Sign in to activate' }}</h2>
        <p class="tlink-dialog__subtitle" *ngIf="blocking">
          Your license session is no longer valid. Sign in with your account to continue.
        </p>

        <div class="tlink-dialog__body" *ngIf="!offlineMode">
          <label class="tlink-dialog__label">Email</label>
          <input
            class="tlink-dialog__input"
            type="email"
            autocomplete="email"
            [(ngModel)]="email"
            placeholder="you@example.com"
            [disabled]="activating"
            (keydown.enter)="passwordInput?.focus()"
            #emailInput />

          <label class="tlink-dialog__label">Password</label>
          <input
            class="tlink-dialog__input"
            type="password"
            autocomplete="current-password"
            [(ngModel)]="password"
            placeholder="Your password"
            [disabled]="activating"
            (keydown.enter)="activate()"
            #passwordInput />

          <div class="tlink-dialog__message" *ngIf="message"
               [class.tlink-dialog__message--error]="!success"
               [class.tlink-dialog__message--success]="success">
            {{ message }}
          </div>

          <div class="tlink-dialog__actions">
            <button
              class="tlink-dialog__btn tlink-dialog__btn--primary"
              (click)="activate()"
              [disabled]="activating || !email.trim() || !password">
              {{ activating ? 'Signing in…' : 'Sign in' }}
            </button>
          </div>

          <div class="tlink-dialog__footer">
            <a class="tlink-dialog__link" href="javascript:void(0)" (click)="offlineMode = true; message = ''">
              Have an activation code?
            </a>
            <span style="opacity:0.4; margin: 0 8px;">|</span>
            <a class="tlink-dialog__link" [href]="purchaseUrl" target="_blank" rel="noopener">
              Get a license
            </a>
          </div>
        </div>

        <div class="tlink-dialog__body" *ngIf="offlineMode">
          <label class="tlink-dialog__label">Activation code</label>
          <textarea
            class="tlink-dialog__input"
            rows="6"
            style="font-family: monospace; font-size: 11px; resize: vertical;"
            [(ngModel)]="offlineCode"
            placeholder="Paste the offline activation code provided by your admin (a long string starting with eyJ…)"
            [disabled]="activating"></textarea>

          <div class="tlink-dialog__message" *ngIf="message"
               [class.tlink-dialog__message--error]="!success"
               [class.tlink-dialog__message--success]="success">
            {{ message }}
          </div>

          <div class="tlink-dialog__actions">
            <button
              class="tlink-dialog__btn tlink-dialog__btn--primary"
              (click)="redeem()"
              [disabled]="activating || !offlineCode.trim()">
              {{ activating ? 'Verifying…' : 'Activate' }}
            </button>
          </div>

          <div class="tlink-dialog__footer">
            <a class="tlink-dialog__link" href="javascript:void(0)" (click)="offlineMode = false; message = ''">
              ← Back to sign-in
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    :host { display: block; }
    .tlink-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: var(--tlink-dialog-z-index, 10000); font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
    .tlink-dialog { background: var(--tlink-dialog-bg, #fff); color: var(--tlink-dialog-color, #1a1a2e); border-radius: 12px; padding: 32px; width: 420px; max-width: 90vw; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .tlink-dialog__close { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--tlink-dialog-muted, #666); line-height: 1; }
    .tlink-dialog__close:hover { color: var(--tlink-dialog-color, #1a1a2e); }
    .tlink-dialog__title { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
    .tlink-dialog__subtitle { color: #dc2626; font-size: 13px; margin: 0 0 16px; }
    .tlink-dialog__label { display: block; margin: 12px 0 6px; font-size: 13px; font-weight: 500; color: var(--tlink-dialog-muted, #666); }
    .tlink-dialog__input { width: 100%; padding: 10px 12px; border: 1px solid var(--tlink-input-border, #ddd); border-radius: 6px; font-size: 14px; box-sizing: border-box; background: var(--tlink-input-bg, #fff); color: var(--tlink-dialog-color, #1a1a2e); }
    .tlink-dialog__input:focus { outline: none; border-color: var(--tlink-primary, #2563eb); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .tlink-dialog__message { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .tlink-dialog__message--error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .tlink-dialog__message--success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .tlink-dialog__actions { display: flex; gap: 10px; margin-top: 20px; }
    .tlink-dialog__btn { padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s; }
    .tlink-dialog__btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .tlink-dialog__btn--primary { background: var(--tlink-primary, #2563eb); color: #fff; flex: 1; }
    .tlink-dialog__btn--primary:hover:not(:disabled) { background: var(--tlink-primary-hover, #1d4ed8); }
    .tlink-dialog__footer { margin-top: 16px; text-align: center; }
    .tlink-dialog__link { color: var(--tlink-primary, #2563eb); font-size: 13px; text-decoration: none; }
    .tlink-dialog__link:hover { text-decoration: underline; }
  `],
})
export class ActivationDialogComponent {
    @Input() visible = false
    @Input() blocking = false
    @Output() activated = new EventEmitter<void>()
    @Output() closed = new EventEmitter<void>()

    email = ''
    password = ''
    message = ''
    success = false
    activating = false
    purchaseUrl: string
    offlineMode = false
    offlineCode = ''

    constructor (
        public licenseService: TlinkLicenseService,
        @Optional() @Inject(TLINK_LICENSE_CONFIG) config?: TlinkLicenseConfig,
    ) {
        const merged = { ...DEFAULT_LICENSE_CONFIG, ...(config ?? {}) }
        this.purchaseUrl = merged.purchaseUrl
    }

    async activate (): Promise<void> {
        if (!this.email.trim() || !this.password || this.activating) {return}
        this.activating = true
        this.message = ''

        const result = await this.licenseService.activateLicense(this.email, this.password)
        this.message = result.message
        this.success = result.success
        this.activating = false

        if (result.success) {
            this.password = ''
            this.activated.emit()
        }
    }

    async redeem (): Promise<void> {
        if (!this.offlineCode.trim() || this.activating) {return}
        this.activating = true
        this.message = ''

        const result = await this.licenseService.redeemOfflineCode(this.offlineCode)
        this.message = result.message
        this.success = result.success
        this.activating = false

        if (result.success) {
            this.offlineCode = ''
            this.activated.emit()
        }
    }

    close (): void {
        if (this.blocking) {return}
        this.message = ''
        this.password = ''
        this.closed.emit()
    }

    onOverlayClick (event: MouseEvent): void {
        if (this.blocking) {return}
        if ((event.target as HTMLElement).classList.contains('tlink-overlay')) {
            this.close()
        }
    }
}
