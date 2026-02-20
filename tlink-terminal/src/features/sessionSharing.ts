import { Injectable } from '@angular/core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import { TerminalDecorator } from '../api/decorator'
import { LogService, Logger } from 'tlink-core'
import { SessionSharingService } from 'tlink-core'

/**
 * Decorator that enables real-time terminal session sharing
 */
@Injectable()
export class SessionSharingDecorator extends TerminalDecorator {
    private logger: Logger
    private sharedTerminals = new Map<BaseTerminalTabComponent<any>, string>() // Maps terminal to session ID

    constructor (
        log: LogService,
        private sessionSharing: SessionSharingService,
    ) {
        super()
        this.logger = log.create('sessionSharing')
    }

    attach (terminal: BaseTerminalTabComponent<any>): void {
        this.subscribeUntilDetached(terminal, this.sessionSharing.sharingStateChanged$.subscribe(change => {
            if (change.terminal !== terminal) {
                return
            }
            if (change.shared) {
                this.attachToSharedSession(terminal)
            } else {
                this.detachFromSharedSession(terminal)
            }
        }))

        // Check if terminal is already shared
        if (this.sessionSharing.isSessionShared(terminal)) {
            this.attachToSharedSession(terminal)
        }
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        this.detachFromSharedSession(terminal)
        super.detach(terminal)
    }

    private attachToSharedSession (terminal: BaseTerminalTabComponent<any>): void {
        const sharedSession = this.sessionSharing.getSharedSession(terminal)
        if (!sharedSession || !terminal.session) {
            return
        }

        if (this.sharedTerminals.has(terminal)) {
            return // Already attached
        }

        this.sharedTerminals.set(terminal, sharedSession.id)

        // Subscribe to terminal output and broadcast it
        this.subscribeUntilDetached(terminal, terminal.session.binaryOutput$.subscribe(data => {
            this.sessionSharing.broadcastOutput(sharedSession.id, data)
        }))

        // Subscribe to session close/destroy to stop sharing
        this.subscribeUntilDetached(terminal, terminal.session.closed$.subscribe(() => {
            void this.sessionSharing.stopSharing(terminal)
        }))

        this.subscribeUntilDetached(terminal, terminal.session.destroyed$.subscribe(() => {
            void this.sessionSharing.stopSharing(terminal)
        }))

        this.logger.info('Session sharing attached to terminal:', sharedSession.id)
    }

    private detachFromSharedSession (terminal: BaseTerminalTabComponent<any>): void {
        if (!this.sharedTerminals.has(terminal)) {
            return
        }

        const sessionId = this.sharedTerminals.get(terminal)!
        this.sharedTerminals.delete(terminal)

        this.logger.info('Session sharing detached from terminal:', sessionId)
    }
}
