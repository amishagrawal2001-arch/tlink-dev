import { Component, Injector, OnDestroy, ViewChild, ElementRef, HostBinding, AfterViewInit, HostListener } from '@angular/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { BaseTabComponent, ConfigService, PlatformService, TranslateService, NotificationsService, GetRecoveryTokenOptions, RecoveryToken, HostAppService } from 'tlink-core'
import { Platform } from 'tlink-core'
import { RDPProfile } from '../api'
import { RDPSession } from '../session/rdp'
import { RDPService } from '../services/rdp.service'
import { RDPPasswordStorageService } from '../services/passwordStorage.service'
import { RDPSessionLoggerService, SessionLogHandle } from '../services/sessionLogger.service'
import { SCANCODE_MAP, isExtendedScancode, getRawScancode } from '../session/scancodes'

/** FreeRDP ERRCONNECT code → user-friendly message */
const FREERDP_ERROR_MAP: Record<string, string> = {
    'LOGON_FAILURE': 'Login failed. Check username, password, and domain.',
    'ACCOUNT_LOCKED_OUT': 'Account is locked out. Contact your administrator.',
    'CONNECT_TRANSPORT_FAILED': 'Cannot reach the server. Check hostname and port.',
    'DNS_NAME_NOT_RESOLVED': 'Hostname not found. Check the server address.',
    'DNS_ERROR': 'DNS lookup failed. Check network and server address.',
    'CONNECT_FAILED': 'Connection failed. Ensure RDP is enabled on the remote machine.',
    'CONNECT_CANCELLED': 'Connection cancelled by the server.',
    'TLS_CONNECT_FAILED': 'TLS handshake failed. The server may have rejected the connection.',
    'AUTHENTICATION_FAILED': 'Authentication failed. Check credentials or try a different security mode.',
    'PASSWORD_EXPIRED': 'Password has expired. Change it on the server and reconnect.',
    'PASSWORD_MUST_CHANGE': 'Password must be changed before login.',
    'INSUFFICIENT_PRIVILEGES': 'Insufficient privileges. You may not have RDP access on this server.',
    'KDC_UNREACHABLE': 'Kerberos KDC unreachable. Check domain controller connectivity.',
    'ACCOUNT_DISABLED': 'Account is disabled. Contact your administrator.',
    'ACCOUNT_EXPIRED': 'Account has expired. Contact your administrator.',
    'WRONG_PASSWORD': 'Wrong password.',
}

/** @hidden */
@Component({
    selector: 'rdp-tab',
    templateUrl: './rdpTab.component.pug',
    styleUrls: ['./rdpTab.component.scss'],
})
export class RDPTabComponent extends BaseTabComponent implements AfterViewInit, OnDestroy {
    @HostBinding('class.rdp-tab') hostClass = true
    @ViewChild('canvas', { static: true }) canvas?: ElementRef<HTMLCanvasElement>

    profile: RDPProfile
    Platform = Platform
    connecting = false
    connected = false
    connectionError: string|null = null
    private ctx: CanvasRenderingContext2D | null = null
    private rdpSession: RDPSession | null = null
    private imageData: ImageData | null = null
    private fallingBackToFreeRDP = false

    // Reconnect state
    reconnectOffered = false
    private isDisconnectedByHand = false
    private reconnecting = false
    private reconnectTimestamps: number[] = []

    // Session logging
    private logHandle: SessionLogHandle | null = null

    protected platform: PlatformService
    protected hostApp: HostAppService
    protected translate: TranslateService
    protected notifications: NotificationsService
    protected injector: Injector
    private rdpService: RDPService
    private configService: ConfigService
    private passwordStorage: RDPPasswordStorageService
    private sessionLogger: RDPSessionLoggerService
    usingExternalClient = false

    constructor (injector: Injector) {
        super(injector)
        this.injector = injector
        this.platform = injector.get(PlatformService)
        this.hostApp = injector.get(HostAppService)
        this.translate = injector.get(TranslateService)
        this.notifications = injector.get(NotificationsService)
        this.rdpService = injector.get(RDPService)
        this.configService = injector.get(ConfigService)
        this.passwordStorage = injector.get(RDPPasswordStorageService)
        this.sessionLogger = injector.get(RDPSessionLoggerService)
    }

