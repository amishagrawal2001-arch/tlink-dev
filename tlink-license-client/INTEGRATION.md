# @tlink/license-client

Reusable Angular library for license management UI in Tlink applications. Provides license activation, trial management, server communication, and pre-built UI components.

## Installation

```bash
npm install @tlink/license-client
```

Or link locally during development:

```bash
cd tlink-license-client && npm run build
cd ../your-app && npm link ../tlink-license-client/dist
```

## Setup

Import the module in your app module with configuration:

```typescript
import { TlinkLicenseModule } from '@tlink/license-client';

@NgModule({
  imports: [
    TlinkLicenseModule.forRoot({
      serverUrl: 'https://license.yourapp.com',
      appCode: 'NO',            // 2-letter app identifier
      appVersion: '2.0.0',
      appName: 'NetOps',
      appLogoUrl: '/assets/logo.png',
      trialDurationDays: 14,
      splashDurationMs: 2500,
      purchaseUrl: 'https://yourapp.com/pricing',
      serverKeySalt: 'your-production-salt',
      proFeatures: ['save', 'export', 'templates'],
    }),
  ],
})
export class AppModule {}
```

## Components

### Trial Banner

Displays license status: amber for trial, blue for Pro, purple for Enterprise.

```html
<tlink-trial-banner (upgrade)="openActivation()"></tlink-trial-banner>
```

### Activation Dialog

Modal dialog for entering and activating license keys.

```html
<tlink-activation-dialog
  [visible]="showActivation"
  (activated)="onActivated()"
  (closed)="showActivation = false">
</tlink-activation-dialog>
```

### Splash Screen

Full-screen splash with logo, app name, version, and loading bar.

```html
<tlink-splash-screen (dismissed)="onSplashDone()"></tlink-splash-screen>
```

### Admin Panel

Displays license details: masked key, status, tier, expiry, machine ID, source.

```html
<tlink-admin-panel
  [visible]="showAdmin"
  (closed)="showAdmin = false">
</tlink-admin-panel>
```

### License Menu

Dropdown menu with license actions: Info, Activate, Deactivate, Server Settings, Buy.

```html
<tlink-license-menu
  (showInfo)="showAdmin = true"
  (showActivation)="showActivation = true"
  (showDeactivation)="licenseService.deactivateLicense()"
  (showServerSettings)="showServerSettings = true"
  (buyLicense)="openPurchaseUrl()">
</tlink-license-menu>
```

### Server Settings

Dialog for configuring the license server URL with connection testing.

```html
<tlink-server-settings
  [visible]="showServerSettings"
  (saved)="onServerSaved($event)"
  (closed)="showServerSettings = false">
</tlink-server-settings>
```

## Service API

Inject `TlinkLicenseService` to interact with license state programmatically:

```typescript
import { TlinkLicenseService } from '@tlink/license-client';

@Component({ ... })
export class AppComponent {
  constructor(public licenseService: TlinkLicenseService) {}

  async activate(key: string) {
    const result = await this.licenseService.activateLicense(key);
    console.log(result.success, result.message);
  }

  checkFeature(feature: string): boolean {
    return this.licenseService.isFeatureAvailable(feature);
  }
}
```

### Key Methods

| Method | Description |
|--------|-------------|
| `activateLicense(key)` | Async activation with server fallback to local |
| `activateLicenseSync(key)` | Synchronous local-only activation |
| `deactivateLicense()` | Remove stored license |
| `startTrial()` | Start the free trial period |
| `checkLicense()` | Re-evaluate and return current status |
| `validateKey(key)` | Offline key validation (5 and 6 segment) |
| `isFeatureAvailable(feature)` | Check if a feature is available |
| `testServerConnection(url?)` | Test license server reachability |
| `getMachineId()` | Get browser-based machine fingerprint |
| `setServerKeySalt(salt)` | Override the server key checksum salt |

### Reactive State

Subscribe to `licenseInfo$` for reactive updates:

```typescript
this.licenseService.licenseInfo$.subscribe(info => {
  console.log(info.status, info.tier, info.trialDaysRemaining);
});
```

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `licenseStatus` | `LicenseStatus` | Current status |
| `licenseTier` | `LicenseTier` | Current tier |
| `trialDaysRemaining` | `number` | Days left in trial |
| `maskedKey` | `string` | Partially hidden key for display |
| `formattedExpiry` | `string` | Human-readable expiry date |
| `tierDisplayName` | `string` | Display name for current tier |
| `shouldBlockApp` | `boolean` | Whether app should show blocking overlay |
| `showTrialBanner` | `boolean` | Whether trial banner should show |
| `heartbeatWarning` | `string \| null` | Warning from failed heartbeats |

## Key Formats

The library supports two license key formats:

- **5-segment (local):** `TLINK-XXXX-YYMM-XXXX-CCCC`
- **6-segment (server):** `TLINK-AA-TXXX-YYMM-XXXX-CCCC`

6-segment keys attempt server activation first, then fall back to local validation if the server is unreachable.

## Theming

All components use CSS custom properties for theming:

```css
:root {
  --tlink-primary: #2563eb;
  --tlink-primary-hover: #1d4ed8;
  --tlink-font-family: 'Inter', sans-serif;
  --tlink-dialog-bg: #fff;
  --tlink-dialog-color: #1a1a2e;
  --tlink-dialog-muted: #666;
  --tlink-input-border: #ddd;
  --tlink-input-bg: #fff;
  --tlink-border: #e5e7eb;
  --tlink-border-light: #f3f4f6;
  --tlink-banner-trial-bg: #d97706;
  --tlink-banner-pro-bg: #2563eb;
  --tlink-banner-enterprise-bg: #7c3aed;
  --tlink-splash-bg: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  --tlink-splash-color: #f1f5f9;
  --tlink-dialog-z-index: 10000;
}
```

## License

Proprietary - Tlink Technologies
