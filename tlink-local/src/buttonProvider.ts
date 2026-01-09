/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, TranslateService, ProfilesService, SelectorService, AppService } from 'tlink-core'
import { TerminalService } from './services/terminal.service'
import { LocalProfile } from './api'
import { TerminalTabComponent } from './components/terminalTab.component'

/** @hidden */
@Injectable()
export class ButtonProvider extends ToolbarButtonProvider {
    constructor (
        private terminal: TerminalService,
        private profiles: ProfilesService,
        private selector: SelectorService,
        private app: AppService,
        private translate: TranslateService,
    ) {
        super()
    }

    provide (): ToolbarButton[] {
        return [
            {
                icon: require('./icons/plus.svg'),
                title: this.translate.instant('New connection'),
                click: async () => {
                    if (this.selector.active) {
                        return
                    }
                    const active = this.app.activeTab instanceof TerminalTabComponent ? this.app.activeTab.profile : null
                    const activeId = (active as any)?.id ?? null
                    const profiles = (await this.profiles.getProfiles({ includeBuiltin: true }))
                        .filter(p => !p.isBuiltin || p.type === 'chatgpt')
                    if (!profiles.length) {
                        return
                    }
                    const options = profiles.map(p => {
                        const { result, ...opt } = this.profiles.selectorOptionForProfile(p)
                        return {
                            ...opt,
                            result: undefined,
                            // Keep active profile near top
                            weight: (activeId && (p as any).id === activeId) ? -1000 : 0,
                            callback: () => {
                                void this.profiles.openNewTabForProfile(p)
                            },
                        }
                    })
                    await this.selector.show<void>(this.translate.instant('New connection'), options).catch(() => null)
                },
            },
            {
                icon: require('./icons/shell.svg'),
                title: this.translate.instant('New terminal'),
                touchBarNSImage: 'NSTouchBarAddDetailTemplate',
                click: async () => {
                    // Keep this button as a quick built-in profile picker (OS shells, bundled fish, etc.)
                    // Custom/user profiles are available via the dedicated profiles button.
                    if (this.selector.active) {
                        return
                    }
                    const profiles = (await this.profiles.getProfiles({ includeBuiltin: true }))
                        .filter(x => x.type === 'local' && x.isBuiltin) as LocalProfile[]
                    if (!profiles.length) {
                        void this.terminal.openTab()
                        return
                    }
                    await this.selector.show<void>(this.translate.instant('New terminal'), profiles.map(p => ({
                        name: p.name,
                        icon: p.icon,
                        group: p.group,
                        description: p.options?.command,
                        callback: () => {
                            void this.terminal.openTab(p)
                        },
                    }))).catch(() => null)
                },
            },
        ]
    }
}
