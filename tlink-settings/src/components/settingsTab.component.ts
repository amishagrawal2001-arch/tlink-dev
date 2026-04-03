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

// Guard against missing core export to avoid runtime crashes
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
    licenseKeyInput = ''
    licenseError = ''
    licenseSuccess = ''
    serverUrl = ''
    serverTestResult = ''
    allLanguages = LocaleService.allLanguages
    @HostBinding('class.pad-window-controls') padWindowControls = false

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
    }

    async ngOnInit () {
        this.isShellIntegrationInstalled = await this.platform.isShellIntegrationInstalled()
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
        if (!this.licenseKeyInput.trim()) {
            this.licenseError = 'Please enter a license key'
            return
        }
        const result = await this.licenseSvc.activateLicense(this.licenseKeyInput.trim())
        if (result.success) {
            this.licenseSuccess = result.message || 'License activated successfully!'
            this.licenseKeyInput = ''
        } else {
            this.licenseError = result.message || 'Activation failed'
        }
    }

    deactivateLicense () {
        this.licenseSvc.deactivateLicense()
        this.licenseSuccess = ''
        this.licenseError = ''
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
}
