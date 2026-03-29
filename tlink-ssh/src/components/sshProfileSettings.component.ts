/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Injector, ViewChild } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { firstBy } from 'thenby'

import { FileProvidersService, Platform, HostAppService, PromptModalComponent, PartialProfile, ProfilesService, NotificationsService } from 'tlink-core'
import { LoginScriptsSettingsComponent } from 'tlink-terminal'
import { PasswordStorageService } from '../services/passwordStorage.service'
import { SSHSession } from '../session/ssh'
import { ForwardedPortConfig, SSHAlgorithmType, SSHProfile } from '../api'
import { supportedAlgorithms } from '../algorithms'

/** @hidden */
@Component({
    templateUrl: './sshProfileSettings.component.pug',
    styleUrls: ['./sshProfileSettings.component.scss'],
})
export class SSHProfileSettingsComponent {
    Platform = Platform
    profile: SSHProfile
    hasSavedPassword: boolean
    testingConnection = false
    testResult: { success: boolean, message: string } | null = null
    availableGroups: { id: string, name: string }[] = []
    authMethodLabels: Record<string, string> = {
        publicKey: 'Public Key',
        agent: 'SSH Agent',
        password: 'Password',
        keyboardInteractive: 'Keyboard Interactive',
    }
    tabColors = [
        { name: 'No color', value: null },
        { name: 'Blue', value: '#0275d8' },
        { name: 'Green', value: '#5cb85c' },
        { name: 'Orange', value: '#f0ad4e' },
        { name: 'Purple', value: '#613d7c' },
        { name: 'Red', value: '#d9534f' },
        { name: 'Yellow', value: '#ffd500' },
    ]
    private originalUsername: string|null = null

    connectionMode: 'direct'|'proxyCommand'|'jumpHost'|'socksProxy'|'httpProxy' = 'direct'

    supportedAlgorithms = supportedAlgorithms
    algorithms: Record<string, Record<string, boolean>> = {}
    jumpHosts: PartialProfile<SSHProfile>[]
    @ViewChild('loginScriptsSettings') loginScriptsSettings: LoginScriptsSettingsComponent|null

    constructor (
        public hostApp: HostAppService,
        private profilesService: ProfilesService,
        private passwordStorage: PasswordStorageService,
        private ngbModal: NgbModal,
        private fileProviders: FileProvidersService,
        private notifications: NotificationsService,
        private injector: Injector,
    ) { }

    async ngOnInit () {
        this.jumpHosts = (await this.profilesService.getProfiles({ includeBuiltin: false })).filter(x => x.type === 'ssh' && x !== this.profile)
        this.jumpHosts.sort(firstBy(x => this.getJumpHostLabel(x)))

        for (const k of Object.values(SSHAlgorithmType)) {
            this.algorithms[k] = {}
            for (const alg of this.profile.options.algorithms?.[k] ?? []) {
                this.algorithms[k][alg] = true
            }
        }

        this.profile.options.auth = this.profile.options.auth ?? null
        this.profile.options.privateKeys ??= []

        if (this.profile.options.proxyCommand) {
            this.connectionMode = 'proxyCommand'
        } else if (this.profile.options.jumpHost) {
            this.connectionMode = 'jumpHost'
        } else if (this.profile.options.socksProxyHost) {
            this.connectionMode = 'socksProxy'
        } else if (this.profile.options.httpProxyHost) {
            this.connectionMode = 'httpProxy'
        }

        if (this.profile.options.user) {
            try {
                this.hasSavedPassword = !!await this.passwordStorage.loadPassword(this.profile)
            } catch (e) {
                console.error('Could not check for saved password', e)
            }
        }

        this.originalUsername = this.profile.options.user ?? null

        this.availableGroups = this.profilesService.getSyncProfileGroups().map(g => ({ id: g.id, name: g.name }))
    }

    getJumpHostLabel (p: PartialProfile<SSHProfile>) {
        return p.group ? `${this.profilesService.resolveProfileGroupName(p.group)} / ${p.name}` : p.name
    }

    async setPassword () {
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.prompt = `Password for ${this.profile.options.user}@${this.profile.options.host}`
        modal.componentInstance.password = true
        try {
            const result = await modal.result.catch(() => null)
            if (result?.value) {
                await this.passwordStorage.savePassword(this.profile, result.value).catch(e => {
                    this.notifications.error('Failed to save password')
                })
                this.hasSavedPassword = true
            }
        } catch { }
    }

