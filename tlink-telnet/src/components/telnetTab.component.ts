import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Platform } from 'tlink-core'
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tlink-terminal'
import { NetworkSnippet, NetworkSnippetsModalComponent, HelpModalComponent } from 'tlink-ssh'
import { TELNET_HELP_CONTENT } from './telnetHelp.content'
import { TelnetProfile, TelnetSession } from '../session'


/** @hidden */
@Component({
    selector: 'telnet-tab',
    template: `${BaseTerminalTabComponent.template} ${require('./telnetTab.component.pug')}`,
    styleUrls: ['./telnetTab.component.scss', ...BaseTerminalTabComponent.styles],
    animations: BaseTerminalTabComponent.animations,
})
export class TelnetTabComponent extends ConnectableTerminalTabComponent<TelnetProfile> {
    Platform = Platform
    session: TelnetSession|null = null

    constructor (
        injector: Injector,
        private ngbModal: NgbModal,
    ) {
        super(injector)
        this.enableToolbar = true
    }

    ngOnInit (): void {
        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (!this.hasFocus) {return}
            if (hotkey === 'restart-telnet-session') {
                this.reconnect()
            } else if (hotkey === 'telnet-snippets') {
                this.showSnippetPicker()
            } else if (hotkey === 'telnet-help') {
                this.openHelp()
            }
        })

        super.ngOnInit()
    }

    /**
     * Open the network-vendor snippet picker for the active session.
     *
     * Reuses the SSH plugin's modal + service via re-exports — same
     * platform list (JUNOS, IOS-XR/XE, NX-OS, EOS, MikroTik, …) and
     * same curated snippet packs. Telnet to console servers / network
     * gear is one of the original justifications for vendor-aware
     * snippets, so this keeps parity with the SSH side.
     *
     * Like the SSH picker, the chosen template is staged at the prompt
     * without auto-running — surprise-execute on a router would be
     * hostile.
     */
    showSnippetPicker (): void {
        if (!this.session?.open) {
            return
        }
        const ref = this.ngbModal.open(NetworkSnippetsModalComponent, { size: 'lg' })
        const modal = ref.componentInstance as NetworkSnippetsModalComponent
        modal.sessionId = this.session.platformSessionId
        ref.result.then(
            (result: { snippet: NetworkSnippet } | null) => {
                if (!result?.snippet || !this.session?.open) {
                    return
                }
                this.session.write(Buffer.from(result.snippet.template))
                this.frontend?.focus()
            },
            () => { /* dismissed — no-op */ },
        )
    }

    /** Open the Telnet help dialog. Reuses the generic modal exported
     *  from tlink-ssh; content lives in telnetHelp.content.ts. */
    openHelp (): void {
        const ref = this.ngbModal.open(HelpModalComponent, { size: 'lg', scrollable: true })
        const modal = ref.componentInstance as HelpModalComponent
        modal.content = TELNET_HELP_CONTENT
    }

    protected onSessionDestroyed (): void {
        if (this.frontend) {
            // Session was closed abruptly
            this.write('\r\n' + colors.black.bgWhite(' TELNET ') + ` ${this.session?.profile.options.host}: session closed\r\n`)

            super.onSessionDestroyed()
        }
    }

    async initializeSession (): Promise<void> {
        await super.initializeSession()

        const session = new TelnetSession(this.injector, this.profile)
        this.setSession(session)

        try {
            this.startSpinner(this.translate.instant(_('Connecting')))

            this.attachSessionHandler(session.serviceMessage$, msg => {
                this.write(`\r${colors.black.bgWhite(' Telnet ')} ${msg}\r\n`)
                session.resize(this.size.columns, this.size.rows)
            })

            try {
                await session.start()
                this.stopSpinner()
            } catch (e) {
                this.stopSpinner()
                this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
                return
            }
        } catch (e) {
            this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
        }
    }

    async canClose (): Promise<boolean> {
        if (!this.session?.open) {
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

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.endsWith('close\r') ||
        this.recentInputs.endsWith('quit\r')
    }

}
