import { Injectable } from '@angular/core'
import { CommandProvider as CoreCommandProvider, ConfigService, HostAppService } from 'tlink-core'
import type { Command } from 'tlink-core'

// Fallback base class to avoid runtime crashes if the core export is undefined
const CommandProviderRuntime = (CoreCommandProvider ?? class {}) as typeof CoreCommandProvider

@Injectable()
export class ButtonBarCommandProvider extends CommandProviderRuntime {
    constructor (
        private config: ConfigService,
        hostApp: HostAppService,
    ) {
        super()
        hostApp.buttonBarToggleRequest$.subscribe(() => this.toggleButtonBar())
    }

    async provide (): Promise<Command[]> {
        return []
    }

    private toggleButtonBar (): void {
        const bar = this.config.store.terminal.buttonBar
        bar.enabled = !bar.enabled
        this.config.save()
    }
}
