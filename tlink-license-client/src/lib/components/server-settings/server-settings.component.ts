import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TlinkLicenseService } from '../../tlink-license.service';

@Component({
  selector: 'tlink-server-settings',
  template: `
    <div class="tlink-overlay" *ngIf="visible" (click)="onOverlayClick($event)">
      <div class="tlink-dialog">
        <div class="tlink-dialog__header">
          <h2 class="tlink-dialog__title">Server Settings</h2>
          <button class="tlink-dialog__close" (click)="close()">&times;</button>
        </div>

        <div class="tlink-dialog__body">
          <label class="tlink-dialog__label">License Server URL</label>
          <input
            class="tlink-dialog__input"
            type="url"
            [(ngModel)]="serverUrlInput"
            placeholder="http://localhost:4000"
            [disabled]="testing" />

          <div class="tlink-dialog__test-row">
            <button
              class="tlink-dialog__btn tlink-dialog__btn--outline"
              (click)="testConnection()"
              [disabled]="testing || !serverUrlInput.trim()">
              {{ testing ? 'Testing...' : 'Test Connection' }}
            </button>
            <span class="tlink-dialog__test-result" *ngIf="testMessage"
                  [class.tlink-dialog__test-result--ok]="testOk"
                  [class.tlink-dialog__test-result--fail]="!testOk">
              {{ testMessage }}
            </span>
          </div>
        </div>

        <div class="tlink-dialog__footer">
          <button
            class="tlink-dialog__btn tlink-dialog__btn--secondary"
            (click)="close()">
            Cancel
          </button>
          <button
            class="tlink-dialog__btn tlink-dialog__btn--primary"
            (click)="save()"
            [disabled]="!serverUrlInput.trim()">
            Save
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

    .tlink-dialog {
      background: var(--tlink-dialog-bg, #fff);
      color: var(--tlink-dialog-color, #1a1a2e);
      border-radius: 12px;
      width: 440px;
      max-width: 90vw;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    .tlink-dialog__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--tlink-border, #e5e7eb);
    }

    .tlink-dialog__title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .tlink-dialog__close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: var(--tlink-dialog-muted, #666);
      line-height: 1;
    }

    .tlink-dialog__close:hover {
      color: var(--tlink-dialog-color, #1a1a2e);
    }

    .tlink-dialog__body {
      padding: 20px 24px;
    }

    .tlink-dialog__label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--tlink-dialog-muted, #666);
    }

    .tlink-dialog__input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--tlink-input-border, #ddd);
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
      background: var(--tlink-input-bg, #fff);
      color: var(--tlink-dialog-color, #1a1a2e);
    }

    .tlink-dialog__input:focus {
      outline: none;
      border-color: var(--tlink-primary, #2563eb);
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }

    .tlink-dialog__test-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }

    .tlink-dialog__test-result {
      font-size: 13px;
      font-weight: 500;
    }

    .tlink-dialog__test-result--ok { color: #16a34a; }
    .tlink-dialog__test-result--fail { color: #dc2626; }

    .tlink-dialog__footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid var(--tlink-border, #e5e7eb);
    }

    .tlink-dialog__btn {
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }

    .tlink-dialog__btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .tlink-dialog__btn--primary {
      background: var(--tlink-primary, #2563eb);
      color: #fff;
    }

    .tlink-dialog__btn--primary:hover:not(:disabled) {
      background: var(--tlink-primary-hover, #1d4ed8);
    }

    .tlink-dialog__btn--secondary {
      background: var(--tlink-secondary-bg, #f3f4f6);
      color: var(--tlink-dialog-color, #1a1a2e);
    }

    .tlink-dialog__btn--secondary:hover:not(:disabled) {
      background: var(--tlink-secondary-hover, #e5e7eb);
    }

    .tlink-dialog__btn--outline {
      background: transparent;
      border: 1px solid var(--tlink-border, #e5e7eb);
      color: var(--tlink-dialog-color, #1a1a2e);
    }

    .tlink-dialog__btn--outline:hover:not(:disabled) {
      background: var(--tlink-secondary-bg, #f3f4f6);
    }
  `],
})
export class ServerSettingsComponent {
  @Input() visible = false;
  @Output() saved = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  serverUrlInput = '';
  testing = false;
  testMessage = '';
  testOk = false;

  constructor(private licenseService: TlinkLicenseService) {
    this.serverUrlInput = this.licenseService.serverUrl;
  }

  async testConnection(): Promise<void> {
    if (!this.serverUrlInput.trim() || this.testing) return;
    this.testing = true;
    this.testMessage = '';

    const result = await this.licenseService.testServerConnection(this.serverUrlInput.trim());
    this.testOk = result.reachable;
    this.testMessage = result.reachable
      ? `Connected (${result.latencyMs}ms)`
      : result.message;
    this.testing = false;
  }

  save(): void {
    const url = this.serverUrlInput.trim();
    if (!url) return;
    this.licenseService.serverUrl = url;
    this.saved.emit(url);
    this.close();
  }

  close(): void {
    this.testMessage = '';
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('tlink-overlay')) {
      this.close();
    }
  }
}
