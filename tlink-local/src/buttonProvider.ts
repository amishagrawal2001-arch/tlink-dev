/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Injectable } from '@angular/core'
import { ToolbarButtonProvider, ToolbarButton, TranslateService, ProfilesService, SelectorService } from 'tlink-core'
import { TerminalService } from './services/terminal.service'
// NB: TerminalTabComponent + AppService removed along with the
// active-profile weighting below — "New connection" is now a launcher,
// not a profile picker, so there's no "which tab is active" state to
// consult.
import { LocalProfile } from './api'

/** @hidden */
@Injectable()
export class ButtonProvider extends ToolbarButtonProvider {
    constructor (
        private terminal: TerminalService,
        private profiles: ProfilesService,
        private selector: SelectorService,
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
                    // "New connection" is a LAUNCHER, not a profile browser.
                    // Only show the small set of builtin "tool" profiles
                    // that function as entry points (AI Chat, API client).
                    // User-saved SSH / RDP / gNMI / etc. profiles already
                    // live in the profiles sidebar / Ctrl+P selector; piling
                    // them in here made the list unreadable once the user
                    // had more than a handful of saved profiles. The
                    // per-provider "Connect to…" (Quick Connect) entries
                    // appended below cover ad-hoc new sessions.
                    const LAUNCHER_PROFILE_TYPES = new Set(['chatgpt', 'api-client'])
                    const profiles = (await this.profiles.getProfiles({ includeBuiltin: true }))
                        .filter(p => p.isBuiltin && LAUNCHER_PROFILE_TYPES.has(p.type))
                    const options = profiles.map(p => {
                        const { result, ...opt } = this.profiles.selectorOptionForProfile(p)
                        return {
                            ...opt,
                            result: undefined,
                            weight: 0,
                            callback: () => {
                                void this.profiles.openNewTabForProfile(p)
                            },
                        }
                    })

                    // Add quick connect options for each protocol provider
                    this.profiles.getProviders().forEach(provider => {
                        const quickConnectProvider = provider as any
                        if (typeof quickConnectProvider.quickConnect === 'function') {
                            options.push({
                                name: this.translate.instant('Quick connect'),
                                freeInputPattern: `${this.translate.instant('Connect to "%s"...')} (${provider.name.toUpperCase()})`,
                                icon: 'fas fa-arrow-right',
                                description: `(${provider.name.toUpperCase()})`,
                                result: undefined,
                                weight: 100,
                                callback: async (query?: string) => {
                                    if (!query) {
                                        return
                                    }
                                    const profile = quickConnectProvider.quickConnect(query)
                                    if (profile) {
                                        await this.profiles.openNewTabForProfile(profile)
                                    }
                                },
                            })
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