    ngAfterViewInit (): void {
        if (!this.profile) {
            this.connectionError = 'No RDP profile provided'
            return
        }

        setTimeout(() => {
            this.setTitle(`RDP: ${this.profile.options.user}@${this.profile.options.host}`)
        }, 0)

        if (this.canvas?.nativeElement) {
            this.ctx = this.canvas.nativeElement.getContext('2d')
            this.resizeCanvas()
        }

        setTimeout(() => {
            void this.connect()
        }, 0)
    }

    ngOnDestroy (): void {
        this.sessionLogger.stopLogging(this.logHandle)
        this.logHandle = null
        this.disconnect()
        if (this.imageData) {
            this.imageData = null
        }
    }

    private resizeCanvas (): void {
        if (!this.canvas?.nativeElement || !this.ctx) {
            return
        }

        const width = this.profile.options.width ?? 1920
        const height = this.profile.options.height ?? 1080

        this.canvas.nativeElement.width = width
        this.canvas.nativeElement.height = height

        this.ctx.fillStyle = '#000000'
        this.ctx.fillRect(0, 0, width, height)

        this.ctx.fillStyle = '#FFFFFF'
        this.ctx.font = '24px monospace'
        this.ctx.textAlign = 'center'
        this.ctx.fillText('Connecting to RDP server...', width / 2, height / 2)
    }

    private getNativeWindowHandleHex (): string|null {
        if (this.hostApp.platform === Platform.macOS) {
            return null
        }
        try {
            const electron = (window as any)?.require?.('electron')
            const remote = electron?.remote ?? electron?.ipcRenderer ? electron.remote : null
            const currentWindow = remote?.getCurrentWindow?.()
            const handle: Buffer|undefined = currentWindow?.getNativeWindowHandle?.()
            if (!handle || !Buffer.isBuffer(handle)) {
                return null
            }
            if (handle.length >= 8 && typeof handle.readBigUInt64LE === 'function') {
                const id = handle.readBigUInt64LE(0)
                return `0x${id.toString(16)}`
            }
            const id32 = handle.readUInt32LE(0)
            return `0x${id32.toString(16)}`
        } catch {
            return null
        }
    }

    /** Parse FreeRDP ERRCONNECT codes from stderr into user-friendly messages */
    private parseFreeRDPError (message: string): string | null {
        for (const [code, hint] of Object.entries(FREERDP_ERROR_MAP)) {
            if (message.includes(code)) {
                return hint
            }
        }
        return null
    }

