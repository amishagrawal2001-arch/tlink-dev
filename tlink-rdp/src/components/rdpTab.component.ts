import { Component, Injector, OnDestroy, ViewChild, ElementRef, HostBinding, AfterViewInit } from '@angular/core'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { BaseTabComponent, PlatformService, TranslateService, NotificationsService, GetRecoveryTokenOptions, RecoveryToken } from 'tlink-core'
import { Platform } from 'tlink-core'
import { RDPProfile } from '../api'

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

    protected platform: PlatformService
    protected translate: TranslateService
    protected notifications: NotificationsService

    constructor (injector: Injector) {
        super(injector)
        this.platform = injector.get(PlatformService)
        this.translate = injector.get(TranslateService)
        this.notifications = injector.get(NotificationsService)
    }

    ngAfterViewInit (): void {
        if (!this.profile) {
            this.connectionError = 'No RDP profile provided'
            return
        }

        this.setTitle(`RDP: ${this.profile.options.user}@${this.profile.options.host}`)

        if (this.canvas?.nativeElement) {
            this.ctx = this.canvas.nativeElement.getContext('2d')
            this.resizeCanvas()
        }

        // TODO: Initialize RDP connection
        // This will require an RDP client library (e.g., node-rdpjs or FreeRDP bindings)
        void this.connect()
    }

    ngOnDestroy (): void {
        this.disconnect()
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

    async connect (): Promise<void> {
        if (this.connected || this.connecting) {
            return
        }

        this.connecting = true
        this.connectionError = null

        try {
            // TODO: Implement actual RDP connection
            // This requires an RDP client library
            // Example libraries:
            // - node-rdpjs (pure JS, limited features)
            // - FreeRDP with Node.js bindings (full features, requires native compilation)
            
            // Placeholder for now
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // Simulate connection failure for now
            throw new Error('RDP connection not yet implemented. This requires an RDP client library.')
        } catch (error) {
            this.connectionError = error?.message ?? 'Failed to connect'
            this.notifications.error(this.connectionError)
        } finally {
            this.connecting = false
        }
    }

    disconnect (): void {
        // TODO: Disconnect RDP connection
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

