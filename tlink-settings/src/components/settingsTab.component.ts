/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import * as yaml from 'js-yaml'
import { debounce } from 'utils-decorators/dist/esm/debounce/debounce'
import { Component, Inject, Input, HostBinding, Injector } from '@angular/core'
import {
    ConfigService,
    BaseTabComponent as CoreBaseTabComponent,
    HostAppService,
    Platform,
    HomeBaseService,
    UpdaterService,
    PlatformService,
    HostWindowService,
    AppService,
    LocaleService,
    TranslateService,
} from 'tlink-core'

import { SettingsTabProvider } from '../api'
import { ReleaseNotesComponent } from './releaseNotesTab.component'
import { TlinkLicenseService } from '../../../tlink-license-client/src/lib/tlink-license.service'

// Guard against missing core export to avoid runtime crashes when a builder
// tree-shakes the re-export. TS types it as non-null but at runtime the
// import can still be undefined if core is loaded from a stale bundle.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-extraneous-class, @typescript-eslint/no-explicit-any
const BaseTabComponent: any = CoreBaseTabComponent ?? class {}

/** @hidden */
@Component({
    selector: 'settings-tab',
    templateUrl: './settingsTab.component.pug',
    styleUrls: [
        './settingsTab.component.scss',
    ],
})
export class SettingsTabComponent extends BaseTabComponent {
    @Input() activeTab: string
    Platform = Platform
    configDefaults: any
    configFile: string
    isShellIntegrationInstalled = false
    checkingForUpdate = false
    updateAvailable = false
    showConfigDefaults = false
    licenseEmailInput = ''
    licensePasswordInput = ''
    licenseError = ''
    licenseSuccess = ''
    // Latest license info snapshot; kept in sync via licenseInfo$ subscription so
    // templates that bind to it re-render deterministically after sign-in/out.
    licenseInfo: any = null
    serverUrl = ''
    serverTestResult = ''
    // Product code sent to the license server during activate / validate.
    // Editable at runtime so a tenant whose product slug differs from the
    // build-time default can override it without rebuilding the app.
    productCode = ''
    productCodeSaved = false
    // Cached fingerprint of this machine. Resolved asynchronously in
    // ngOnInit — the UI shows "—" until populated. Users copy this value
    // and send it to their admin when requesting an offline activation code
    // so the resulting code can be device-bound.
    deviceFingerprint = ''
    fingerprintCopied = false
    allLanguages = LocaleService.allLanguages
    @HostBinding('class.pad-window-controls') padWindowControls = false

    // Angular DI constructor — many dependencies is idiomatic here and
    // can't be meaningfully reduced without losing access to framework services.
    // eslint-disable-next-line @typescript-eslint/max-params
    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        public hostWindow: HostWindowService,
        public homeBase: HomeBaseService,
        public platform: PlatformService,
        public locale: LocaleService,
        public updater: UpdaterService,
        private app: AppService,
        @Inject(SettingsTabProvider) public settingsProviders: SettingsTabProvider[],
        public licenseSvc: TlinkLicenseService,
        translate: TranslateService,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle(translate.instant(_('Settings')))
        this.serverUrl = licenseSvc.serverUrl
        this.productCode = licenseSvc.productCode
        // Pre-fill the sign-in email field. Prefer the live `userEmail`
        // (active session) so a user inspecting Settings sees what they're
        // signed in as; fall back to `lastSignInEmail` after a wipe / first
        // launch since restart so they don't have to retype it.
        this.licenseEmailInput = licenseSvc.userEmail ?? licenseSvc.lastSignInEmail
        this.settingsProviders = config.enabledServices(this.settingsProviders)
        this.settingsProviders = this.settingsProviders.filter(x => {
            const componentType = x.getComponentType()
            if (!componentType) {
                console.warn('Settings provider has no component type:', x.id, x.constructor.name)
            }
            return !!componentType
        })
        this.settingsProviders.sort((a, b) => a.weight - b.weight + a.title.localeCompare(b.title))
        console.log('Loaded settings providers:', this.settingsProviders.map(p => ({ id: p.id, title: p.title, component: p.getComponentType()?.name })))

        this.configDefaults = yaml.dump(config.getDefaults())

        const onConfigChange = () => {
            this.configFile = config.readRaw()
            this.padWindowControls = hostApp.platform === Platform.macOS
                && config.store.appearance.tabsLocation !== 'top'
        }

        this.subscribeUntilDestroyed(config.changed$, onConfigChange)
        onConfigChange()

