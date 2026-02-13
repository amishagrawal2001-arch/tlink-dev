/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, HostListener, Input } from '@angular/core'
import { AppService, SplitTabComponent, ProfilesService, SelectorService, TabsService, SelectorOption, PartialProfile, Profile } from 'tlink-core'
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

        const openProfile = async (profile: PartialProfile<Profile>): Promise<void> => {
            const params = await this.profiles.newTabParametersForProfile(profile)
            if (!params) {
                return
            }
            const newTab = this.tabs.create(params)
            if (this.tab.topmostParent instanceof SplitTabComponent) {
                await this.tab.topmostParent.addTab(newTab, this.tab, 'r')
            } else {
                await this.app.openNewTab(params)
            }
        }

        const options: SelectorOption<void>[] = filtered.map(p => {
            const { result, ...opt } = this.profiles.selectorOptionForProfile(p)
            return {
                ...opt,
                result: undefined,
                callback: async () => openProfile(p),
            }
        })

        // Add quick connect options for each protocol provider
        this.profiles.getProviders().forEach(provider => {
            const quickConnectProvider = provider as any
            if (typeof quickConnectProvider.quickConnect === 'function') {
                options.push({
                    name: 'Quick connect',
                    freeInputPattern: `Connect to "%s"... (${provider.name.toUpperCase()})`,
                    icon: 'fas fa-arrow-right',
                    description: `(${provider.name.toUpperCase()})`,
                    weight: 100,
                    callback: async (query?: string) => {
                        if (!query) {
                            return
                        }
                        const profile = quickConnectProvider.quickConnect(query)
                        if (profile) {
                            await openProfile(profile)
                        }
                    },
                })
            }
        })

        await this.selector.show<void>('New with profile', options).catch(() => null)
    }
}
