/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, HostListener, Input } from '@angular/core'
import { AppService, SplitTabComponent, ProfilesService, SelectorService, TabsService } from 'tlink-core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'

/** @hidden */
@Component({
    selector: 'terminal-toolbar',
    templateUrl: './terminalToolbar.component.pug',
    styleUrls: ['./terminalToolbar.component.scss'],
})
export class TerminalToolbarComponent {
    @Input() tab: BaseTerminalTabComponent<any>

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor (
        private app: AppService,
        private profiles: ProfilesService,
        private selector: SelectorService,
        private tabs: TabsService,
    ) { }

    onTabDragStart (): void {
        this.app.emitTabDragStarted(this.tab)
    }

    onTabDragEnd (): void {
        setTimeout(() => {
            this.app.emitTabDragEnded()
            this.app.emitTabsChanged()
        })
    }

    get shouldShowDragHandle (): boolean {
        return this.tab.topmostParent instanceof SplitTabComponent && this.tab.topmostParent.getAllTabs().length > 1
    }

    @HostListener('mouseenter') onMouseEnter () {
        this.tab.showToolbar()
    }

    @HostListener('mouseleave') onMouseLeave () {
        this.tab.hideToolbar()
    }

    async newWithProfile (): Promise<void> {
        if (this.selector.active) {
            return
        }
        const allProfiles = await this.profiles.getProfiles({ includeBuiltin: true })
        const filtered = allProfiles.filter(p => !p.isBuiltin || p.type === 'chatgpt')
        if (!filtered.length) {
            return
        }

        const options = filtered.map(p => {
            const { result, ...opt } = this.profiles.selectorOptionForProfile(p)
            return {
                ...opt,
                result: undefined,
                callback: async () => {
                    const params = await this.profiles.newTabParametersForProfile(p)
                    if (!params) {
                        return
                    }
                    const newTab = this.tabs.create(params)
                    if (this.tab.topmostParent instanceof SplitTabComponent) {
                        await this.tab.topmostParent.addTab(newTab, this.tab, 'r')
                    } else {
                        await this.app.openNewTab(params)
                    }
                },
            }
        })

        await this.selector.show<void>('New with profile', options).catch(() => null)
    }
}
