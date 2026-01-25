import * as russh from 'russh'
import { promises as fs } from 'fs'
import * as path from 'path'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, HostBinding, Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Platform, ProfilesService } from 'tlink-core'
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tlink-terminal'
import { SSHService } from '../services/ssh.service'
import { KeyboardInteractivePrompt, SSHSession } from '../session/ssh'
import { SSHPortForwardingModalComponent } from './sshPortForwardingModal.component'
import { SSHProfile } from '../api'
import { SSHShellSession } from '../session/shell'
import { SSHMultiplexerService } from '../services/sshMultiplexer.service'

/** @hidden */
@Component({
    selector: 'ssh-tab',
    template: `${BaseTerminalTabComponent.template} ${require('./sshTab.component.pug')}`,
    styles: [
        ...BaseTerminalTabComponent.styles,
        require('./sshTab.component.scss'),
    ],
    animations: BaseTerminalTabComponent.animations,
})
export class SSHTabComponent extends ConnectableTerminalTabComponent<SSHProfile> {
    Platform = Platform
    sshSession: SSHSession|null = null
    session: SSHShellSession|null = null
    sftpPanelVisible = false
    sftpPath = '/'
    enableToolbar = true
    startInSFTP = false
    @HostBinding('class.sftp-only') sftpOnly = false
    activeKIPrompt: KeyboardInteractivePrompt|null = null
    openingLogDir = false
    openingLogFile = false
    private suppressAutoReconnect = false
    private sftpAutostarted = false
    private initializationPromise: Promise<void>|null = null

    constructor (
        injector: Injector,
        public ssh: SSHService,
        private ngbModal: NgbModal,
        private profilesService: ProfilesService,
        private sshMultiplexer: SSHMultiplexerService,
    ) {
        super(injector)
        this.sessionChanged$.subscribe(() => {
            this.activeKIPrompt = null
            if (this.startInSFTP && this.session?.open && !this.sftpAutostarted) {
                this.sftpAutostarted = true
                void this.openSFTP()
            }
        })
    }