    clearSavedPassword () {
        this.hasSavedPassword = false
        this.passwordStorage.deletePassword(this.profile).catch(e => {
            this.notifications.error('Failed to remove saved password')
        })
    }

    async testConnection () {
        this.testingConnection = true
        this.testResult = null
        const t0 = Date.now()
        let session: SSHSession | null = null
        try {
            session = new SSHSession(this.injector, this.profile)
            await session.start()
            const elapsed = Date.now() - t0
            this.testResult = { success: true, message: `Connected in ${elapsed}ms` }
        } catch (e) {
            const elapsed = Date.now() - t0
            const msg = e?.message ?? e?.toString() ?? 'Unknown error'
            this.testResult = { success: false, message: `${msg} (${elapsed}ms)` }
        } finally {
            if (session) {
                await session.destroy()
            }
            this.testingConnection = false
        }
    }

    moveAuthMethod (index: number, direction: number): void {
        const order = this.profile.options.authMethodOrder
        if (!order) { return }
        const newIndex = index + direction
        if (newIndex < 0 || newIndex >= order.length) { return }
        const temp = order[index]
        order[index] = order[newIndex]
        order[newIndex] = temp
        this.profile.options.authMethodOrder = [...order]
    }

    async addPrivateKey () {
        const ref = await this.fileProviders.selectAndStoreFile(`private key for ${this.profile.name}`).catch(() => null)
        if (ref) {
            this.profile.options.privateKeys = [
                ...this.profile.options.privateKeys!,
                ref,
            ]
        }
    }

    removePrivateKey (path: string) {
        this.profile.options.privateKeys = this.profile.options.privateKeys?.filter(x => x !== path)
    }

    save () {
        void this.migrateSavedPasswordOnUsernameChange()
        for (const k of Object.values(SSHAlgorithmType)) {
            this.profile.options.algorithms![k] = Object.entries(this.algorithms[k])
                .filter(([_, v]) => !!v)
                .map(([key, _]) => key)
            if(k !== SSHAlgorithmType.COMPRESSION) { this.profile.options.algorithms![k].sort() }
        }

        if (this.connectionMode !== 'jumpHost') {
            this.profile.options.jumpHost = undefined
        }
        if (this.connectionMode !== 'proxyCommand') {
            this.profile.options.proxyCommand = undefined
        }
        if (this.connectionMode !== 'socksProxy') {
            this.profile.options.socksProxyHost = undefined
            this.profile.options.socksProxyPort = undefined
        }
        if (this.connectionMode !== 'httpProxy') {
            this.profile.options.httpProxyHost = undefined
            this.profile.options.httpProxyPort = undefined
        }

        this.loginScriptsSettings?.save()
    }

    private async migrateSavedPasswordOnUsernameChange (): Promise<void> {
        const previous = this.originalUsername?.trim() || null
        const current = this.profile.options.user?.trim() || null
        if (!previous || !current || previous === current || !this.hasSavedPassword) {
            this.originalUsername = current
            return
        }

        try {
            const existing = await this.passwordStorage.loadPassword(this.profile, previous)
            if (existing) {
                await this.passwordStorage.savePassword(this.profile, existing, current)
                await this.passwordStorage.deletePassword(this.profile, previous)
                this.hasSavedPassword = true
            } else {
                this.hasSavedPassword = false
            }
        } catch (e) {
            console.error('Could not migrate saved password to new username', e)
        } finally {
            this.originalUsername = current
        }
    }

    onForwardAdded (fw: ForwardedPortConfig) {
        this.profile.options.forwardedPorts = this.profile.options.forwardedPorts ?? []
        this.profile.options.forwardedPorts.push(fw)
    }

    onForwardRemoved (fw: ForwardedPortConfig) {
        this.profile.options.forwardedPorts = this.profile.options.forwardedPorts?.filter(x => x !== fw)
    }

    getConnectionDropdownTitle () {
        return {
            direct: 'Direct',
            proxyCommand: 'Proxy command',
            jumpHost: 'Jump host',
            socksProxy: 'SOCKS proxy',
            httpProxy: 'HTTP proxy',
        }[this.connectionMode]
    }
}
