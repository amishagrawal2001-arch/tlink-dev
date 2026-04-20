import { Component, EventEmitter, Inject, OnDestroy, OnInit, Optional, Output } from '@angular/core'
import { TlinkLicenseConfig, TLINK_LICENSE_CONFIG, DEFAULT_LICENSE_CONFIG } from '../../tlink-license.config'

@Component({
    standalone: false,
    selector: 'tlink-splash-screen',
    template: `
    <div class="tlink-splash" *ngIf="visible">
      <div class="tlink-splash__content">
        <img
          *ngIf="logoUrl"
          class="tlink-splash__logo"
          [src]="logoUrl"
          [alt]="appName" />
        <div *ngIf="!logoUrl" class="tlink-splash__logo-placeholder">
          {{ appName.charAt(0) }}
        </div>
        <h1 class="tlink-splash__name">{{ appName }}</h1>
        <p class="tlink-splash__version">v{{ appVersion }}</p>
        <div class="tlink-splash__loader">
          <div class="tlink-splash__loader-bar" [style.animationDuration.ms]="duration"></div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    :host { display: block; }

    .tlink-splash {
      position: fixed;
      inset: 0;
      background: var(--tlink-splash-bg, linear-gradient(135deg, #0f172a 0%, #1e293b 100%));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--tlink-splash-z-index, 99999);
      font-family: var(--tlink-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      animation: tlink-splash-fade-in 0.3s ease-out;
    }

    @keyframes tlink-splash-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .tlink-splash__content {
      text-align: center;
    }

    .tlink-splash__logo {
      width: 80px;
      height: 80px;
      margin-bottom: 20px;
      object-fit: contain;
    }

    .tlink-splash__logo-placeholder {
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
      border-radius: 20px;
      background: var(--tlink-primary, #2563eb);
      color: #fff;
      font-size: 36px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tlink-splash__name {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      color: var(--tlink-splash-color, #f1f5f9);
    }

    .tlink-splash__version {
      margin: 6px 0 0;
      font-size: 14px;
      color: var(--tlink-splash-muted, #94a3b8);
    }

    .tlink-splash__loader {
      margin-top: 32px;
      width: 200px;
      height: 3px;
      background: var(--tlink-splash-loader-track, rgba(255,255,255,0.1));
      border-radius: 2px;
      overflow: hidden;
    }

    .tlink-splash__loader-bar {
      height: 100%;
      background: var(--tlink-primary, #2563eb);
      border-radius: 2px;
      animation: tlink-splash-progress linear forwards;
      width: 0;
    }

    @keyframes tlink-splash-progress {
      from { width: 0; }
      to { width: 100%; }
    }
  `],
})
export class SplashScreenComponent implements OnInit, OnDestroy {
    @Output() dismissed = new EventEmitter<void>()

    visible = true
    appName: string
    appVersion: string
    logoUrl: string
    duration: number

    private _timer?: ReturnType<typeof setTimeout>

    constructor(
    @Optional() @Inject(TLINK_LICENSE_CONFIG) config?: TlinkLicenseConfig,
    ) {
        const merged = { ...DEFAULT_LICENSE_CONFIG, ...config }
        this.appName = merged.appName!
        this.appVersion = merged.appVersion!
        this.logoUrl = merged.appLogoUrl!
        this.duration = merged.splashDurationMs!
    }

    ngOnInit(): void {
        this._timer = setTimeout(() => {
            this.visible = false
            this.dismissed.emit()
        }, this.duration)
    }

    ngOnDestroy(): void {
        if (this._timer) {clearTimeout(this._timer)}
    }
}
