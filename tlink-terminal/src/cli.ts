import shellQuote from 'shell-quote'
import { Injectable } from '@angular/core'
import { CLIHandler as CoreCLIHandler, CLIEvent, AppService, HostWindowService } from 'tlink-core'
import { BaseTerminalTabComponent } from './api/baseTerminalTab.component'

// Fallback base class to avoid runtime crashes if the core export is undefined
const CLIHandlerRuntime = (CoreCLIHandler ?? class {}) as typeof CoreCLIHandler

@Injectable()
export class TerminalCLIHandler extends CLIHandlerRuntime {
    firstMatchOnly = true
    priority = 0

    constructor (
        private app: AppService,
        private hostWindow: HostWindowService,
    ) {
        super()
    }

    async handle (event: CLIEvent): Promise<boolean> {
        const op = event.argv._[0]

        if (op === 'paste') {
            let text = event.argv.text
            if (event.argv.escape) {
                text = shellQuote.quote([text])
            }
            this.handlePaste(text)
            return true
        }

        return false
    }

    private handlePaste (text: string) {
        if (this.app.activeTab instanceof BaseTerminalTabComponent && this.app.activeTab.session) {
            this.app.activeTab.sendInput(text)
            this.hostWindow.bringToFront()
        }
    }
}
