import { Inject, Injectable, Optional } from '@angular/core'
import { ConfigService, BaseTabComponent, TabContextMenuItemProvider, MenuItemOptions, ProfilesService, TranslateService, SelectorService } from 'tlink-core'
import { TerminalTabComponent } from './components/terminalTab.component'
import { TerminalService } from './services/terminal.service'
import { LocalProfile, UACService } from './api'

/** @hidden */
@Injectable()
export class NewTabContextMenu extends TabContextMenuItemProvider {
    weight = 10

    constructor (
        public config: ConfigService,
        private profilesService: ProfilesService,
        private terminalService: TerminalService,
        private selector: SelectorService,
        @Optional() @Inject(UACService) private uac: UACService|undefined,
        private translate: TranslateService,
    ) {
        super()
    }

    async getItems (tab: BaseTabComponent, tabHeader?: boolean): Promise<MenuItemOptions[]> {
        const allLocal = (await this.profilesService.getProfiles({ includeBuiltin: true }))
            .filter(x => (x.type === 'local' || x.type === 'chatgpt') && (!x.isBuiltin || x.type === 'chatgpt')) as LocalProfile[]
        const activeId = tab instanceof TerminalTabComponent ? (tab.profile as any)?.id ?? null : null
        const profiles = allLocal.filter(p => !p.isBuiltin || (activeId && (p as any).id === activeId))

        const items: MenuItemOptions[] = [
            {
                label: this.translate.instant('New terminal'),
                click: () => {
                    if (tab instanceof TerminalTabComponent) {
                        this.profilesService.openNewTabForProfile(tab.profile)
                    } else {
                        this.terminalService.openTab()
                    }
                },
            },
            {
                label: this.translate.instant('New with profile'),
                click: () => {
                    void this.openProfileSelector(tab, profiles)
                },
            },
        ]

        if (this.uac?.isAvailable) {
            items.push({
                label: this.translate.instant('New admin tab'),
                submenu: profiles.map(profile => ({
                    label: profile.name,
                    click: () => {
                        this.profilesService.openNewTabForProfile({
                            ...profile,
                            options: {
                                ...profile.options,
                                runAsAdministrator: true,
                            },
                        })
                    },
                })),
            })
        }

        if (tab instanceof TerminalTabComponent && tabHeader && this.uac?.isAvailable) {
            const terminalTab = tab
            items.push({
                label: this.translate.instant('Duplicate as administrator'),
                click: () => {
                    this.profilesService.openNewTabForProfile({
                        ...terminalTab.profile,
                        options: {
                            ...terminalTab.profile.options,
                            runAsAdministrator: true,
                        },
                    })
                },
            })
        }

        return items
    }

    private async openProfileSelector (tab: BaseTabComponent, profiles: LocalProfile[]): Promise<void> {
        if (this.selector.active) {
            return
        }
        if (!profiles.length) {
            return
        }
        let workingDirectory: string|undefined
        if (tab instanceof TerminalTabComponent) {
            workingDirectory = await tab.session?.getWorkingDirectory() ?? undefined
        }
        const activeId = tab instanceof TerminalTabComponent ? (tab.profile as any)?.id ?? null : null
        const options = profiles.map(p => {
            const { result, ...opt } = this.profilesService.selectorOptionForProfile(p)
            return {
                ...opt,
                result: undefined,
                weight: (activeId && (p as any).id === activeId) ? -1000 : 0,
                callback: () => {
                    void this.terminalService.openTab(p, workingDirectory)
                },
            }
        })
        await this.selector.show<void>(this.translate.instant('New with profile'), options).catch(() => null)
    }
}
