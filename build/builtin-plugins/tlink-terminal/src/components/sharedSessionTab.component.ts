import { Component, Injector, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { ParsedShareSessionLink, PromptModalComponent, SessionSharingService } from 'tlink-core'
import { first } from 'rxjs'
import { BaseTerminalProfile } from '../api/interfaces'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import { SharedSessionJoinError, SharedSessionViewerSession } from '../sharedSessionViewer.session'

interface SharedSessionTabProfile extends BaseTerminalProfile {
    options: {
        shareUrl?: string
        sessionId?: string
        wsUrl?: string
    }
}

@Component({
    selector: 'shared-session-tab',
    template: BaseTerminalTabComponent.template,
    styles: BaseTerminalTabComponent.styles,
    animations: BaseTerminalTabComponent.animations,
})
export class SharedSessionTabComponent extends BaseTerminalTabComponent<SharedSessionTabProfile> {
    @Input() shareUrl = ''
    @Input() parsedLink: ParsedShareSessionLink | null = null

    session: SharedSessionViewerSession | null = null

    private connecting = false
    private passwordPromptCancelled = false
    private reconnecting = false
    private tabDestroyed = false

    constructor (
        injector: Injector,
        private ngbModal: NgbModal,
        private sessionSharing: SessionSharingService,
    ) {
        super(injector)
    }

    ngOnInit (): void {
        this.logger = this.log.create('sharedSessionTab')
        this.disableDynamicTitle = true
        this.icon = 'fas fa-share-nodes'
        this.profile = this.buildProfile()
        this.setTitle('Shared session')
        super.ngOnInit()
    }

    protected onFrontendReady (): void {
        if (!this.session && !this.connecting) {
            void this.connect()
        }
        super.onFrontendReady()
    }

    async reconnectSharedSession (): Promise<void> {
        if (this.connecting || this.reconnecting || this.tabDestroyed) {
            return
        }
        this.reconnecting = true

        try {
            this.passwordPromptCancelled = false
            await this.write('\r\n[Info] Reconnecting shared session...\r\n')

            const currentSession = this.session
            if (currentSession) {
                this.setSession(null)
                this.session = null
                await currentSession.destroy()
            }

            await this.connect()
        } finally {
            this.reconnecting = false
        }
    }

    ngOnDestroy (): void {
        this.tabDestroyed = true
        super.ngOnDestroy()
        void this.session?.destroy()
    }

    private buildProfile (): SharedSessionTabProfile {
        return {
            id: `shared-session:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
            type: 'shared-session',
            name: 'Shared session',
            options: {
                shareUrl: this.shareUrl,
            },
            disableDynamicTitle: true,
            behaviorOnSessionEnd: 'keep',
            weight: 0,
            isBuiltin: false,
            isTemplate: false,
        }
    }

    private resolveParsedLink (): ParsedShareSessionLink | null {
        if (this.parsedLink) {
            return this.parsedLink
        }
        if (!this.shareUrl) {
            return null
        }
        this.parsedLink = this.sessionSharing.parseShareUrl(this.shareUrl)
        return this.parsedLink
    }

    private async connect (password?: string): Promise<void> {
        const link = this.resolveParsedLink()
        if (!link) {
            this.notifications.error('Invalid shared session link')
            await this.write('\r\n[Error] Invalid shared session link.\r\n')
            return
        }
        if (this.connecting) {
            return
        }

        this.connecting = true
        this.startSpinner('Connecting to shared session...')

        this.profile.options.shareUrl = this.shareUrl || link.shareUrl
        this.profile.options.sessionId = link.sessionId
        this.profile.options.wsUrl = link.wsUrl

        const session = new SharedSessionViewerSession(this.injector, link)
        let shouldPromptPassword = false

        try {
            await session.start({ password })
            this.passwordPromptCancelled = false
            this.setSession(session)
            this.session = session
            session.closed$.pipe(first()).subscribe(() => {
                void this.handleSessionDisconnected(session)
            })

            const modeLabel = session.sharingMode === 'interactive' ? 'Interactive' : 'Read-only'
            this.setTitle(`Shared ${link.sessionId.slice(0, 8)} (${modeLabel})`)
            await this.write(`\r\n[Connected] ${modeLabel} mode\r\n`)
        } catch (error: any) {
            await session.destroy()

            if (error instanceof SharedSessionJoinError && error.code === 'INVALID_PASSWORD' && !this.passwordPromptCancelled) {
                shouldPromptPassword = true
            } else {
                const message = error?.message || 'Failed to join shared session'
                this.notifications.error(`Failed to join shared session: ${message}`)
                await this.write(`\r\n[Connection failed] ${message}\r\n`)

                if (error instanceof SharedSessionJoinError && error.code === 'INVALID_TOKEN' && link.tokenIsLegacyPrefix) {
                    await this.write('\r\n[Hint] This looks like a legacy share link. Ask the sharer for a new link.\r\n')
                }
            }
        } finally {
            this.stopSpinner()
            this.connecting = false
        }

        if (shouldPromptPassword) {
            await this.promptPasswordAndReconnect()
        }
    }

    private async promptPasswordAndReconnect (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent, {
            backdrop: 'static',
        })
        modal.componentInstance.prompt = 'Enter shared session password'
        modal.componentInstance.password = true
        modal.componentInstance.value = ''

        const result = await modal.result.catch(() => null)
        const password = result?.value ?? ''

        if (!password) {
            this.passwordPromptCancelled = true
            await this.write('\r\n[Info] Password prompt cancelled.\r\n')
            return
        }

        this.passwordPromptCancelled = false
        await this.connect(password)
    }

    private async handleSessionDisconnected (session: SharedSessionViewerSession): Promise<void> {
        if (this.tabDestroyed || this.reconnecting || this.connecting) {
            return
        }
        if (this.session !== session) {
            return
        }

        this.setSession(null)
        this.session = null
        await this.write('\r\n[Disconnected] Shared session disconnected. Right-click tab and select "Reconnect shared session".\r\n')
        this.notifications.notice('Shared session disconnected. Reconnect from tab menu or reopen the same share link.')
    }
}
