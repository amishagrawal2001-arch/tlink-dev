/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Platform, SelectorService } from 'tlink-core'
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tlink-terminal'
import { NetworkSnippet, NetworkSnippetsModalComponent, HelpModalComponent } from 'tlink-ssh'
import { SERIAL_HELP_CONTENT } from './serialHelp.content'
import { SerialSession, BAUD_RATES, SerialProfile } from '../api'

/** @hidden */
@Component({
    selector: 'serial-tab',
    template: `${BaseTerminalTabComponent.template} ${require('./serialTab.component.pug')}`,
    styleUrls: ['./serialTab.component.scss', ...BaseTerminalTabComponent.styles],
    animations: BaseTerminalTabComponent.animations,
})
export class SerialTabComponent extends ConnectableTerminalTabComponent<SerialProfile> {
    session: SerialSession|null = null
    Platform = Platform

    constructor (
        injector: Injector,
        private selector: SelectorService,
        private ngbModal: NgbModal,
    ) {
        super(injector)
        this.enableToolbar = true
    }

    ngOnInit () {
        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (!this.hasFocus) {
                return
            }
            switch (hotkey) {
                case 'home':
                    this.sendInput('\x1b[H' )
                    break
                case 'end':
                    this.sendInput('\x1b[F' )
                    break
                case 'restart-serial-session':
                    this.reconnect()
                    break
                case 'serial-snippets':
                    this.showSnippetPicker()
                    break
                case 'serial-help':
                    this.openHelp()
                    break
            }
        })

        super.ngOnInit()

        setImmediate(() => {
            this.setTitle(this.profile.name)
        })
    }

    /**
     * Open the network-vendor snippet picker. Reuses the SSH plugin's
     * modal + service via re-exports — same vendor list and curated
     * commands. Console-port serial connections to network gear are
     * one of the original justifications for vendor-aware snippets,
     * so this keeps parity with the SSH + Telnet pickers.
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
            () => { /* dismissed */ },
        )
    }

    /** Open the Serial help dialog. Reuses the generic modal exported
     *  from tlink-ssh; content lives in serialHelp.content.ts. */
    openHelp () {
        const ref = this.ngbModal.open(HelpModalComponent, { size: 'lg', scrollable: true })
        const modal = ref.componentInstance as HelpModalComponent
        modal.content = SERIAL_HELP_CONTENT
    }

    async initializeSession () {
        super.initializeSession()

        const session = new SerialSession(this.injector, this.profile)
        this.setSession(session)

        this.startSpinner(this.translate.instant(_('Connecting')))

        try {
            await this.session!.start()
            this.stopSpinner()
            session.emitServiceMessage(this.translate.instant(_('Port opened')))
        } catch (e) {
            this.stopSpinner()
            this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
            return
        }
        this.session!.resize(this.size.columns, this.size.rows)
    }

    protected attachSessionHandlers () {
        this.attachSessionHandler(this.session!.serviceMessage$, msg => {
            this.write(`\r\n${colors.black.bgWhite(' Serial ')} ${msg}\r\n`)
            this.session?.resize(this.size.columns, this.size.rows)
        })
        super.attachSessionHandlers()
    }

    protected onSessionDestroyed (): void {
        if (this.frontend) {
            // Session was closed abruptly
            this.write('\r\n' + colors.black.bgWhite(' SERIAL ') + ` session closed\r\n`)

            super.onSessionDestroyed()
        }
    }

    async changeBaudRate () {
        const rate = await this.selector.show(
            this.translate.instant(_('Baud rate')),
            BAUD_RATES.map(x => ({
                name: x.toString(), result: x,
            })),
        )
        this.session?.serial?.update({ baudRate: rate })
        this.profile.options.baudrate = rate
    }

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.endsWith('close\r') ||
        this.recentInputs.endsWith('quit\r')
    }
}
