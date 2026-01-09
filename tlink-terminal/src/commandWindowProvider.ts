import { Injectable } from '@angular/core'
import { AppService, BaseTabComponent as CoreBaseTabComponent, BottomPanelRegistration, BottomPanelService, CommandProvider as CoreCommandProvider, ConfigService, HostAppService, SplitTabComponent } from 'tlink-core'
import type { Command } from 'tlink-core'

import { CommandWindowTabComponent } from './components/commandWindowTab.component'

// Fallback base classes to avoid runtime crashes if core exports are undefined
const CommandProviderRuntime = (CoreCommandProvider ?? class {}) as typeof CoreCommandProvider
type BaseTabComponent = CoreBaseTabComponent

const COMMAND_WINDOW_BOTTOM_PANEL: BottomPanelRegistration = {
    id: 'command-window',
    component: CommandWindowTabComponent,
    label: 'Command Window',
    height: 200,
    inputs: { inBottomPanel: true },
}

@Injectable()
export class CommandWindowCommandProvider extends CommandProviderRuntime {
    private commandWindowTab: CommandWindowTabComponent | null = null
    private bottomVisible = false

    constructor (
        private app: AppService,
        private bottomPanel: BottomPanelService,
        private config: ConfigService,
        hostApp: HostAppService,
    ) {
        super()
        this.bottomPanel.register(COMMAND_WINDOW_BOTTOM_PANEL)
        hostApp.commandWindowRequest$.subscribe(() => {
            this.openCommandWindow()
        })
        hostApp.commandWindowBottomRequest$.subscribe(() => {
            this.openCommandWindowBottom()
        })

        this.config.ready$.toPromise().then(() => {
            this.bottomPanel.state$.subscribe(state => {
                const visible = state.visible && state.id === COMMAND_WINDOW_BOTTOM_PANEL.id
                if (visible === this.bottomVisible) {
                    return
                }
                this.bottomVisible = visible
                this.config.store.terminal.commandWindowBottomVisible = visible
                this.config.save()
            })
            if (this.config.store.terminal.commandWindowBottomVisible) {
                this.openCommandWindowBottom()
            }
        })
    }

    async provide (): Promise<Command[]> {
        return []
    }

    private openCommandWindow (): void {
        const existing = this.getCommandWindowTab()
        if (existing) {
            const parent = this.app.getParentTab(existing)
            if (parent) {
                parent.focus(existing)
                this.app.selectTab(parent)
            } else if (this.app.tabs.includes(existing)) {
                this.app.selectTab(existing)
            } else {
                this.app.addTabRaw(existing)
            }
            return
        }

        const created = this.app.openNewTabRaw({ type: CommandWindowTabComponent })
        this.trackCommandWindowTab(created)
    }

    private openCommandWindowBottom (): void {
        this.bottomPanel.show(COMMAND_WINDOW_BOTTOM_PANEL)
    }

    private getCommandWindowTab (): CommandWindowTabComponent | null {
        if (this.commandWindowTab && !this.isTabDestroyed(this.commandWindowTab)) {
            return this.commandWindowTab
        }
        this.commandWindowTab = null
        const existing = this.findCommandWindowTab()
        return existing ? this.trackCommandWindowTab(existing) : null
    }

    private findCommandWindowTab (): CommandWindowTabComponent | null {
        for (const tab of this.app.tabs) {
            if (this.isCommandWindowTab(tab)) {
                return tab
            }
            if (tab instanceof SplitTabComponent) {
                const nested = tab.getAllTabs().find(t => this.isCommandWindowTab(t)) as CommandWindowTabComponent | undefined
                if (nested) {
                    return nested
                }
            }
        }
        return null
    }

    private isCommandWindowTab (tab: BaseTabComponent): tab is CommandWindowTabComponent {
        if (!(tab instanceof CommandWindowTabComponent)) {
            return false
        }
        return !this.isTabDestroyed(tab)
    }

    private trackCommandWindowTab (tab: CommandWindowTabComponent): CommandWindowTabComponent {
        if (this.commandWindowTab === tab) {
            return tab
        }
        this.commandWindowTab = tab
        tab.destroyed$.subscribe(() => {
            if (this.commandWindowTab === tab) {
                this.commandWindowTab = null
            }
        })
        return tab
    }

    private isTabDestroyed (tab: CommandWindowTabComponent): boolean {
        const hostView = tab.hostView as { destroyed?: boolean } | undefined
        return Boolean(hostView?.destroyed)
    }
}