    private summarizeExternalError (message: string): string {
        const parsed = this.parseFreeRDPError(message)
        if (parsed) {
            return parsed
        }

        const lines = (message || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        if (!lines.length) {
            return message
        }

        const logonFail = lines.some(l => l.toLowerCase().includes('logon_failure') || l.toLowerCase().includes('nla_recv_pdu'))
        const certWarn = lines.some(l => l.toLowerCase().includes('tls_verify_certificate'))
        const displayErr = lines.some(l => l.toLowerCase().includes('display') || l.toLowerCase().includes('x server not available') || l.toLowerCase().includes('xquartz'))

        const hints: string[] = []
        if (logonFail) {
            hints.push('Authentication failed – check user/password/domain or disable NLA in Security.')
        }
        if (certWarn) {
            hints.push('Certificate check failed – enable "Ignore certificate" to bypass.')
        }
        if (displayErr) {
            hints.push(
                'X server not available – ensure XQuartz/X11 is running and DISPLAY is set. ' +
                'Steps: install XQuartz (brew install --cask xquartz or latest .dmg from xquartz.org), start it (open -a XQuartz), ' +
                'allow network clients in XQuartz Security prefs, then in a terminal run: export DISPLAY=:0 && /opt/X11/bin/xhost +localhost before launching Tlink.'
            )
        }

        const firstLine = lines[0]
        const hintText = hints.join(' ')
        return [firstLine, hintText].filter(Boolean).join('\n')
    }

    private getFreeRDPInstallHint (): string {
        const macOSHint = 'macOS:\n' +
            '1) brew install freerdp\n' +
            '2) brew install --cask xquartz\n' +
            '3) Log out/in once, then run: open -a XQuartz\n' +
            '4) In terminal before launching Tlink: export DISPLAY=:0 && xhost +localhost'

        const windowsHint = 'Windows:\n' +
            '1) Install MSYS2\n' +
            '2) In MSYS2 UCRT64 shell run: pacman -Syu\n' +
            '3) Then run: pacman -S mingw-w64-ucrt-x86_64-freerdp\n' +
            '4) Add C:\\msys64\\ucrt64\\bin to PATH\n' +
            '5) Verify in PowerShell: where xfreerdp'

        return `Install FreeRDP:\n${macOSHint}\n\n${windowsHint}`
    }

    private summarizeEmbeddedError (error: any): string {
        const rawMessage = error?.message || error?.toString?.() || 'Connection failed'
        const errorCode = error?.code as string | undefined
        const installHint = this.getFreeRDPInstallHint()

        if (errorCode === 'NODE_RDP_PROTOCOL_X224_NEG_FAILURE' || rawMessage.includes('X224_NEG_FAILURE')) {
            return 'This server needs a secure sign-in method that the built-in RDP client cannot use.\n\n' +
                'Please open profile settings, change "Client Type" to "FreeRDP", and try again.\n\n' +
                installHint
        }
        if (errorCode === 'NODE_RDP_PROTOCOL_X224_NLA_NOT_SUPPORTED' || rawMessage.includes('NLA_NOT_SUPPORTED')) {
            return 'This server requires Network Level Authentication (NLA), which the built-in RDP client does not support.\n\n' +
                'Please switch "Client Type" to "FreeRDP" in profile settings and reconnect.\n\n' +
                installHint
        }
        if (errorCode === 'ECONNRESET' || rawMessage.includes('ECONNRESET')) {
            return 'The server closed the connection.\n\n' +
                'This usually means the built-in RDP client was rejected during security checks. ' +
                'Switch "Client Type" to "FreeRDP" and try again.\n\n' +
                installHint
        }

        return rawMessage
    }

    copyError (): void {
        if (!this.connectionError) {
            return
        }
        try {
            navigator.clipboard?.writeText(this.connectionError)
            this.notifications.info(this.translate.instant('Copied error message'))
        } catch {
            const textarea = document.createElement('textarea')
            textarea.value = this.connectionError
            document.body.appendChild(textarea)
            textarea.select()
            try { document.execCommand('copy') } catch { /* ignore */ }
            document.body.removeChild(textarea)
            this.notifications.info(this.translate.instant('Copied error message'))
        }
    }

    private async promptInstallXQuartz (): Promise<void> {
        this.connectionError = 'XQuartz (X11) is required for FreeRDP on macOS.'
        this.setStatusError()

        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: this.translate.instant('XQuartz Required'),
            detail: this.translate.instant(
                'FreeRDP requires XQuartz (X11) to display the remote desktop on macOS.\n\n' +
                'Would you like to install it now?\n\n' +
                'Note: After installing, you must log out and back in (or reboot) for XQuartz to work.',
            ),
            buttons: [
                this.translate.instant('Download XQuartz'),
                this.translate.instant('Copy Homebrew Command'),
                this.translate.instant('Cancel'),
            ],
            defaultId: 0,
            cancelId: 2,
        })

