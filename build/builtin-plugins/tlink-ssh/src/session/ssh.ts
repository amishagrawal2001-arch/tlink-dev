import * as fs from 'mz/fs'
import * as crypto from 'crypto'
import colors from 'ansi-colors'
import stripAnsi from 'strip-ansi'
import * as shellQuote from 'shell-quote'
import { Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { ConfigService, FileProvidersService, NotificationsService, PromptModalComponent, LogService, Logger, TranslateService, Platform, HostAppService, ProfilesService } from 'tlink-core'
import { Socket } from 'net'
import { Subject, Observable } from 'rxjs'
import { HostKeyPromptModalComponent } from '../components/hostKeyPromptModal.component'
import { PasswordStorageService } from '../services/passwordStorage.service'
import { SSHKnownHostsService } from '../services/sshKnownHosts.service'
import { SFTPSession } from './sftp'
import { SSHAlgorithmType, SSHProfile, AutoPrivateKeyLocator, PortForwardType } from '../api'
import { ForwardedPort } from './forwards'
import { X11Socket } from './x11'
import { supportedAlgorithms } from '../algorithms'
import * as russh from 'russh'

const WINDOWS_OPENSSH_AGENT_PIPE = '\\\\.\\pipe\\openssh-ssh-agent'

export interface Prompt {
    prompt: string
    echo?: boolean
}

type AuthMethod = {
    type: 'none'|'prompt-password'|'hostbased'
} | {
    type: 'keyboard-interactive',
    savedPassword?: string
} | {
    type: 'saved-password',
    password: string
} | {
    type: 'publickey'
    name: string
    contents: Buffer
} | {
    type: 'agent',
    kind: 'unix-socket',
    path: string
} | {
    type: 'agent',
    kind: 'named-pipe',
    path: string
} | {
    type: 'agent',
    kind: 'pageant',
}

function sshAuthTypeForMethod (m: AuthMethod): string {
    switch (m.type) {
        case 'none': return 'none'
        case 'hostbased': return 'hostbased'
        case 'prompt-password': return 'password'
        case 'saved-password': return 'password'
        case 'keyboard-interactive': return 'keyboard-interactive'
        case 'publickey': return 'publickey'
        case 'agent': return 'publickey'
    }
}

export class KeyboardInteractivePrompt {
    readonly responses: string[] = []

    private _resolve: (value: string[]) => void
    private _reject: (reason: any) => void
    readonly promise = new Promise<string[]>((resolve, reject) => {
        this._resolve = resolve
        this._reject = reject
    })

    constructor (
        public name: string,
        public instruction: string,
        public prompts: Prompt[],
    ) {
        this.responses = new Array(this.prompts.length).fill('')
    }

    isAPasswordPrompt (index: number): boolean {
        return this.prompts[index].prompt.toLowerCase().includes('password') && !this.prompts[index].echo
    }

    respond (): void {
        this._resolve(this.responses)
    }

    reject (): void {
        this._reject(new Error('Keyboard-interactive auth rejected'))
    }
}

export class SSHSession {
    shell?: russh.Channel
    ssh: russh.SSHClient|russh.AuthenticatedSSHClient
    sftp?: russh.SFTP
    forwardedPorts: ForwardedPort[] = []
    jumpChannel: russh.NewChannel|null = null
    savedPassword?: string
    get serviceMessage$ (): Observable<string> { return this.serviceMessage }
    get keyboardInteractivePrompt$ (): Observable<KeyboardInteractivePrompt> { return this.keyboardInteractivePrompt }
    get willDestroy$ (): Observable<void> { return this.willDestroy }

    activePrivateKey: russh.KeyPair|null = null
    authUsername: string|null = null

    open = false

    private logger: Logger
    private refCount = 0
    private allAuthMethods: AuthMethod[] = []
    private serviceMessage = new Subject<string>()
    private keyboardInteractivePrompt = new Subject<KeyboardInteractivePrompt>()
    private willDestroy = new Subject<void>()

    private passwordStorage: PasswordStorageService
    private ngbModal: NgbModal
    private hostApp: HostAppService
    private notifications: NotificationsService
    private fileProviders: FileProvidersService
    private config: ConfigService
    private profilesService: ProfilesService
    private translate: TranslateService
    private knownHosts: SSHKnownHostsService
    private privateKeyImporters: AutoPrivateKeyLocator[]
    private previouslyDisconnected = false
    private passwordPromptPromise: Promise<{ value: string, remember: boolean }|null>|null = null
    private passwordPrompted = false
    private prePromptedPassword: string|null = null
    private shouldRememberProfile = false
    private authAborted = false
    private activePasswordModal: any|null = null

    constructor (
        private injector: Injector,
        public profile: SSHProfile,
    ) {
        this.logger = injector.get(LogService).create(`ssh-${profile.options.host}-${profile.options.port}`)

        this.passwordStorage = injector.get(PasswordStorageService)
        this.ngbModal = injector.get(NgbModal)
        this.hostApp = injector.get(HostAppService)
        this.notifications = injector.get(NotificationsService)
        this.fileProviders = injector.get(FileProvidersService)
        this.config = injector.get(ConfigService)
        this.profilesService = injector.get(ProfilesService)
        this.translate = injector.get(TranslateService)
        this.knownHosts = injector.get(SSHKnownHostsService)
        this.privateKeyImporters = injector.get(AutoPrivateKeyLocator, [])

        this.willDestroy$.subscribe(() => {
            this.authAborted = true
            // Dismiss any active password modal
            if (this.activePasswordModal) {
                this.activePasswordModal.dismiss('aborted')
                this.activePasswordModal = null
            }
            // Cancel any pending password prompt promise
            this.passwordPromptPromise = null
            // Reject any active keyboard-interactive prompts
            this.keyboardInteractivePrompt.complete()
            // Disconnect SSH client immediately
            if (this.ssh) {
                this.ssh.disconnect()
            }
            // Stop port forwarding
            for (const port of this.forwardedPorts) {
                port.stopLocalListener()
            }
        })
    }

    private addPublicKeyAuthMethod (name: string, contents: Buffer) {
        this.allAuthMethods.push({
            type: 'publickey',
            name,
            contents,
        })
    }

    async init (): Promise<void> {
        this.allAuthMethods = [{ type: 'none' }]
        if (!this.profile.options.auth || this.profile.options.auth === 'publicKey') {
            if (this.profile.options.privateKeys?.length) {
                for (let pk of this.profile.options.privateKeys) {
                    // eslint-disable-next-line @typescript-eslint/init-declarations
                    let contents: Buffer
                    pk = pk.replace('%h', this.profile.options.host)
                    pk = pk.replace('%r', this.profile.options.user)
                    try {
                        contents = await this.fileProviders.retrieveFile(pk)
                    } catch (error) {
                        this.emitServiceMessage(colors.bgYellow.yellow.black(' ! ') + ` Could not load private key ${pk}: ${error}`)
                        continue
                    }

                    this.addPublicKeyAuthMethod(pk, contents)
                }
            } else {
                for (const importer of this.privateKeyImporters) {
                    for (const [name, contents] of await importer.getKeys()) {
                        this.addPublicKeyAuthMethod(name, contents)
                    }
                }
            }
        }

        if (!this.profile.options.auth || this.profile.options.auth === 'agent') {
            const spec = await this.getAgentConnectionSpec()
            if (!spec) {
                this.emitServiceMessage(colors.bgYellow.yellow.black(' ! ') + ` Agent auth selected, but no running Agent process is found`)
            } else {
                this.allAuthMethods.push({
                    type: 'agent',
                    ...spec,
                })
            }
        }
        if (!this.profile.options.auth || this.profile.options.auth === 'password') {
            if (this.profile.options.password) {
                this.allAuthMethods.push({ type: 'saved-password', password: this.profile.options.password })
            }
        }
        if (!this.profile.options.auth || this.profile.options.auth === 'keyboardInteractive') {
            if (this.profile.options.password) {
                this.allAuthMethods.push({ type: 'keyboard-interactive', savedPassword: this.profile.options.password })
            }
            this.allAuthMethods.push({ type: 'keyboard-interactive' })
        }
        if (!this.profile.options.auth || this.profile.options.auth === 'password') {
            this.allAuthMethods.push({ type: 'prompt-password' })
        }
        this.allAuthMethods.push({ type: 'hostbased' })
    }

    private async populateStoredPasswordsForResolvedUsername (): Promise<void> {
        if (!this.authUsername) {
            return
        }

        const storedPassword = await this.passwordStorage.loadPassword(this.profile, this.authUsername)
        if (!storedPassword) {
            // Debug: Log why password wasn't found
            this.logger.debug(`No saved password found for ${this.authUsername}@${this.profile.options.host}:${this.profile.options.port ?? 22}`)
            return
        }
        
        this.logger.debug(`Found saved password for ${this.authUsername}@${this.profile.options.host}:${this.profile.options.port ?? 22}`)

        if (!this.profile.options.auth || this.profile.options.auth === 'password') {
            const hasSavedPassword = this.allAuthMethods.some(method => method.type === 'saved-password' && method.password === storedPassword)
            if (!hasSavedPassword) {
                const promptIndex = this.allAuthMethods.findIndex(method => method.type === 'prompt-password')
                const insertIndex = promptIndex >= 0 ? promptIndex : this.allAuthMethods.length
                this.allAuthMethods.splice(insertIndex, 0, { type: 'saved-password', password: storedPassword })
            }
        }

        if (!this.profile.options.auth || this.profile.options.auth === 'keyboardInteractive') {
            const existingSaved = this.allAuthMethods.find(method => method.type === 'keyboard-interactive' && method.savedPassword === storedPassword)
            if (!existingSaved) {
                const updatable = this.allAuthMethods.find(method => method.type === 'keyboard-interactive' && method.savedPassword === undefined)
                if (updatable && updatable.type === 'keyboard-interactive') {
                    updatable.savedPassword = storedPassword
                } else {
                    this.allAuthMethods.push({ type: 'keyboard-interactive', savedPassword: storedPassword })
                }
            }
        }
    }

    private async getAgentConnectionSpec (): Promise<russh.AgentConnectionSpec|null> {
        if (this.hostApp.platform === Platform.Windows) {
            if (this.config.store.ssh.agentType === 'auto') {
                if (await fs.exists(WINDOWS_OPENSSH_AGENT_PIPE)) {
                    return {
                        kind: 'named-pipe',
                        path: WINDOWS_OPENSSH_AGENT_PIPE,
                    }
                } else if (russh.isPageantRunning()) {
                    return {
                        kind: 'pageant',
                    }
                } else {
                    this.emitServiceMessage(colors.bgYellow.yellow.black(' ! ') + ` Agent auth selected, but no running Agent process is found`)
                }
            } else if (this.config.store.ssh.agentType === 'pageant') {
                return {
                    kind: 'pageant',
                }
            } else {
                return {
                    kind: 'named-pipe',
                    path: this.config.store.ssh.agentPath || WINDOWS_OPENSSH_AGENT_PIPE,
                }
            }
        } else {
            return {
                kind: 'unix-socket',
                path: process.env.SSH_AUTH_SOCK!,
            }
        }
        return null
    }

    private promptForPassword (): Promise<{ value: string, remember: boolean }|null> {
        if (this.passwordPromptPromise) {
            // If there's already a pending prompt, check if it should be aborted
            if (this.authAborted) {
                // Cancel the existing promise and return null
                this.activePasswordModal?.dismiss?.('aborted')
                this.passwordPromptPromise = null
                this.activePasswordModal = null
                return Promise.resolve(null)
            }
            return this.passwordPromptPromise
        }
        if (this.authAborted) {
            return Promise.resolve(null)
        }
        // Note: passwordPrompted is now set in the caller before calling this method
        // to prevent race conditions where multiple prompts could be opened
        const modal = this.ngbModal.open(PromptModalComponent)
        this.activePasswordModal = modal
        const isEphemeralProfile = !this.profile.id
        if (isEphemeralProfile) {
            modal.componentInstance.prompt = `Password for ${this.profile.options.host}`
            modal.componentInstance.secondaryPrompt = 'Username'
            modal.componentInstance.secondaryPlaceholder = 'Username'
            modal.componentInstance.secondaryValue = this.authUsername ?? this.profile.options.user ?? ''
            modal.componentInstance.focusSecondary = !this.authUsername || this.authUsername === 'root'
        } else {
            modal.componentInstance.prompt = `Password for ${this.authUsername}@${this.profile.options.host}`
        }
        modal.componentInstance.password = true
        modal.componentInstance.showRememberCheckbox = true

        this.passwordPromptPromise = modal.result
            .then(res => {
                // Check authAborted after modal resolves
                if (this.authAborted) {
                    return null
                }
                // If user cancelled (res is null), mark as aborted to prevent retries
                if (!res) {
                    this.authAborted = true
                }
                const enteredUsername = typeof res?.secondaryValue === 'string' ? res.secondaryValue.trim() : ''
                if (enteredUsername) {
                    this.authUsername = enteredUsername
                    if (!this.profile.id && this.authUsername) {
                        this.profile.options.user = this.authUsername
                    }
                    if (this.authUsername?.startsWith('$')) {
                        try {
                            const result = process.env[this.authUsername.slice(1)]
                            this.authUsername = result ?? this.authUsername
                        } catch {
                            this.authUsername = 'root'
                        }
                    }
                }
                return res ?? null
            })
            .catch(() => {
                // User dismissed the modal - abort authentication
                this.authAborted = true
                return null
            })
            .finally(() => {
                this.passwordPromptPromise = null
                this.activePasswordModal = null
            }) as Promise<{ value: string, remember: boolean }|null>

        return this.passwordPromptPromise
    }

    private async saveEphemeralProfileIfNeeded (): Promise<void> {
        if (!this.shouldRememberProfile || this.profile.id) {
            return
        }
        const host = this.profile.options.host
        const username = this.authUsername ?? ''
        if (!host || !username) {
            return
        }
        const port = this.profile.options.port ?? 22
        try {
            const existingProfiles = await this.profilesService.getProfiles({ includeBuiltin: false, clone: true })
            const existing = existingProfiles.find(p =>
                p.type === 'ssh' &&
                p.options?.host === host &&
                (p.options?.port ?? 22) === port &&
                p.options?.user === username,
            )
            if (existing) {
                return
            }

            await this.profilesService.newProfile({
                name: `${username}@${host}:${port}`,
                type: 'ssh',
                options: {
                    host,
                    port,
                    user: username,
                },
            })
            await this.config.save()
        } catch (error) {
            this.logger.warn('Failed to save quick-connect profile', error)
        } finally {
            this.shouldRememberProfile = false
        }
    }

    async openSFTP (): Promise<SFTPSession> {
        if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
            throw new Error('Cannot open SFTP session before auth')
        }
        if (!this.sftp) {
            const timeoutMs = this.getSftpTimeoutMs()
            try {
                this.sftp = await this.openSftpWithTimeout(timeoutMs)
            } catch (error) {
                const message = error?.message ?? 'SFTP session timed out.'
                this.logger.warn('SFTP session open failed', error)
                throw new Error(message)
            }
            this.sftp.closed$.subscribe(() => {
                this.sftp = undefined
            })
        }
        return new SFTPSession(this.sftp, this.injector)
    }

    private getSftpTimeoutMs (): number {
        if (typeof this.profile.options.readyTimeout === 'number' && this.profile.options.readyTimeout > 0) {
            return this.profile.options.readyTimeout
        }
        return 15000
    }

    private async openSftpWithTimeout (timeoutMs: number): Promise<russh.SFTP> {
        const ssh = this.ssh as russh.AuthenticatedSSHClient
        let channel: russh.NewChannel | null = null
        let timedOut = false
        const openPromise = (async () => {
            channel = await ssh.openSessionChannel()
            return ssh.activateSFTP(channel)
        })()
        openPromise.catch(error => {
            if (timedOut) {
                this.logger.warn('SFTP open failed after timeout', error)
            }
        })
        const timeoutPromise = new Promise<russh.SFTP>((_, reject) => {
            const timer = setTimeout(() => {
                timedOut = true
                reject(new Error(`SFTP session timed out after ${timeoutMs}ms`))
            }, timeoutMs)
            openPromise.finally(() => clearTimeout(timer)).catch(() => null)
        })
        try {
            return await Promise.race([openPromise, timeoutPromise])
        } catch (error) {
            if (channel) {
                await (channel as any).close?.().catch(() => null)
                await (channel as any).reject?.().catch(() => null)
            }
            throw error
        }
    }

    async start (): Promise<void> {
        await this.init()

        if (this.authAborted) {
            return
        }

        const algorithms = {}
        for (const key of Object.values(SSHAlgorithmType)) {
            algorithms[key] = this.profile.options.algorithms![key].filter(x => supportedAlgorithms[key].includes(x))
        }

        // eslint-disable-next-line @typescript-eslint/init-declarations
        let transport: russh.SshTransport
        if (this.profile.options.proxyCommand) {
            this.emitServiceMessage(colors.bgBlue.black(' Proxy command ') + ` Using ${this.profile.options.proxyCommand}`)

            const argv = shellQuote.parse(this.profile.options.proxyCommand)
            transport = await russh.SshTransport.newCommand(argv[0], argv.slice(1))
        } else if (this.jumpChannel) {
            transport = await russh.SshTransport.newSshChannel(this.jumpChannel.take())
            this.jumpChannel = null
        } else if (this.profile.options.socksProxyHost) {
            this.emitServiceMessage(colors.bgBlue.black(' Proxy ') + ` Using ${this.profile.options.socksProxyHost}:${this.profile.options.socksProxyPort}`)
            transport = await russh.SshTransport.newSocksProxy(
                this.profile.options.socksProxyHost,
                this.profile.options.socksProxyPort ?? 1080,
                this.profile.options.host,
                this.profile.options.port ?? 22,
            )
        } else if (this.profile.options.httpProxyHost) {
            this.emitServiceMessage(colors.bgBlue.black(' Proxy ') + ` Using ${this.profile.options.httpProxyHost}:${this.profile.options.httpProxyPort}`)
            transport = await russh.SshTransport.newHttpProxy(
                this.profile.options.httpProxyHost,
                this.profile.options.httpProxyPort ?? 8080,
                this.profile.options.host,
                this.profile.options.port ?? 22,
            )
        } else {
            transport = await russh.SshTransport.newSocket(`${this.profile.options.host.trim()}:${this.profile.options.port ?? 22}`)
        }

        if (this.authAborted) {
            return
        }

        this.ssh = await russh.SSHClient.connect(
            transport,
            async key => {
                if (this.authAborted) {
                    return false
                }
                if (!await this.verifyHostKey(key)) {
                    return false
                }
                if (this.authAborted) {
                    return false
                }
                this.logger.info('Host key verified')
                return true
            },
            {
                preferred: {
                    ciphers: this.profile.options.algorithms?.[SSHAlgorithmType.CIPHER]?.filter(x => supportedAlgorithms[SSHAlgorithmType.CIPHER].includes(x)),
                    kex: this.profile.options.algorithms?.[SSHAlgorithmType.KEX]?.filter(x => supportedAlgorithms[SSHAlgorithmType.KEX].includes(x)),
                    mac: this.profile.options.algorithms?.[SSHAlgorithmType.HMAC]?.filter(x => supportedAlgorithms[SSHAlgorithmType.HMAC].includes(x)),
                    key: this.profile.options.algorithms?.[SSHAlgorithmType.HOSTKEY]?.filter(x => supportedAlgorithms[SSHAlgorithmType.HOSTKEY].includes(x)),
                    compression: this.profile.options.algorithms?.[SSHAlgorithmType.COMPRESSION]?.filter(x => supportedAlgorithms[SSHAlgorithmType.COMPRESSION].includes(x)),
                },
                keepaliveIntervalSeconds: Math.round((this.profile.options.keepaliveInterval ?? 15000) / 1000),
                keepaliveCountMax: this.profile.options.keepaliveCountMax,
                connectionTimeoutSeconds: this.profile.options.readyTimeout ? Math.round(this.profile.options.readyTimeout / 1000) : undefined,
            },
        )

        if (this.authAborted) {
            this.ssh.disconnect()
            return
        }

        this.ssh.banner$.subscribe(banner => {
            if (!this.profile.options.skipBanner) {
                this.emitServiceMessage(banner)
            }
        })

        this.previouslyDisconnected = false
        this.ssh.disconnect$.subscribe(() => {
            if (!this.previouslyDisconnected) {
                this.previouslyDisconnected = true
                // Let service messages drain
                setTimeout(() => {
                    this.destroy()
                })
            }
        })

        // Authentication

        if (this.authAborted) {
            this.ssh.disconnect()
            return
        }

        this.authUsername ??= this.profile.options.user
        if (!this.authUsername) {
            if (this.authAborted) {
                this.ssh.disconnect()
                return
            }
            const modal = this.ngbModal.open(PromptModalComponent)
            modal.componentInstance.prompt = `Username for ${this.profile.options.host}`
            try {
                const result = await modal.result.catch(() => null)
                this.authUsername = result?.value ?? null
            } catch {
                this.authUsername = 'root'
            }
            if (this.authAborted) {
                this.ssh.disconnect()
                return
            }
        }

        if (this.authUsername?.startsWith('$')) {
            try {
                const result = process.env[this.authUsername.slice(1)]
                this.authUsername = result ?? this.authUsername
            } catch {
                this.authUsername = 'root'
            }
        }

        if (this.authAborted) {
            this.ssh.disconnect()
            return
        }

        const isEphemeralProfile = !this.profile.id
        if (isEphemeralProfile && this.allAuthMethods.some(method => method.type === 'prompt-password')) {
            const currentUser = this.authUsername ?? ''
            if (!currentUser || currentUser === 'root') {
                // Pre-prompt credentials so we don't auth with a default username first
                this.passwordPrompted = true
                const promptResult = await this.promptForPassword()
                if (this.authAborted || !promptResult) {
                    this.ssh.disconnect()
                    return
                }
                if (promptResult.remember) {
                    this.savedPassword = promptResult.value
                    this.shouldRememberProfile = true
                }
                this.prePromptedPassword = promptResult.value
            }
        }

        await this.populateStoredPasswordsForResolvedUsername()

        if (this.authAborted) {
            this.ssh.disconnect()
            return
        }

        const authenticatedClient = await this.handleAuth()
        if (authenticatedClient) {
            this.ssh = authenticatedClient
        } else {
            this.ssh.disconnect()
            this.passwordStorage.deletePassword(this.profile, this.authUsername ?? undefined)
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            throw new Error('Authentication rejected')
        }

        // auth success

        if (this.savedPassword) {
            this.passwordStorage.savePassword(this.profile, this.savedPassword, this.authUsername ?? undefined)
        }
        await this.saveEphemeralProfileIfNeeded()

        for (const fw of this.profile.options.forwardedPorts ?? []) {
            this.addPortForward(Object.assign(new ForwardedPort(), fw))
        }

        this.open = true

        this.ssh.tcpChannelOpen$.subscribe(async event => {
            this.logger.info(`Incoming forwarded connection: ${event.clientAddress}:${event.clientPort} -> ${event.targetAddress}:${event.targetPort}`)

            if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
                throw new Error('Cannot open agent channel before auth')
            }

            const channel = await this.ssh.activateChannel(event.channel)

            const forward = this.forwardedPorts.find(x => x.port === event.targetPort && x.host === event.targetAddress)
            if (!forward) {
                this.emitServiceMessage(colors.bgRed.black(' X ') + ` Rejected incoming forwarded connection for unrecognized port ${event.targetAddress}:${event.targetPort}`)
                channel.close()
                return
            }

            const socket = new Socket()
            socket.connect(forward.targetPort, forward.targetAddress)
            socket.on('error', e => {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                this.emitServiceMessage(colors.bgRed.black(' X ') + ` Could not forward the remote connection to ${forward.targetAddress}:${forward.targetPort}: ${e}`)
                channel.close()
            })
            channel.data$.subscribe(data => socket.write(data))
            socket.on('data', data => channel.write(Uint8Array.from(data)))
            channel.closed$.subscribe(() => socket.destroy())
            socket.on('close', () => channel.close())
            socket.on('connect', () => {
                this.logger.info('Connection forwarded')
            })
        })

        this.ssh.x11ChannelOpen$.subscribe(async event => {
            this.logger.info(`Incoming X11 connection from ${event.clientAddress}:${event.clientPort}`)
            const displaySpec = (this.config.store.ssh.x11Display || process.env.DISPLAY) ?? 'localhost:0'
            this.logger.debug(`Trying display ${displaySpec}`)

            if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
                throw new Error('Cannot open agent channel before auth')
            }

            const channel = await this.ssh.activateChannel(event.channel)

            const socket = new X11Socket()
            try {
                const x11Stream = await socket.connect(displaySpec)
                this.logger.info('Connection forwarded')

                channel.data$.subscribe(data => {
                    x11Stream.write(data)
                })
                x11Stream.on('data', data => {
                    channel.write(Uint8Array.from(data))
                })
                channel.closed$.subscribe(() => {
                    socket.destroy()
                })
                x11Stream.on('close', () => {
                    channel.close()
                })
            } catch (e) {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                this.emitServiceMessage(colors.bgRed.black(' X ') + ` Could not connect to the X server: ${e}`)
                this.emitServiceMessage(`    Tlink tried to connect to ${JSON.stringify(X11Socket.resolveDisplaySpec(displaySpec))} based on the DISPLAY environment var (${displaySpec})`)
                if (process.platform === 'win32') {
                    this.emitServiceMessage('    To use X forwarding, you need a local X server, e.g.:')
                    this.emitServiceMessage('    * VcXsrv: https://sourceforge.net/projects/vcxsrv/')
                    this.emitServiceMessage('    * Xming: https://sourceforge.net/projects/xming/')
                }
                channel.close()
            }
        })

        this.ssh.agentChannelOpen$.subscribe(async newChannel => {
            if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
                throw new Error('Cannot open agent channel before auth')
            }

            const channel = await this.ssh.activateChannel(newChannel)

            const spec = await this.getAgentConnectionSpec()
            if (!spec) {
                await channel.close()
                return
            }

            const agent = await russh.SSHAgentStream.connect(spec)
            channel.data$.subscribe(data => agent.write(data))
            agent.data$.subscribe(data => channel.write(data), undefined, () => channel.close())
            channel.closed$.subscribe(() => agent.close())
        })
    }

    private async verifyHostKey (key: russh.SshPublicKey): Promise<boolean> {
        this.emitServiceMessage('Host key fingerprint:')
        this.emitServiceMessage(colors.white.bgBlack(` ${key.algorithm()} `) + colors.bgBlackBright(' ' + key.fingerprint() + ' '))
        if (!this.config.store.ssh.verifyHostKeys) {
            return true
        }
        const selector = {
            host: this.profile.options.host,
            port: this.profile.options.port ?? 22,
            type: key.algorithm(),
        }

        const keyDigest = crypto.createHash('sha256').update(key.bytes()).digest('base64')

        const knownHost = this.knownHosts.getFor(selector)
        if (!knownHost || knownHost.digest !== keyDigest) {
            const modal = this.ngbModal.open(HostKeyPromptModalComponent)
            modal.componentInstance.selector = selector
            modal.componentInstance.digest = keyDigest
            return modal.result.catch(() => false)
        }
        return true
    }

    emitServiceMessage (msg: string): void {
        this.serviceMessage.next(msg)
        this.logger.info(stripAnsi(msg))
    }

    emitKeyboardInteractivePrompt (prompt: KeyboardInteractivePrompt): void {
        this.logger.info('Keyboard-interactive auth:', prompt.name, prompt.instruction)
        this.emitServiceMessage(colors.bgBlackBright(' ') + ` Keyboard-interactive auth requested: ${prompt.name}`)
        if (prompt.instruction) {
            for (const line of prompt.instruction.split('\n')) {
                this.emitServiceMessage(line)
            }
        }
        this.keyboardInteractivePrompt.next(prompt)
    }

    async handleAuth (): Promise<russh.AuthenticatedSSHClient|null> {
        const subscription = this.ssh.disconnect$.subscribe(() => {
            // Auto auth and >=3 keys found
            if (!this.profile.options.auth && this.allAuthMethods.filter(x => x.type === 'publickey').length >= 3) {
                this.emitServiceMessage('The server has disconnected during authentication.')
                this.emitServiceMessage('This may happen if too many private key authentication attemps are made.')
                this.emitServiceMessage('You can set the specific private key for authentication in the profile settings.')
            }
        })
        try {
            return await this._handleAuth()
        } finally {
            subscription.unsubscribe()
        }
    }

    private async _handleAuth (): Promise<russh.AuthenticatedSSHClient|null> {
        this.activePrivateKey = null

        if (!(this.ssh instanceof russh.SSHClient)) {
            throw new Error('Wrong state for auth handling')
        }

        if (!this.authUsername) {
            throw new Error('No username')
        }

        let remainingMethods = [...this.allAuthMethods]
        let methodsLeft: string[] = []

        function maybeSetRemainingMethods (r: russh.AuthFailure) {
            if (r.remainingMethods.length) {
                methodsLeft = r.remainingMethods
            }
        }

        if (this.prePromptedPassword) {
            const result = await this.ssh.authenticateWithPassword(this.authUsername, this.prePromptedPassword)
            this.prePromptedPassword = null
            if (this.authAborted) {
                return null
            }
            if (result instanceof russh.AuthenticatedSSHClient) {
                return result
            }
            maybeSetRemainingMethods(result)
            if (!this.authAborted) {
                this.passwordPrompted = false
            }
        } else {
            const noneResult = await this.ssh.authenticateNone(this.authUsername)
            if (this.authAborted) {
                return null
            }
            if (noneResult instanceof russh.AuthenticatedSSHClient) {
                return noneResult
            }
            maybeSetRemainingMethods(noneResult)
        }

        while (true) {
            if (this.authAborted) {
                return null
            }
            const m = methodsLeft
            const method = remainingMethods.find(x => m.length === 0 || m.includes(sshAuthTypeForMethod(x)))

            if (this.previouslyDisconnected || !method) {
                return null
            }

            remainingMethods = remainingMethods.filter(x => x !== method)

            if (method.type === 'saved-password') {
                if (this.authAborted) {
                    return null
                }
                this.emitServiceMessage(this.translate.instant('Using saved password'))
                const result = await this.ssh.authenticateWithPassword(this.authUsername, method.password)
                if (this.authAborted) {
                    return null
                }
                if (result instanceof russh.AuthenticatedSSHClient) {
                    return result
                }
                maybeSetRemainingMethods(result)
            }
            if (method.type === 'prompt-password') {
                // If we've already prompted or aborted, skip password authentication
                if (this.passwordPrompted || this.authAborted) {
                    continue
                }
                // Mark as prompted BEFORE showing the modal to prevent race conditions
                this.passwordPrompted = true
                const promptResult = await this.promptForPassword()
                // Check authAborted immediately after prompt returns
                if (this.authAborted) {
                    return null
                }
                if (promptResult) {
                    if (promptResult.remember) {
                        this.savedPassword = promptResult.value
                        this.shouldRememberProfile = true
                    }
                    const result = await this.ssh.authenticateWithPassword(this.authUsername, promptResult.value)
                    if (result instanceof russh.AuthenticatedSSHClient) {
                        return result
                    }
                    maybeSetRemainingMethods(result)
                    // If authentication failed, reset passwordPrompted to allow retry with new password
                    // But only if auth wasn't aborted
                    if (!this.authAborted) {
                        this.passwordPrompted = false
                    }
                } else {
                    // User cancelled the password prompt - abort authentication immediately
                    this.authAborted = true
                    // Remove password methods from remaining methods to prevent retries
                    remainingMethods = remainingMethods.filter(x => x.type !== 'prompt-password' && x.type !== 'saved-password')
                    // Disconnect SSH to stop any ongoing authentication attempts
                    if (this.ssh) {
                        this.ssh.disconnect()
                    }
                    return null
                }
            }
            if (method.type === 'publickey') {
                if (this.authAborted) {
                    return null
                }
                try {
                    const key = await this.loadPrivateKey(method.name, method.contents)
                    if (this.authAborted) {
                        return null
                    }
                    this.emitServiceMessage(`Trying private key: ${method.name}`)
                    const result = await this.ssh.authenticateWithKeyPair(this.authUsername, key, null)
                    if (this.authAborted) {
                        return null
                    }
                    if (result instanceof russh.AuthenticatedSSHClient) {
                        return result
                    }
                    maybeSetRemainingMethods(result)
                } catch (e) {
                    if (this.authAborted) {
                        return null
                    }
                    this.emitServiceMessage(colors.bgYellow.yellow.black(' ! ') + ` Failed to load private key ${method.name}: ${e}`)
                    continue
                }
            }
            if (method.type === 'keyboard-interactive') {
                if ((this.passwordPrompted || this.authAborted) && !method.savedPassword) {
                    // Avoid double-prompting the user if we've already shown a password dialog
                    continue
                }
                let state: russh.AuthenticatedSSHClient|russh.KeyboardInteractiveAuthenticationState = await this.ssh.startKeyboardInteractiveAuthentication(this.authUsername)

                while (true) {
                    if (state.state === 'failure') {
                        maybeSetRemainingMethods(state)
                        break
                    }

                    const prompts = state.prompts()

                    let responses: string[] = []
                    // OpenSSH can send a k-i request without prompts
                    // just respond ok to it
                    if (prompts.length > 0) {
                        const prompt = new KeyboardInteractivePrompt(
                            state.name,
                            state.instructions,
                            state.prompts(),
                        )

                        let shouldPromptUser = true
                        if (method.savedPassword) {
                            // eslint-disable-next-line max-depth
                            for (let i = 0; i < prompt.prompts.length; i++) {
                                // eslint-disable-next-line max-depth
                                if (prompt.isAPasswordPrompt(i)) {
                                    prompt.responses[i] = method.savedPassword
                                }
                            }
                            // If all prompts are password prompts, auto-respond using the saved password
                            const hasNonPasswordPrompt = prompt.prompts.some((_, i) => !prompt.isAPasswordPrompt(i))
                            if (!hasNonPasswordPrompt) {
                                shouldPromptUser = false
                            }
                        }

                        if (shouldPromptUser) {
                            this.emitKeyboardInteractivePrompt(prompt)
                        } else {
                            responses = prompt.responses
                        }

                        try {
                            if (shouldPromptUser) {
                                // eslint-disable-next-line @typescript-eslint/await-thenable
                                responses = await prompt.promise
                                // Check authAborted after prompt resolves
                                if (this.authAborted) {
                                    return null
                                }
                            }
                        } catch {
                            break // this loop
                        }
                    }

                    if (this.authAborted) {
                        return null
                    }

                    state = await this.ssh.continueKeyboardInteractiveAuthentication(responses)
                    
                    if (this.authAborted) {
                        return null
                    }

                    if (state instanceof russh.AuthenticatedSSHClient) {
                        return state
                    }
                }
            }
            if (method.type === 'agent') {
                if (this.authAborted) {
                    return null
                }
                try {
                    const result = await this.ssh.authenticateWithAgent(this.authUsername, method)
                    if (this.authAborted) {
                        return null
                    }
                    if (result instanceof russh.AuthenticatedSSHClient) {
                        return result
                    }
                    maybeSetRemainingMethods(result)
                } catch (e) {
                    if (this.authAborted) {
                        return null
                    }
                    this.emitServiceMessage(colors.bgYellow.yellow.black(' ! ') + ` Failed to authenticate using agent: ${e}`)
                    continue
                }
            }
        }
        return null
    }

    async addPortForward (fw: ForwardedPort): Promise<void> {
        if (fw.type === PortForwardType.Local || fw.type === PortForwardType.Dynamic) {
            await fw.startLocalListener(async (accept, reject, sourceAddress, sourcePort, targetAddress, targetPort) => {
                this.logger.info(`New connection on ${fw}`)
                if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
                    this.logger.error(`Connection while unauthenticated on ${fw}`)
                    reject()
                    return
                }
                const channel = await this.ssh.activateChannel(await this.ssh.openTCPForwardChannel({
                    addressToConnectTo: targetAddress,
                    portToConnectTo: targetPort,
                    originatorAddress: sourceAddress ?? '127.0.0.1',
                    originatorPort: sourcePort ?? 0,
                }).catch(err => {
                    this.emitServiceMessage(colors.bgRed.black(' X ') + ` Remote has rejected the forwarded connection to ${targetAddress}:${targetPort} via ${fw}: ${err}`)
                    reject()
                    throw err
                }))
                const socket = accept()
                channel.data$.subscribe(data => socket.write(data))
                socket.on('data', data => channel.write(Uint8Array.from(data)))
                channel.closed$.subscribe(() => socket.destroy())
                socket.on('close', () => channel.close())
            }).then(() => {
                this.emitServiceMessage(colors.bgGreen.black(' -> ') + ` Forwarded ${fw}`)
                this.forwardedPorts.push(fw)
            }).catch(e => {
                this.emitServiceMessage(colors.bgRed.black(' X ') + ` Failed to forward port ${fw}: ${e}`)
                throw e
            })
        }
        if (fw.type === PortForwardType.Remote) {
            if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
                throw new Error('Cannot add remote port forward before auth')
            }
            try {
                await this.ssh.forwardTCPPort(fw.host, fw.port)
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                this.emitServiceMessage(colors.bgRed.black(' X ') + ` Remote rejected port forwarding for ${fw}: ${err}`)
                return
            }
            this.emitServiceMessage(colors.bgGreen.black(' <- ') + ` Forwarded ${fw}`)
            this.forwardedPorts.push(fw)
        }
    }

    async removePortForward (fw: ForwardedPort): Promise<void> {
        if (fw.type === PortForwardType.Local || fw.type === PortForwardType.Dynamic) {
            fw.stopLocalListener()
            this.forwardedPorts = this.forwardedPorts.filter(x => x !== fw)
        }
        if (fw.type === PortForwardType.Remote) {
            if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
                throw new Error('Cannot remove remote port forward before auth')
            }
            this.ssh.stopForwardingTCPPort(fw.host, fw.port)
            this.forwardedPorts = this.forwardedPorts.filter(x => x !== fw)
        }
        this.emitServiceMessage(`Stopped forwarding ${fw}`)
    }

    async destroy (): Promise<void> {
        this.logger.info('Destroying')
        this.open = false
        this.willDestroy.next()
        this.willDestroy.complete()
        this.serviceMessage.complete()
        this.ssh.disconnect()
    }

    async openShellChannel (options: { x11: boolean }): Promise<russh.Channel> {
        if (!(this.ssh instanceof russh.AuthenticatedSSHClient)) {
            throw new Error('Cannot open shell channel before auth')
        }
        const ch = await this.ssh.activateChannel(await this.ssh.openSessionChannel())
        await ch.requestPTY('xterm-256color', {
            columns: 80,
            rows: 24,
            pixHeight: 0,
            pixWidth: 0,
        })
        if (options.x11) {
            await ch.requestX11Forwarding({
                singleConnection: false,
                authProtocol: 'MIT-MAGIC-COOKIE-1',
                authCookie: crypto.randomBytes(16).toString('hex'),
                screenNumber: 0,
            })
        }
        if (this.profile.options.agentForward) {
            await ch.requestAgentForwarding()
        }
        await ch.requestShell()
        return ch
    }

    async loadPrivateKey (name: string, privateKeyContents: Buffer): Promise<russh.KeyPair> {
        this.activePrivateKey = await this.loadPrivateKeyWithPassphraseMaybe(privateKeyContents.toString())
        return this.activePrivateKey
    }

    async loadPrivateKeyWithPassphraseMaybe (privateKey: string): Promise<russh.KeyPair> {
        const keyHash = crypto.createHash('sha512').update(privateKey).digest('hex')

        privateKey = privateKey.replaceAll('EC PRIVATE KEY', 'PRIVATE KEY')

        let triedSavedPassphrase = false
        let passphrase: string|null = null
        while (true) {
            try {
                return await russh.KeyPair.parse(privateKey, passphrase ?? undefined)
            } catch (e) {
                if (!triedSavedPassphrase) {
                    passphrase = await this.passwordStorage.loadPrivateKeyPassword(keyHash)
                    triedSavedPassphrase = true
                    continue
                }
                if ([
                    'Error: Keys(KeyIsEncrypted)',
                    'Error: Keys(SshKey(Ppk(Encrypted)))',
                    'Error: Keys(SshKey(Ppk(IncorrectMac)))',
                    'Error: Keys(SshKey(Crypto))',
                ].includes(e.toString())) {
                    await this.passwordStorage.deletePrivateKeyPassword(keyHash)

                    const modal = this.ngbModal.open(PromptModalComponent)
                    modal.componentInstance.prompt = 'Private key passphrase'
                    modal.componentInstance.password = true
                    modal.componentInstance.showRememberCheckbox = true

                    const result = await modal.result.catch(() => {
                        throw new Error('Passphrase prompt cancelled')
                    })

                    passphrase = result?.value
                    if (passphrase && result.remember) {
                        this.passwordStorage.savePrivateKeyPassword(keyHash, passphrase)
                    }
                } else {
                    this.notifications.error('Could not read the private key', e.toString())
                    throw e
                }
            }
        }
    }

    ref (): void {
        this.refCount++
    }

    unref (): void {
        this.refCount--
        if (this.refCount === 0) {
            this.destroy()
        }
    }
}