    ngOnInit (): void {
        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (!this.hasFocus) {
                return
            }
            switch (hotkey) {
                case 'home':
                    this.sendInput('\x1bOH' )
                    break
                case 'end':
                    this.sendInput('\x1bOF' )
                    break
                case 'restart-ssh-session':
                    this.reconnect()
                    break
                case 'launch-winscp':
                    if (this.sshSession) {
                        this.ssh.launchWinSCP(this.sshSession)
                    }
                    break
            }
        })

        this.sftpOnly = this.startInSFTP
        super.ngOnInit()

        if (!this.session?.open) {
            void this.initializeSession()
        }
    }

    async openSessionLogDirectory (): Promise<void> {
        if (this.openingLogDir) {
            return
        }
        this.openingLogDir = true
        try {
            const dir = this.resolveLogDirectory()
            await fs.mkdir(dir, { recursive: true })
            this.platform.openPath(dir)
        } catch (error) {
            this.notifications.error(this.translate.instant(_('Failed to open session log directory')))
            this.logger.error('Failed to open session log directory', error)
        } finally {
            this.openingLogDir = false
        }
    }

    private resolveLogDirectory (): string {
        const baseDir = this.getBaseDirectory()
        const settings = this.profile.sessionLog
        let resolved = settings?.directory?.trim() || path.join(baseDir, 'session-logs')
        resolved = this.expandPathVars(resolved)
        if (!path.isAbsolute(resolved)) {
            resolved = path.join(baseDir, resolved)
        }
        return resolved
    }

    private expandPathVars (value: string): string {
        let result = value
        const home = process.env.HOME || process.env.USERPROFILE
        if (home && result.startsWith('~')) {
            result = path.join(home, result.slice(1))
        }
        result = result.replace(/\$([A-Z0-9_]+)/gi, (_match, key) => process.env[key] ?? `$${key}`)
        result = result.replace(/%([^%]+)%/g, (_match, key) => process.env[key] ?? `%${key}%`)
        return result
    }

    private getBaseDirectory (): string {
        const configPath = this.platform.getConfigPath()
        if (configPath) {
            return path.dirname(configPath)
        }
        const home = process.env.HOME || process.env.USERPROFILE
        if (home) {
            return path.join(home, '.tlink')
        }
        return process.cwd()
    }

    async openSessionLogFile (): Promise<void> {
        if (this.openingLogFile) {
            return
        }
        this.openingLogFile = true
        try {
            const filePath = (this as any).sessionLogPath as string | undefined
            if (!filePath) {
                this.notifications.error(this.translate.instant(_('Session log file is not available yet')))
                return
            }
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            try {
                const stats = await fs.stat(filePath)
                if (!stats.isFile()) {
                    throw new Error('Not a file')
                }
            } catch {
                // If the file is not there yet, still attempt to open the path
            }
            this.platform.openPath(filePath)
        } catch (error) {
            this.notifications.error(this.translate.instant(_('Failed to open session log file')))
            this.logger.error('Failed to open session log file', error)
        } finally {
            this.openingLogFile = false
        }
    }

    async setupOneSession (injector: Injector, profile: SSHProfile, multiplex = true): Promise<SSHSession> {
        let session = await this.sshMultiplexer.getSession(profile)
        if (!multiplex || !session || !profile.options.reuseSession) {
            session = new SSHSession(injector, profile)

            if (profile.options.jumpHost) {
                const jumpConnection = (await this.profilesService.getProfiles()).find(x => x.id === profile.options.jumpHost)

                if (!jumpConnection) {
                    throw new Error(`${profile.options.host}: jump host "${profile.options.jumpHost}" not found in your config`)
                }

                const jumpSession = await this.setupOneSession(
                    this.injector,
                    this.profilesService.getConfigProxyForProfile<SSHProfile>(jumpConnection),
                )

                jumpSession.ref()
                session.willDestroy$.subscribe(() => jumpSession.unref())
                jumpSession.willDestroy$.subscribe(() => {
                    if (session?.open) {
                        session.destroy()
                    }
                })

                if (!(jumpSession.ssh instanceof russh.AuthenticatedSSHClient)) {
                    throw new Error('Jump session is not authenticated yet somehow')
                }

                try {
                    session.jumpChannel = await jumpSession.ssh.openTCPForwardChannel({
                        addressToConnectTo: profile.options.host,
                        portToConnectTo: profile.options.port ?? 22,
                        originatorAddress: '127.0.0.1',
                        originatorPort: 0,
                    })
                } catch (err) {
                    jumpSession.emitServiceMessage(colors.bgRed.black(' X ') + ` Could not set up port forward on ${jumpConnection.name}`)
                    throw err
                }
            }
        }

        this.attachSessionHandler(session.serviceMessage$, msg => {
            msg = msg.replace(/\n/g, '\r\n      ')
            if (this.frontendIsReady) {
                this.write(`\r${colors.black.bgWhite(' SSH ')} ${msg}\r\n`)
            }
        })

        this.attachSessionHandler(session.willDestroy$, () => {
            this.activeKIPrompt = null
        })

        this.attachSessionHandler(session.keyboardInteractivePrompt$, prompt => {
            this.activeKIPrompt = prompt
            setTimeout(() => {
                this.frontend?.scrollToBottom()
            })
        })

        if (!session.open) {
            if (this.frontendIsReady) {
                this.write('\r\n' + colors.black.bgWhite(' SSH ') + ` Connecting to ${session.profile.name}\r\n`)
                this.startSpinner(this.translate.instant(_('Connecting')))
            }

            try {
                await session.start()
            } finally {
                if (this.frontendIsReady) {
                    this.stopSpinner()
                }
            }

            this.sshMultiplexer.addSession(session)
        }

        // Successful start – clear any previous reconnect throttle
        this.suppressAutoReconnect = false
        this.reconnectTimestamps = []

        return session
    }

    protected onSessionDestroyed (): void {
        if (this.reconnecting) {
            this.setSession(null)
            return
        }

        const shouldAutoReconnect = !this.isDisconnectedByHand &&
            !this.isSessionExplicitlyTerminated() &&
            (this.profile.behaviorOnSessionEnd === 'auto' || this.profile.behaviorOnSessionEnd === 'reconnect')

        if (this.frontendIsReady) {
            // Session was closed abruptly
            this.write('\r\n' + colors.black.bgWhite(' SSH ') + ` ${this.sshSession?.profile.options.host}: session closed\r\n`)
        }

        this.setSession(null)

        if (shouldAutoReconnect && !this.suppressAutoReconnect) {
            const now = Date.now()
            const windowMs = 10000
            this.reconnectTimestamps = this.reconnectTimestamps.filter(ts => now - ts < windowMs)
            this.reconnectTimestamps.push(now)

            if (this.reconnectTimestamps.length > 5) {
                this.suppressAutoReconnect = true
                if (this.frontendIsReady) {
                    this.write('\r\n' + colors.black.bgRed(' X ') + ' ' + colors.red('Auto-reconnect paused after repeated failures. Use Reconnect to retry.') + '\r\n')
                }
                return
            }

            setTimeout(() => {
                this.reconnect()
            }, 1000)
        } else if (this.profile.behaviorOnSessionEnd === 'keep' && this.frontendIsReady) {
            this.offerReconnection()
        }
    }

    private async initializeSessionMaybeMultiplex (multiplex = true): Promise<void> {
        this.sshSession = await this.setupOneSession(this.injector, this.profile, multiplex)
        const session = new SSHShellSession(this.injector, this.sshSession, this.profile)

        this.setSession(session)
        this.attachSessionHandler(session.serviceMessage$, msg => {
            msg = msg.replace(/\n/g, '\r\n      ')
            if (this.frontendIsReady) {
                this.write(`\r${colors.black.bgWhite(' SSH ')} ${msg}\r\n`)
            }
            if (this.size?.columns && this.size?.rows) {
                session.resize(this.size.columns, this.size.rows)
            }
        })

        await session.start()

        if (this.size?.columns && this.size?.rows) {
            this.session?.resize(this.size.columns, this.size.rows)
        }
    }

    private async initializeSftpOnlySession (multiplex = true): Promise<void> {
        this.sshSession = await this.setupOneSession(this.injector, this.profile, multiplex)
        this.sftpAutostarted = true
        await this.openSFTP()
    }

    async initializeSession (): Promise<void> {
        if (this.initializationPromise) {
            return this.initializationPromise
        }
        this.initializationPromise = (async () => {
            if (this.session?.open || this.sshSession?.open) {
                return
            }
            await super.initializeSession()
            if (this.startInSFTP) {
                try {
                    await this.initializeSftpOnlySession(true)
                } catch {
                    try {
                        await this.initializeSftpOnlySession(false)
                    } catch (e) {
                        console.error('SFTP-only session initialization failed', e)
                    }
                }
                return
            }
            try {
                await this.initializeSessionMaybeMultiplex(true)
            } catch {
                try {
                    await this.initializeSessionMaybeMultiplex(false)
                } catch (e) {
                    console.error('SSH session initialization failed', e)
                    if (this.frontendIsReady) {
                        this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
                    }
                }
            }
        })().finally(() => {
            this.initializationPromise = null
        })
        return this.initializationPromise
    }

    showPortForwarding (): void {
        const modal = this.ngbModal.open(SSHPortForwardingModalComponent).componentInstance as SSHPortForwardingModalComponent
        modal.session = this.sshSession!
    }

    async canClose (): Promise<boolean> {
        if (!this.session?.open) {
            return true
        }
        if (!(this.profile.options.warnOnClose ?? this.config.store.ssh.warnOnClose)) {
            return true
        }
        return (await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant(_('Disconnect from {host}?'), this.profile.options),
                buttons: [
                    this.translate.instant(_('Disconnect')),
                    this.translate.instant(_('Do not close')),
                ],
                defaultId: 0,
                cancelId: 1,
            },
        )).response === 0
    }

    async openSFTP (): Promise<void> {
        this.sftpPath = await this.session?.getWorkingDirectory() ?? this.sftpPath
        setTimeout(() => {
            this.sftpPanelVisible = true
        }, 100)
    }

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.charCodeAt(this.recentInputs.length - 1) === 4 ||
        this.recentInputs.endsWith('exit\r')
    }
}
