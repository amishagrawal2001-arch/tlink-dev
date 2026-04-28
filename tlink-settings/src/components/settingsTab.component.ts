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
    // Self-service device list.
    myDevices: any[] = []
    devicesLoading = false
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
        this.licenseEmailInput = licenseSvc.userEmail ?? licenseSvc.lastSignInEmail ?? ''
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
        this.licenseError = ''
        this.licenseSuccess = ''
        if (!this.licenseEmailInput.trim() || !this.licensePasswordInput) {
            this.licenseError = 'Please enter your email and password'
            return
        }
        const result = await this.licenseSvc.activateLicense(this.licenseEmailInput.trim(), this.licensePasswordInput)
        if (result.success) {
            this.licenseSuccess = result.message || 'Signed in successfully!'
            this.licensePasswordInput = ''
        } else {
            this.licenseError = result.message || 'Sign in failed'
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

    // Self-service device management.

    // Row id currently being deactivated — binds to [disabled] on the per-row
    // button so double-clicks during the in-flight request are ignored.
    deactivatingDeviceId: string | null = null

    async loadMyDevices () {
        if (this.devicesLoading) {return}
        this.devicesLoading = true
        try {
            this.myDevices = await this.licenseSvc.listMyDevices()
        } finally {
            this.devicesLoading = false
        }
    }

    async deactivateMyDevice (device: any) {
        if (this.deactivatingDeviceId) {return}
        if (device.is_current) {
            if (!confirm('This is THIS device. Deactivating will sign you out. Continue?')) {return}
        } else {
            if (!confirm('Deactivate this device? It will be signed out on next check.')) {return}
        }
        this.deactivatingDeviceId = String(device.id)
        try {
            const ok = await this.licenseSvc.deactivateMyDevice(device.id)
            if (ok) {
                await this.loadMyDevices()
                if (device.is_current) {
                    // Server row already deactivated — pass skipServerCall=true so
                    // we don't make a second /deactivate call with a now-invalid
                    // token (which would 403).
                    await this.licenseSvc.deactivateLicense(true)
                }
            } else {
                alert('Could not deactivate that device.')
            }
        } finally {
            this.deactivatingDeviceId = null
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
}
