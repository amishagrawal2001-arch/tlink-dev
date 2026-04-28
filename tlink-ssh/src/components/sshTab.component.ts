import * as russh from 'russh'
import { promises as fs } from 'fs'
import * as path from 'path'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, HostBinding, Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Platform, ProfilesService, NotificationsService } from 'tlink-core'
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
    aiAvailable = false
    private aiSidebarService: any = null
    private aiChatSessionService: any = null
    private suppressAutoReconnect = false
    private sftpAutostarted = false
    private initializationPromise: Promise<void>|null = null
    sessionStartTime: Date | null = null
    private durationTimer: ReturnType<typeof setInterval> | null = null
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null
    connectionStale = false
    bytesReceived = 0
    bytesSent = 0

    constructor (
        injector: Injector,
        public ssh: SSHService,
        private ngbModal: NgbModal,
        private profilesService: ProfilesService,
        private sshMultiplexer: SSHMultiplexerService,
        private sshNotifications: NotificationsService,
    ) {
        super(injector)
        this.sessionChanged$.subscribe(() => {
            this.activeKIPrompt = null
            if (this.session?.open) {
                this.startDurationTracking()
                this.startHealthCheck()
                // Track bandwidth
                this.session.binaryOutput$?.subscribe(data => {
                    this.bytesReceived += data?.length ?? 0
                })
            } else {
                this.stopHealthCheck()
            }
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

        // Try to detect AI assistant plugin
        try {
            this.aiSidebarService = this.injector.get('AiSidebarService' as any, null)
            this.aiChatSessionService = this.injector.get('ChatSessionService' as any, null)
            this.aiAvailable = !!(this.aiSidebarService && this.aiChatSessionService)
        } catch {
            this.aiAvailable = false
        }

        // Monitor terminal output for error patterns
        if (this.aiAvailable) {
            this.setupErrorDetection()
        }

        if (!this.session?.open) {
            void this.initializeSession()
        }
    }

    askAI (): void {
        if (!this.aiSidebarService || !this.aiChatSessionService) {
            return
        }
        const selection = this.frontend?.getSelection?.() ?? ''
        const lastLines = selection.trim() || 'No text selected. Please select terminal output first.'
        const host = this.profile.options.host?.trim()
        if (lastLines) {
            this.aiSidebarService.show()
            this.aiChatSessionService.sendMessage(
                `Analyze this SSH terminal output from ${host}:\n\`\`\`\n${lastLines}\n\`\`\``,
            )
        } else {
            this.aiSidebarService.toggle()
        }
    }

    private setupErrorDetection (): void {
        const errorPatterns = [
            /command not found/i,
            /permission denied/i,
            /no such file or directory/i,
            /connection refused/i,
            /traceback \(most recent/i,
            /fatal:/i,
            /segmentation fault/i,
        ]
        let lastErrorTime = 0
        let outputSub: any = null

        this.subscribeUntilDestroyed(this.sessionChanged$, () => {
            outputSub?.unsubscribe()
            outputSub = null
            if (!this.session) {
                return
            }
            outputSub = this.session.output$.subscribe(data => {
                const text = String(data)
                const now = Date.now()
                if (now - lastErrorTime < 10000) {
                    return
                }
                for (const pattern of errorPatterns) {
                    if (pattern.test(text)) {
                        lastErrorTime = now
                        this.sshNotifications.actionable(
                            'Error detected in terminal output',
                            'Click to ask AI',
                            () => this.askAI(),
                            8000,
                        )
                        break
                    }
                }
            })
        })
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

    /**
     * Compress an SSH banner into something safe to drop into a notification
     * toast. Corporate / government banners can be hundreds of lines of
     * ASCII-art borders + Acceptable Use Policy text; rendered raw, the toast
     * blows up the layout (long runs of `#` line-wrap into `# #` garbage).
     *
     * Strategy:
     *  - Drop lines that are pure decoration (only `#`, `*`, `=`, `-`, `_`).
     *  - Collapse long runs of identical decoration chars *within* a line to
     *    a short marker so the toast doesn't try to wrap a 500-char string.
     *  - Drop empty lines (all whitespace).
     *  - Cap the result at ~3 lines / 240 chars with a "…" tail. The full
     *    banner is written to the terminal scroll-back separately.
     */
    private summarizeBanner (banner: string): string {
        const lines = banner
            .split(/\r?\n/)
            .map(line => line
                // Strip ANSI / control codes that would render wrong in the
                // toast.
                // eslint-disable-next-line no-control-regex
                .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
                // eslint-disable-next-line no-control-regex
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                .trimEnd())
            // Drop lines that are only decoration / whitespace.
            .filter(line => line.trim() && !/^[\s#*=_\-]+$/.test(line))
            // Collapse decoration runs >= 6 chars to a single ellipsis so
            // a divider that snuck into a content line doesn't blow up.
            .map(line => line.replace(/([#*=\-_])\1{5,}/g, '…'))
            .map(line => line.trim())
            .filter(Boolean)
        if (lines.length === 0) return ''
        const head = lines.slice(0, 3).join(' · ')
        const more = lines.length > 3 ? ` (+${lines.length - 3} more lines)` : ''
        const out = head + more
        return out.length > 240 ? out.slice(0, 239) + '…' : out
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

        this.attachSessionHandler(session.banner$, banner => {
            const trimmed = banner.trim()
            if (!trimmed) return
            // Notification toast renders inline and word-wraps badly when a
            // full corporate AUP banner with ASCII-art separators arrives —
            // long runs of `#` / `=` get wrapped into "# #" garbage that
            // pushes other UI off-screen. Show a *summary* in the toast and
            // write the full banner into the terminal scroll-back where SSH
            // banners belong (and where the user can copy from).
            const summary = this.summarizeBanner(trimmed)
            if (summary) {
                this.sshNotifications.info(summary, `${this.profile.options.host} banner`)
            }
            if (this.frontendIsReady) {
                const formatted = trimmed.replace(/\r?\n/g, '\r\n')
                this.write(`\r\n${colors.black.bgYellow(' BANNER ')} ${this.profile.options.host}\r\n${formatted}\r\n`)
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

            if (session.open) {
                this.sshMultiplexer.addSession(session)
            }
        }

        // Successful start – clear any previous reconnect throttle
        this.suppressAutoReconnect = false
        this.reconnectTimestamps = []

        // Display connection info banner
        if (session.open && this.frontendIsReady) {
            const host = session.profile.options.host
            const port = session.profile.options.port ?? 22
            this.write(`\r${colors.black.bgGreen(' Connected ')} ${host}:${port}\r\n`)
        }

        return session
    }

    async destroy (): Promise<void> {
        this.isDisconnectedByHand = true
        await super.destroy()
    }

    protected onSessionDestroyed (): void {
        this.stopDurationTracking()
        this.stopHealthCheck()

        if (this.reconnecting) {
            this.setSession(null)
            return
        }

        const passwordPromptDismissed = this.sshSession?.wasPasswordPromptDismissed() ?? false
        if (passwordPromptDismissed) {
            this.suppressAutoReconnect = true
        }

        const shouldAutoReconnect = !this.isDisconnectedByHand &&
            !this.isSessionExplicitlyTerminated() &&
            !passwordPromptDismissed &&
            (this.profile.behaviorOnSessionEnd === 'auto' || this.profile.behaviorOnSessionEnd === 'reconnect')

        const disconnectedHost = this.sshSession?.profile.options.host ?? this.profile.options.host

        if (this.frontendIsReady) {
            // Session was closed abruptly
            this.write('\r\n' + colors.black.bgWhite(' SSH ') + ` ${disconnectedHost}: session closed\r\n`)
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
            this.sshNotifications.actionable(
                `SSH disconnected from ${disconnectedHost}`,
                'Click to reconnect',
                () => this.reconnect(),
                15000,
            )
            this.offerReconnection()
        }
    }

    private async initializeSessionMaybeMultiplex (multiplex = true): Promise<void> {
        this.sshSession = await this.setupOneSession(this.injector, this.profile, multiplex)
        if (this.sshSession.wasPasswordPromptDismissed()) {
            return
        }
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
        if (this.sshSession.wasPasswordPromptDismissed()) {
            return
        }
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
                    if (this.sshSession?.wasPasswordPromptDismissed()) {
                        return
                    }
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
                if (this.sshSession?.wasPasswordPromptDismissed()) {
                    return
                }
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

    private startDurationTracking (): void {
        this.sessionStartTime = new Date()
        this.bytesReceived = 0
        this.bytesSent = 0
        this.stopDurationTracking()
        this.durationTimer = setInterval(() => {
            if (this.sessionStartTime && this.session?.open) {
                const elapsed = Date.now() - this.sessionStartTime.getTime()
                const h = Math.floor(elapsed / 3600000)
                const m = Math.floor((elapsed % 3600000) / 60000)
                const s = Math.floor((elapsed % 60000) / 1000)
                const duration = h > 0 ? `${h}h${m}m` : `${m}m${s}s`
                this.setTitle(`SSH: ${this.profile.options.user?.trim()}@${this.profile.options.host?.trim()} [${duration}]`)
            }
        }, 10000) // Update every 10 seconds
    }

    private stopDurationTracking (): void {
        if (this.durationTimer) {
            clearInterval(this.durationTimer)
            this.durationTimer = null
        }
    }

    private startHealthCheck (): void {
        this.connectionStale = false
        this.stopHealthCheck()
        const keepaliveMs = Math.min(Math.max(this.profile.options.keepaliveInterval ?? 5000, 1000), 60000)
        const staleThresholdMs = keepaliveMs * 3
        this.healthCheckTimer = setInterval(() => {
            if (this.session instanceof SSHShellSession && this.session.open) {
                this.connectionStale = Date.now() - this.session.lastDataTime > staleThresholdMs
            } else {
                this.connectionStale = false
            }
        }, 5000)
    }

    private stopHealthCheck (): void {
        this.connectionStale = false
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer)
            this.healthCheckTimer = null
        }
    }

    getSessionDuration (): string {
        if (!this.sessionStartTime) {
            return ''
        }
        const elapsed = Date.now() - this.sessionStartTime.getTime()
        const h = Math.floor(elapsed / 3600000)
        const m = Math.floor((elapsed % 3600000) / 60000)
        return h > 0 ? `${h}h ${m}m` : `${m}m`
    }

    getFormattedBandwidth (): string {
        const format = (bytes: number) => {
            if (bytes < 1024) return `${bytes}B`
            if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
            return `${(bytes / 1048576).toFixed(1)}MB`
        }
        return `${format(this.bytesReceived)} / ${format(this.bytesSent)}`
    }

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.charCodeAt(this.recentInputs.length - 1) === 4 ||
        this.recentInputs.endsWith('exit\r')
    }
}