        // Force re-render of the License tab whenever the license state changes.
        // Assigning to `licenseInfo` creates a concrete binding Angular's change
        // detector recognises, even if some parent boundary is OnPush.
        this.subscribeUntilDestroyed(licenseSvc.licenseInfo$, info => {
            this.licenseInfo = info
            // eslint-disable-next-line no-console
            console.debug('[license] state changed', {
                status: info?.status,
                userEmail: info?.userEmail,
                isLocalTrial: info?.isLocalTrial,
                licenseType: info?.licenseType,
                billingType: info?.billingType,
                reason: info?.lastReasonCode,
            })
        })
    }

    async ngOnInit () {
        this.isShellIntegrationInstalled = await this.platform.isShellIntegrationInstalled()
        try {
            this.deviceFingerprint = await this.licenseSvc.getDeviceFingerprint()
        } catch {
            this.deviceFingerprint = ''
        }
    }

    async copyDeviceFingerprint () {
        if (!this.deviceFingerprint) {return}
        try {
            await navigator.clipboard.writeText(this.deviceFingerprint)
            this.fingerprintCopied = true
            setTimeout(() => { this.fingerprintCopied = false }, 1500)
        } catch {
            // Clipboard API can fail in restricted contexts; keep UI quiet.
        }
    }

    async toggleShellIntegration () {
        if (!this.isShellIntegrationInstalled) {
            await this.platform.installShellIntegration()
        } else {
            await this.platform.uninstallShellIntegration()
        }
        this.isShellIntegrationInstalled = await this.platform.isShellIntegrationInstalled()
    }

    ngOnDestroy () {
        this.config.save()
    }

    restartApp () {
        this.hostApp.relaunch()
    }

    @debounce(500)
    saveConfiguration (requireRestart?: boolean) {
        this.config.save()
        if (requireRestart) {
            this.config.requestRestart()
        }
    }

    saveConfigFile () {
        if (this.isConfigFileValid()) {
            this.config.writeRaw(this.configFile)
        }
    }

    showConfigFile () {
        this.platform.showItemInFolder(this.platform.getConfigPath()!)
    }

    isConfigFileValid () {
        try {
            yaml.load(this.configFile)
            return true
        } catch {
            return false
        }
    }

    async checkForUpdates () {
        this.checkingForUpdate = true
        this.updateAvailable = await this.updater.check()
        this.checkingForUpdate = false
    }

    showReleaseNotes () {
        this.app.openNewTabRaw({
            type: ReleaseNotesComponent as any,
        })
    }

    async activateLicense () {
        if (this.licenseSigningIn) {return}
        this.licenseError = ''
        this.licenseSuccess = ''
        if (!this.licenseEmailInput.trim() || !this.licensePasswordInput) {
            this.licenseError = 'Please enter your email and password'
            return
        }
        this.licenseSigningIn = true
        try {
            const result = await this.licenseSvc.activateLicense(this.licenseEmailInput.trim(), this.licensePasswordInput)
            if (result.success) {
                this.licenseSuccess = result.message || 'Signed in successfully!'
                this.licensePasswordInput = ''
                // Auto-collapse the form on successful sign-in so the user
                // sees the slim "Signed in as …" row rather than the form
                // still sitting open.
                this.showSignInForm = false
            } else {
                this.licenseError = result.message || 'Sign in failed'
            }
        } finally {
            this.licenseSigningIn = false
        }
    }

    // ─── Offline activation (Settings panel surface) ───────────────────────
    //
    // The activation dialog has a "Have an activation code?" link that pivots
    // its body into offline-redeem mode. But that dialog only opens when the
    // user is NOT signed in — a paid user who needs to switch to an offline
    // session, or a trial user who has a code in hand, has no path. Mirror
    // the redeem flow here so the Settings panel can drive it too.

    /** Toggleable visibility of the offline-activation form. Hidden by default
     *  so the panel doesn't show a giant textarea to users who don't need it. */
    showOfflineActivation = false
    offlineCodeInput = ''
    offlineRedeeming = false
    offlineRedeemError = ''
    offlineRedeemSuccess = ''

    toggleOfflineActivation () {
        this.showOfflineActivation = !this.showOfflineActivation
        if (!this.showOfflineActivation) {
            this.offlineRedeemError = ''
            this.offlineRedeemSuccess = ''
        }
    }

    async redeemOfflineCode () {
        if (this.offlineRedeeming) {return}
        this.offlineRedeemError = ''
        this.offlineRedeemSuccess = ''
        const code = this.offlineCodeInput.trim()
        if (!code) {
            this.offlineRedeemError = 'Paste an activation code first.'
            return
        }
        this.offlineRedeeming = true
        try {
            const result = await this.licenseSvc.redeemOfflineCode(code)
            if (result.success) {
                this.offlineRedeemSuccess = result.message || 'Activated.'
                this.offlineCodeInput = ''
                // Auto-collapse the form once redemption lands so the user
                // sees the new active license, not the still-open form.
                setTimeout(() => { this.showOfflineActivation = false }, 1500)
            } else {
                this.offlineRedeemError = result.message || 'Activation failed.'
            }
        } finally {
            this.offlineRedeeming = false
        }
    }

    async deactivateLicense () {
        await this.licenseSvc.deactivateLicense()
        this.licenseSuccess = ''
        this.licenseError = ''
    }

    licenseRefreshing = false

    async refreshLicense () {
        if (this.licenseRefreshing) {return}
        this.licenseRefreshing = true
        this.licenseSuccess = ''
        this.licenseError = ''
        try {
            const result = await this.licenseSvc.refreshLicense()
            if (result.success) {
                this.licenseSuccess = result.message
            } else {
                this.licenseError = result.message
            }
        } finally {
            this.licenseRefreshing = false
        }
    }

    async testServerConnection () {
        this.serverTestResult = 'Testing...'
        try {
            const result = await this.licenseSvc.testServerConnection(this.serverUrl)
            this.serverTestResult = result.reachable ? `connected (${result.latencyMs}ms)` : `failed: ${result.message}`
        } catch {
            this.serverTestResult = 'Connection failed'
        }
    }

    /**
     * Toggle for the Sign-in / Switch-account form. When the user is
     * already signed in, the form sits collapsed behind a "Switch
     * account" expander button — no need to render two big inputs all
     * the time. Defaults to TRUE on a fresh launch with no session,
     * so first-time users still see the form immediately.
     */
    showSignInForm = !this.licenseSvc.userEmail
    toggleSignInForm () {
        this.showSignInForm = !this.showSignInForm
    }

    /**
     * In-flight flag for the Sign-in button — flips while activate is
     * pending so the button can show a spinner + disabled state. The
     * existing `activateLicense()` method awaits the service call,
     * so we just bracket the await with set/clear.
     */
    licenseSigningIn = false

    /**
     * Render the heartbeat history ring buffer as a fixed-width
     * polyline `points` attribute for an inline SVG sparkline. Returns
     * empty string when there's nothing to draw so the template can
     * `*ngIf` the SVG out entirely. Caches the input identity so we're
     * not re-stringifying the array on every CD pass.
     */
    private heartbeatSparklineCache: { samples: number[]; svg: string } = { samples: [], svg: '' }
    heartbeatSparklinePoints (): string {
        const samples = this.licenseSvc.heartbeatRecentDurations
        if (!samples.length) {return ''}
        // Cheap reference equality first — same array, same string.
        if (samples === this.heartbeatSparklineCache.samples) {
            return this.heartbeatSparklineCache.svg
        }
        // Length-aware compare for the proxy case (returns a fresh array
        // copy each call) — only recompute on real change.
        const prev = this.heartbeatSparklineCache.samples
        if (samples.length === prev.length && samples.every((v, i) => v === prev[i])) {
            this.heartbeatSparklineCache.samples = samples
            return this.heartbeatSparklineCache.svg
        }
        const W = 80
        const H = 18
        const max = Math.max(...samples, 1)
        const step = samples.length > 1 ? W / (samples.length - 1) : 0
        const svg = samples
            .map((ms, i) => {
                const x = (i * step).toFixed(1)
                // Invert Y so taller bars = slower; clamp 1px floor so a
                // 0ms cached response still draws something.
                const y = (H - Math.max(1, (ms / max) * H)).toFixed(1)
                return `${x},${y}`
            })
            .join(' ')
        this.heartbeatSparklineCache = { samples, svg }
        return svg
    }

    /**
     * Trial progress as a percentage (0-100). Used to fill the linear
     * progress bar in the status card when on a local trial. Returns
     * 0 when not on trial or no telemetry available.
     */
    trialProgressPercent (): number {
        const total = this.licenseSvc.trialDurationDays
        if (!total) {return 0}
        const used = total - this.licenseSvc.trialDaysRemaining
        return Math.min(100, Math.max(0, (used / total) * 100))
    }

    /**
     * Friendly expiry copy for the status card. Turns the ISO
     * "2027-05-02" into "May 2, 2027 · 365 days left" so the user
     * doesn't have to do date math. Returns '—' when no expiry
     * (offline grace, perpetual license, etc).
     */
    formatExpiry (): string {
        const iso = this.licenseSvc.endDate
        if (!iso) {return '—'}
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) {return iso}
        const pretty = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        const days = this.daysUntilEndDate()
        if (days === null) {return pretty}
        if (days < 0) {return `${pretty} · expired ${Math.abs(days)}d ago`}
        if (days === 0) {return `${pretty} · expires today`}
        if (days === 1) {return `${pretty} · 1 day left`}
        return `${pretty} · ${days} days left`
    }

    /**
     * Just the date portion of `formatExpiry()` — "May 2, 2027" — for
     * inline messaging like the offline-grace banner that already
     * provides its own framing copy.
     */
    formatExpiryDateOnly (): string {
        const iso = this.licenseSvc.endDate
        if (!iso) {return '—'}
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) {return iso}
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    }

    /**
     * Whole-day count between now and `endDate`. Negative when expired,
     * 0 on the last day, null when no endDate is set.
     */
    daysUntilEndDate (): number | null {
        const iso = this.licenseSvc.endDate
        if (!iso) {return null}
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) {return null}
        return Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }

    /**
     * Surface the approaching-expiry nudge for paid users in the last
     * 14 days of their subscription. Excludes trials (the trial bar
     * covers them), excludes already-expired (status will be 'expired'
     * and a different code path takes over).
     */
    showExpiryWarning (): boolean {
        if (this.licenseSvc.licenseStatus !== 'active') {return false}
        if (this.licenseSvc.isLocalTrial) {return false}
        if (this.licenseSvc.billingType !== 'PAID') {return false}
        const days = this.daysUntilEndDate()
        if (days === null) {return false}
        return days >= 0 && days <= 14
    }

    saveServerUrl () {
        this.licenseSvc.serverUrl = this.serverUrl
        localStorage.setItem('tlink-license-server-url', this.serverUrl)
    }

    saveProductCode () {
        this.licenseSvc.productCode = this.productCode
        // Reflect what actually got persisted (may have been blank-trimmed
        // back to the config default).
        this.productCode = this.licenseSvc.productCode
        this.productCodeSaved = true
        setTimeout(() => { this.productCodeSaved = false }, 2000)
    }

    // ─── Heartbeat observability helpers (Settings → License) ──────────

    /** Pretty-print the configured heartbeat interval (e.g. "4h", "30m", "45s"). */
    formatHeartbeatInterval (): string {
        const ms = this.licenseSvc.heartbeatIntervalMs
        if (ms <= 0) {return '—'}
        const sec = Math.round(ms / 1000)
        if (sec < 60) {return `${sec}s`}
        const min = Math.round(sec / 60)
        if (min < 60) {return `${min}m`}
        const hr = Math.round((min / 60) * 10) / 10
        return `${hr}h`
    }

    /**
     * Cached "N seconds/minutes/hours ago" text for the most recent
     * heartbeat. Recomputed once per second by `heartbeatTickerStarted`
     * below, NOT on every change-detection pass. Computing on every CD
     * pass triggered NG0100 (ExpressionChangedAfterItHasBeenChecked)
     * because Date.now() ticked between Angular's check and re-check
     * inside the same tick — "2s ago" → "3s ago" was the classic
     * symptom.
     */
    heartbeatLastRunFormatted = '—'
    /**
     * "Last successful contact" relative-time string. Driven by the
     * same 1Hz interval as `heartbeatLastRunFormatted` so the OFFLINE
     * GRACE banner can show "Last sync: 4h ago" without triggering
     * NG0100 ExpressionChangedAfterItHasBeenChecked.
     */
    lastServerContactFormatted = '—'

    /** Render a Date as a "Ns ago" / "Nm ago" / "Nh ago" string. */
    private static formatRelativeAge (at: Date | null): string {
        if (!at) {return '—'}
        const ageSec = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000))
        if (ageSec < 60) {return `${ageSec}s ago`}
        if (ageSec < 3600) {return `${Math.round(ageSec / 60)}m ago`}
        if (ageSec < 86400) {return `${Math.round(ageSec / 360) / 10}h ago`}
        return `${Math.round(ageSec / 8640) / 10}d ago`
    }

    private heartbeatTickerStarted = false
    private startHeartbeatTickerOnce () {
        if (this.heartbeatTickerStarted) {return}
        this.heartbeatTickerStarted = true
        const refresh = () => {
            this.heartbeatLastRunFormatted = SettingsTabComponent.formatRelativeAge(this.licenseSvc.heartbeatLastRunAt)
            this.lastServerContactFormatted = SettingsTabComponent.formatRelativeAge(this.licenseSvc.lastServerContactAt)
        }
        refresh()
        // 1Hz is plenty for human-readable "N seconds ago" text.
        setInterval(refresh, 1000)
    }

    formatHeartbeatLastRun (): string {
        this.startHeartbeatTickerOnce()
        return this.heartbeatLastRunFormatted
    }

    formatLastServerContact (): string {
        this.startHeartbeatTickerOnce()
        return this.lastServerContactFormatted
    }

    triggerHeartbeatRunning = false
    async triggerHeartbeat () {
        if (this.triggerHeartbeatRunning) {return}
        this.triggerHeartbeatRunning = true
        try {
            await this.licenseSvc.triggerHeartbeat()
        } finally {
            this.triggerHeartbeatRunning = false
        }
    }
}
