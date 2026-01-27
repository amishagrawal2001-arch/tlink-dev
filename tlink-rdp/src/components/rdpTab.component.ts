import { Component, Injector, OnDestroy, ViewChild, ElementRef, HostBinding, AfterViewInit, HostListener } from '@angular/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { BaseTabComponent, PlatformService, TranslateService, NotificationsService, GetRecoveryTokenOptions, RecoveryToken, HostAppService } from 'tlink-core'
import { Platform } from 'tlink-core'
import { RDPProfile } from '../api'
import { RDPSession } from '../session/rdp'
import { RDPService } from '../services/rdp.service'

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

    protected platform: PlatformService
    protected hostApp: HostAppService
    protected translate: TranslateService
    protected notifications: NotificationsService
    protected injector: Injector
    private rdpService: RDPService
    usingExternalClient = false // Track if using xfreerdp (external)

    constructor (injector: Injector) {
        super(injector)
        this.injector = injector
        this.platform = injector.get(PlatformService)
        this.hostApp = injector.get(HostAppService)
        this.translate = injector.get(TranslateService)
        this.notifications = injector.get(NotificationsService)
        this.rdpService = injector.get(RDPService)
    }

    ngAfterViewInit (): void {
        if (!this.profile) {
            this.connectionError = 'No RDP profile provided'
            return
        }

        // Defer title setting to avoid change detection errors
        setTimeout(() => {
            this.setTitle(`RDP: ${this.profile.options.user}@${this.profile.options.host}`)
        }, 0)

        if (this.canvas?.nativeElement) {
            this.ctx = this.canvas.nativeElement.getContext('2d')
            this.resizeCanvas()
        }

        // Defer connect call to avoid change detection errors
        setTimeout(() => {
            void this.connect()
        }, 0)
    }

    ngOnDestroy (): void {
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

        // Fill with black background
        this.ctx.fillStyle = '#000000'
        this.ctx.fillRect(0, 0, width, height)

        // Display "Connecting..." message
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
            // xfreerdp expects hex window id (e.g., 0x123456)
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

    private summarizeExternalError (message: string): string {
        const lines = (message || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        if (!lines.length) {
            return message
        }

        // Common FreeRDP signals
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
                'allow network clients in XQuartz Security prefs, then in a terminal run: export DISPLAY=:0 && /opt/X11/bin/xhost +localhost before launching Tlink. ' +
                'If XQuartz fails to start or /opt/X11/bin is missing, reinstall from the official .dmg and reboot/log out.'
            )
        }

        // Build a minimal user-friendly message
        const firstLine = lines[0]
        const hintText = hints.join(' ')
        return [firstLine, hintText].filter(Boolean).join('\n')
    }

    copyError (): void {
        if (!this.connectionError) {
            return
        }
        try {
            navigator.clipboard?.writeText(this.connectionError)
            this.notifications.info(this.translate.instant('Copied error message'))
        } catch {
            // Fallback for older environments
            const textarea = document.createElement('textarea')
            textarea.value = this.connectionError
            document.body.appendChild(textarea)
            textarea.select()
            try { document.execCommand('copy') } catch { /* ignore */ }
            document.body.removeChild(textarea)
            this.notifications.info(this.translate.instant('Copied error message'))
        }
    }

    async connect (): Promise<void> {
        if (this.connected || this.connecting) {
            return
        }

        // Check which client to use
        const clientType = this.profile.options.clientType ?? 'node-rdpjs'

        if (clientType === 'xfreerdp') {
            // Use FreeRDP (external client)
            this.connecting = true
            this.connectionError = null
            this.usingExternalClient = true

            try {
                const parentWindow = this.getNativeWindowHandleHex()
                await this.rdpService.launchFreeRDP(this.profile, parentWindow)
                this.connected = true
                if (parentWindow && this.hostApp.platform !== Platform.macOS) {
                    this.notifications.info(this.translate.instant('FreeRDP launched in embedded window'))
                } else {
                    this.notifications.info(this.translate.instant('FreeRDP launched in external window'))
                }
            } catch (error: any) {
                const rawMessage = error?.message ?? 'Failed to launch FreeRDP'
                this.connectionError = this.summarizeExternalError(rawMessage)
                this.notifications.error(this.connectionError || 'Failed to launch FreeRDP')
                this.connected = false
                // Keep focus on this tab to let the user see the error
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
            // Create RDP session
            this.rdpSession = new RDPSession(this.injector, this.profile)

            // Subscribe to bitmap updates
            this.rdpSession.bitmap$.subscribe(bitmap => {
                this.handleBitmapUpdate(bitmap)
            })

                   // Subscribe to errors
                   this.rdpSession.error$.subscribe(error => {
                       let errorMessage = error.message || error.toString()
                       const errorCode = (error as any).code
                       
                       // Provide helpful error messages for common protocol errors
                       if (errorCode === 'NODE_RDP_PROTOCOL_X224_NEG_FAILURE' || errorMessage.includes('X224_NEG_FAILURE')) {
                           errorMessage = 'RDP protocol negotiation failed. The server requires NLA/TLS authentication, which is not supported by the embedded client (node-rdpjs). ' +
                               'To connect to this server, please change the "Client Type" setting to "FreeRDP" in the profile settings, or configure the RDP server to allow SSL-only connections (not recommended for security).'
                       } else if (errorCode === 'NODE_RDP_PROTOCOL_X224_NLA_NOT_SUPPORTED' || errorMessage.includes('NLA_NOT_SUPPORTED')) {
                           errorMessage = 'The server requires NLA (Network Level Authentication), which is not supported by the embedded client (node-rdpjs). ' +
                               'To connect to this server, please change the "Client Type" setting to "FreeRDP" in the profile settings, or configure the RDP server to allow SSL-only connections (not recommended for security).'
                       }
                       
                       this.connectionError = errorMessage
                       this.notifications.error(errorMessage)
                       this.connected = false
                   })

            // Subscribe to session destruction
            this.rdpSession.willDestroy$.subscribe(() => {
                this.connected = false
            })

            // Start the RDP connection
            await this.rdpSession.start()

            // Wait a bit for connection to establish
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'))
                }, 30000)

                const checkConnection = () => {
                    if (this.rdpSession?.open) {
                        clearTimeout(timeout)
                        this.connected = true
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
            this.connectionError = error?.message ?? 'Failed to connect'
            this.notifications.error(this.connectionError || 'Failed to connect')
            if (this.rdpSession) {
                this.rdpSession.destroy()
                this.rdpSession = null
            }
        } finally {
            this.connecting = false
        }
    }

    private handleBitmapUpdate (bitmap: any): void {
        if (!this.ctx || !this.canvas?.nativeElement) {
            return
        }

        try {
            const { x, y, width, height, bitsPerPixel, buffer } = bitmap

            // Create ImageData from bitmap buffer
            if (bitsPerPixel === 32) {
                // RGBA format
                if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
                    this.imageData = this.ctx.createImageData(width, height)
                }
                const data = new Uint8ClampedArray(buffer)
                this.imageData.data.set(data)
                this.ctx.putImageData(this.imageData, x, y)
            } else if (bitsPerPixel === 24) {
                // RGB format - convert to RGBA
                if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
                    this.imageData = this.ctx.createImageData(width, height)
                }
                const rgbData = new Uint8Array(buffer)
                const rgbaData = this.imageData.data
                for (let i = 0; i < rgbData.length; i += 3) {
                    const rgbaIndex = (i / 3) * 4
                    rgbaData[rgbaIndex] = rgbData[i] // R
                    rgbaData[rgbaIndex + 1] = rgbData[i + 1] // G
                    rgbaData[rgbaIndex + 2] = rgbData[i + 2] // B
                    rgbaData[rgbaIndex + 3] = 255 // A
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
        // Convert key event to scancode (simplified - would need proper keycode mapping)
        const scancode = this.getScancodeFromKeyEvent(event)
        if (scancode) {
            this.rdpSession.sendKeyEvent(scancode, true)
        }
    }

    @HostListener('keyup', ['$event'])
    onKeyUp (event: KeyboardEvent): void {
        if (!this.connected || !this.rdpSession) {
            return
        }
        const scancode = this.getScancodeFromKeyEvent(event)
        if (scancode) {
            this.rdpSession.sendKeyEvent(scancode, false)
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
        const button = event.button === 0 ? 1 : event.button === 2 ? 2 : 0 // Left=1, Right=2
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
        this.rdpSession.sendPointerEvent(x, y, 0, false) // Move event
    }

    private getScancodeFromKeyEvent (event: KeyboardEvent): number | null {
        // Simplified scancode mapping - would need complete mapping for production
        // This is a basic implementation
        const keyMap: Record<string, number> = {
            'Enter': 0x1C,
            'Escape': 0x01,
            'Backspace': 0x0E,
            'Tab': 0x0F,
            'Space': 0x39,
        }
        return keyMap[event.key] ?? event.keyCode ?? null
    }

    disconnect (): void {
        if (this.rdpSession) {
            this.rdpSession.destroy()
            this.rdpSession = null
        }
        this.connected = false
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