        if (result.response === 0) {
            (this.platform as any).openExternal?.('https://www.xquartz.org/') ||
            (this.platform as any).openPath?.('https://www.xquartz.org/')
            this.notifications.info(this.translate.instant('Opening XQuartz download page...'))
        } else if (result.response === 1) {
            const cmd = 'brew install --cask xquartz'
            try { navigator.clipboard?.writeText(cmd) } catch { /* ignore */ }
            this.notifications.info(this.translate.instant('Run in terminal: ') + cmd)
        }
    }

    private async promptInstallRDPClient (): Promise<void> {
        if (this.hostApp.platform === Platform.macOS) {
            this.connectionError = 'Microsoft Remote Desktop is required for RDP connections on macOS.'
            this.setStatusError()

            const result = await this.platform.showMessageBox({
                type: 'warning',
                message: this.translate.instant('Microsoft Remote Desktop Required'),
                detail: this.translate.instant(
                    'RDP connections on macOS require Microsoft Remote Desktop.\n\n' +
                    'Would you like to install it now?',
                ),
                buttons: [
                    this.translate.instant('Open App Store'),
                    this.translate.instant('Copy Homebrew Command'),
                    this.translate.instant('Cancel'),
                ],
                defaultId: 0,
                cancelId: 2,
            })

            if (result.response === 0) {
                (this.platform as any).openExternal?.('macappstore://apps.apple.com/app/id1295203466') ||
                (this.platform as any).openPath?.('macappstore://apps.apple.com/app/id1295203466')
                this.notifications.info(this.translate.instant('Opening App Store...'))
            } else if (result.response === 1) {
                const cmd = 'brew install --cask microsoft-remote-desktop'
                try { navigator.clipboard?.writeText(cmd) } catch { /* ignore */ }
                this.notifications.info(this.translate.instant('Run in terminal: ') + cmd)
            }
        } else if (this.hostApp.platform === Platform.Windows) {
            this.connectionError = 'mstsc.exe not found. Windows Remote Desktop should be built-in.'
            this.setStatusError()
            this.notifications.error(this.translate.instant('Windows Remote Desktop (mstsc.exe) not found. Check your Windows installation.'))
        } else {
            // Linux
            this.connectionError = 'No RDP client found. Install Remmina, FreeRDP, or rdesktop.'
            this.setStatusError()

            const result = await this.platform.showMessageBox({
                type: 'warning',
                message: this.translate.instant('RDP Client Required'),
                detail: this.translate.instant(
                    'No RDP client found on this system.\n\n' +
                    'Install one of the following:\n' +
                    '  - Remmina (recommended)\n' +
                    '  - FreeRDP (xfreerdp)\n' +
                    '  - rdesktop',
                ),
                buttons: [
                    this.translate.instant('Copy Install Command (Remmina)'),
                    this.translate.instant('Copy Install Command (FreeRDP)'),
                    this.translate.instant('Cancel'),
                ],
                defaultId: 0,
                cancelId: 2,
            })

            let cmd = ''
            if (result.response === 0) {
                cmd = 'sudo apt install -y remmina remmina-plugin-rdp'
            } else if (result.response === 1) {
                cmd = 'sudo apt install -y freerdp2-x11'
            }
            if (cmd) {
                try { navigator.clipboard?.writeText(cmd) } catch { /* ignore */ }
                this.notifications.info(this.translate.instant('Run in terminal: ') + cmd)
            }
        }
    }

    private setStatusConnecting (): void {
        this.setProgress(0.5)
        this.color = '#FFA500'
    }

    private setStatusConnected (): void {
        this.setProgress(null)
        this.color = '#00CC00'
    }

    private setStatusError (): void {
        this.setProgress(null)
        this.color = '#FF4444'
    }

    private setStatusDisconnected (): void {
        this.setProgress(null)
        this.color = null
    }

    private async resolvePassword (): Promise<string | undefined> {
        if (this.profile.options.password) {
            return this.profile.options.password
        }
        try {
            const stored = await this.passwordStorage.loadPassword(this.profile)
            if (stored) {
                return stored
            }
        } catch {
            // keychain unavailable
        }
        return undefined
    }

    async connect (): Promise<void> {
        if (this.connected || this.connecting) {
            return
        }

        this.fallingBackToFreeRDP = false
        this.reconnectOffered = false
        this.isDisconnectedByHand = false
        this.setStatusConnecting()

        const clientType = this.profile.options.clientType ?? 'node-rdpjs'

        if (clientType === 'rdp-file') {
            this.connecting = true
            this.connectionError = null
            this.usingExternalClient = true

            try {
                const password = await this.resolvePassword()
                await this.rdpService.launchRDPFile(this.profile, password)
                this.connected = true
                this.setStatusConnected()
                this.startSessionLogging('rdp-file')
                this.notifications.info(this.translate.instant('RDP launched via system handler'))
                // Auto-close the placeholder tab for external clients
                setTimeout(() => this.destroy(), 500)
            } catch (error: any) {
                if (error?.code === 'MISSING_RDP_CLIENT' || error?.message === 'MISSING_RDP_CLIENT') {
                    await this.promptInstallRDPClient()
                } else {
                    this.connectionError = error?.message ?? 'Failed to launch RDP file'
                    this.notifications.error(this.connectionError || 'Failed to launch RDP file')
                }
                this.connected = false
                this.setStatusError()
            } finally {
                this.connecting = false
            }
            return
        }

        if (clientType === 'xfreerdp') {
            this.connecting = true
            this.connectionError = null
            this.usingExternalClient = true

            try {
                const parentWindow = this.getNativeWindowHandleHex()
                const password = await this.resolvePassword()
                await this.rdpService.launchFreeRDP(this.profile, parentWindow, password)
                this.connected = true
                this.setStatusConnected()
                this.startSessionLogging('xfreerdp')
                this.notifications.info(this.translate.instant('FreeRDP launched'))
                // Auto-close the placeholder tab for external clients
                setTimeout(() => this.destroy(), 500)
            } catch (error: any) {
                if (error?.code === 'MISSING_XQUARTZ' || error?.message === 'MISSING_XQUARTZ') {
                    await this.promptInstallXQuartz()
                } else {
                    const rawMessage = error?.message ?? 'Failed to launch FreeRDP'
                    this.connectionError = this.summarizeExternalError(rawMessage)
                    this.notifications.error(this.connectionError || 'Failed to launch FreeRDP')
                }
                this.connected = false
                this.setStatusError()
            } finally {
                this.connecting = false
            }
            return
        }

        // Use node-rdpjs (embedded client)
        this.connecting = true
        this.connectionError = null
        this.usingExternalClient = false

        try {
            this.rdpSession = new RDPSession(this.injector, this.profile)

            this.rdpSession.bitmap$.subscribe(bitmap => {
                this.handleBitmapUpdate(bitmap)
            })

            this.rdpSession.error$.subscribe(error => {
                const errorCode = (error as any)?.code as string | undefined
                const rawMessage = error?.message || error?.toString?.() || ''

                if (errorCode === 'NODE_RDP_PROTOCOL_X224_NEG_FAILURE' || rawMessage.includes('X224_NEG_FAILURE') ||
                    errorCode === 'NODE_RDP_PROTOCOL_X224_NLA_NOT_SUPPORTED' || rawMessage.includes('NLA_NOT_SUPPORTED') ||
                    errorCode === 'ECONNRESET' || rawMessage.includes('ECONNRESET')) {
                    this.fallingBackToFreeRDP = true
                    this.notifications.info(this.translate.instant('Built-in client rejected, retrying with FreeRDP...'))
                    this.rdpSession?.destroy()
                    this.rdpSession = null
                    this.connecting = false
                    this.connected = false
                    void this.connectWithFreeRDP()
                    return
                }

                const errorMessage = this.summarizeEmbeddedError(error)
                this.connectionError = errorMessage
                this.notifications.error(errorMessage)
                this.connected = false
                this.setStatusError()
            })

            this.rdpSession.willDestroy$.subscribe(() => {
                if (this.connected) {
                    this.connected = false
                    this.setStatusDisconnected()
                    this.onSessionEnd()
                }
            })

            await this.rdpSession.start()

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'))
                }, 30000)

                const checkConnection = () => {
                    if (this.fallingBackToFreeRDP) {
                        clearTimeout(timeout)
                        resolve()
                        return
                    }
                    if (this.rdpSession?.open) {
                        clearTimeout(timeout)
                        this.connected = true
                        this.setStatusConnected()
                        this.startSessionLogging('node-rdpjs')
                        resolve()
                    } else if (!this.rdpSession || this.connectionError) {
                        clearTimeout(timeout)
                        reject(new Error(this.connectionError || 'Connection failed'))
                    } else {
                        setTimeout(checkConnection, 100)
                    }
                }
                checkConnection()
            })

        } catch (error: any) {
            if (!this.fallingBackToFreeRDP) {
                this.connectionError = error?.message ?? 'Failed to connect'
                this.notifications.error(this.connectionError || 'Failed to connect')
                this.setStatusError()
            }
            if (this.rdpSession) {
                this.rdpSession.destroy()
                this.rdpSession = null
            }
        } finally {
            this.connecting = false
        }
    }

    private async connectWithFreeRDP (): Promise<void> {
        this.connecting = true
        this.connectionError = null
        this.usingExternalClient = true
        this.setStatusConnecting()

        try {
            const parentWindow = this.getNativeWindowHandleHex()
            const password = await this.resolvePassword()
            await this.rdpService.launchFreeRDP(this.profile, parentWindow, password)
            this.connected = true
            this.setStatusConnected()
            this.startSessionLogging('xfreerdp')

            // Auto-save client type after successful fallback
            if (this.fallingBackToFreeRDP) {
                this.profile.options.clientType = 'xfreerdp'
                try {
                    const profiles = this.configService.store.profiles as any[]
                    if (profiles) {
                        const idx = profiles.findIndex((p: any) => p.id === (this.profile as any).id)
                        if (idx >= 0) {
                            profiles[idx].options = { ...profiles[idx].options, clientType: 'xfreerdp' }
                            this.configService.save()
                        }
                    }
                } catch {
                    // ignore save errors
                }
                this.notifications.info(this.translate.instant('Client type saved as FreeRDP for future connections'))
            }

            this.notifications.info(this.translate.instant('FreeRDP launched'))
            // Auto-close the placeholder tab for external clients
            setTimeout(() => this.destroy(), 500)
        } catch (error: any) {
            // Check for missing XQuartz on macOS
            if (error?.code === 'MISSING_XQUARTZ' || error?.message === 'MISSING_XQUARTZ') {
                await this.promptInstallXQuartz()
                this.connected = false
                this.setStatusError()
                this.connecting = false
                return
            }

            // On macOS, fall back to .rdp file launch if FreeRDP fails
            if (this.hostApp.platform === Platform.macOS) {
                try {
                    const password = await this.resolvePassword()
                    await this.rdpService.launchRDPFile(this.profile, password)
                    this.connected = true
                    this.usingExternalClient = true
                    this.setStatusConnected()
                    this.startSessionLogging('rdp-file')
                    this.notifications.info(this.translate.instant('RDP launched via system handler'))
                    return
                } catch (rdpFileError: any) {
                    if (rdpFileError?.code === 'MISSING_RDP_CLIENT' || rdpFileError?.message === 'MISSING_RDP_CLIENT') {
                        await this.promptInstallRDPClient()
                        return
                    }
                }
            }

            const rawMessage = error?.message ?? 'Failed to launch FreeRDP'
            this.connectionError = this.summarizeExternalError(rawMessage)
            this.notifications.error(this.connectionError || 'Failed to launch FreeRDP')
            this.connected = false
            this.setStatusError()
        } finally {
            this.connecting = false
        }
    }

    private startSessionLogging (client: string): void {
        this.logHandle = this.sessionLogger.startLogging(this.profile)
        this.sessionLogger.logEvent(this.logHandle, 'connect', {
            client,
            host: this.profile.options.host,
            port: this.profile.options.port ?? 3389,
            user: this.profile.options.user,
        })
    }

    private onSessionEnd (): void {
        this.sessionLogger.logEvent(this.logHandle, 'disconnect')
        this.sessionLogger.stopLogging(this.logHandle)
        this.logHandle = null

        if (this.isDisconnectedByHand || this.reconnecting) {
            return
        }

        const behavior = (this.profile as any).behaviorOnSessionEnd ?? 'reconnect'

        if (behavior === 'close') {
            this.destroy()
            return
        }

        if (behavior === 'reconnect') {
            const now = Date.now()
            this.reconnectTimestamps = this.reconnectTimestamps.filter(t => now - t < 10000)
            if (this.reconnectTimestamps.length >= 5) {
                this.reconnectOffered = true
                this.notifications.error(this.translate.instant('Too many reconnect attempts. Click to retry.'))
                return
            }
            this.reconnectTimestamps.push(now)
            void this.reconnect()
            return
        }

        this.reconnectOffered = true
    }

    async reconnect (): Promise<void> {
        if (this.reconnecting) {
            return
        }
        this.reconnecting = true
        this.reconnectOffered = false
        this.isDisconnectedByHand = false
        if (this.rdpSession) {
            this.rdpSession.destroy()
            this.rdpSession = null
        }
        this.connected = false

        await new Promise(resolve => setTimeout(resolve, 1000))

        this.reconnecting = false
        this.fallingBackToFreeRDP = false
        void this.connect()
    }

    private handleBitmapUpdate (bitmap: any): void {
        if (!this.ctx || !this.canvas?.nativeElement) {
            return
        }

        try {
            const { x, y, width, height, bitsPerPixel, buffer } = bitmap

            if (bitsPerPixel === 32) {
                if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
                    this.imageData = this.ctx.createImageData(width, height)
                }
                const data = new Uint8ClampedArray(buffer)
                this.imageData.data.set(data)
                this.ctx.putImageData(this.imageData, x, y)
            } else if (bitsPerPixel === 24) {
                if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
                    this.imageData = this.ctx.createImageData(width, height)
                }
                const rgbData = new Uint8Array(buffer)
                const rgbaData = this.imageData.data
                for (let i = 0; i < rgbData.length; i += 3) {
                    const rgbaIndex = (i / 3) * 4
                    rgbaData[rgbaIndex] = rgbData[i]
                    rgbaData[rgbaIndex + 1] = rgbData[i + 1]
                    rgbaData[rgbaIndex + 2] = rgbData[i + 2]
                    rgbaData[rgbaIndex + 3] = 255
                }
                this.ctx.putImageData(this.imageData, x, y)
            }
        } catch (error) {
            console.error('Error rendering bitmap:', error)
        }
    }

    @HostListener('keydown', ['$event'])
    onKeyDown (event: KeyboardEvent): void {
        if (!this.connected || !this.rdpSession) {
            return
        }
        const scancode = SCANCODE_MAP[event.code]
        if (scancode !== undefined) {
            event.preventDefault()
            const extended = isExtendedScancode(scancode)
            const raw = getRawScancode(scancode)
            this.rdpSession.sendKeyEvent(raw, true, extended)
            if (this.profile.options.sessionLog?.logInputEvents) {
                this.sessionLogger.logEvent(this.logHandle, 'key', { code: event.code, scancode: raw, extended, pressed: true })
            }
        }
    }

    @HostListener('keyup', ['$event'])
    onKeyUp (event: KeyboardEvent): void {
        if (!this.connected || !this.rdpSession) {
            return
        }
        const scancode = SCANCODE_MAP[event.code]
        if (scancode !== undefined) {
            event.preventDefault()
            const extended = isExtendedScancode(scancode)
            const raw = getRawScancode(scancode)
            this.rdpSession.sendKeyEvent(raw, false, extended)
        }
    }

    @HostListener('mousedown', ['$event'])
    onMouseDown (event: MouseEvent): void {
        if (!this.connected || !this.rdpSession || !this.canvas?.nativeElement) {
            return
        }
        const rect = this.canvas.nativeElement.getBoundingClientRect()
        const x = Math.floor(event.clientX - rect.left)
        const y = Math.floor(event.clientY - rect.top)
        const button = event.button === 0 ? 1 : event.button === 2 ? 2 : 0
        this.rdpSession.sendPointerEvent(x, y, button, true)
    }

    @HostListener('mouseup', ['$event'])
    onMouseUp (event: MouseEvent): void {
        if (!this.connected || !this.rdpSession || !this.canvas?.nativeElement) {
            return
        }
        const rect = this.canvas.nativeElement.getBoundingClientRect()
        const x = Math.floor(event.clientX - rect.left)
        const y = Math.floor(event.clientY - rect.top)
        const button = event.button === 0 ? 1 : event.button === 2 ? 2 : 0
        this.rdpSession.sendPointerEvent(x, y, button, false)
    }

    @HostListener('mousemove', ['$event'])
    onMouseMove (event: MouseEvent): void {
        if (!this.connected || !this.rdpSession || !this.canvas?.nativeElement) {
            return
        }
        const rect = this.canvas.nativeElement.getBoundingClientRect()
        const x = Math.floor(event.clientX - rect.left)
        const y = Math.floor(event.clientY - rect.top)
        this.rdpSession.sendPointerEvent(x, y, 0, false)
    }

    disconnect (): void {
        this.isDisconnectedByHand = true
        if (this.rdpSession) {
            this.rdpSession.destroy()
            this.rdpSession = null
        }
        this.connected = false
        this.setStatusDisconnected()
        this.sessionLogger.logEvent(this.logHandle, 'disconnect')
        this.sessionLogger.stopLogging(this.logHandle)
        this.logHandle = null
    }

    async getRecoveryToken (options?: GetRecoveryTokenOptions): Promise<RecoveryToken|null> {
        if (!this.profile) {
            return null
        }
        return {
            type: 'app:rdp-tab',
            profile: this.profile,
        }
    }

    async canClose (): Promise<boolean> {
        if (!this.connected) {
            return true
        }
        if (!this.profile) {
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
}
