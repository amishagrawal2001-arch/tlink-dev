/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { ToolbarButtonProvider, ToolbarButton, TranslateService, ProfilesService, SelectorService, PartialProfile, Profile } from 'tlink-core'
import { TerminalService } from './services/terminal.service'
// NB: TerminalTabComponent + AppService removed along with the
// active-profile weighting below — "New connection" is now a launcher,
// not a profile picker, so there's no "which tab is active" state to
// consult.
import { LocalProfile } from './api'

/** @hidden */
@Injectable()
export class ButtonProvider extends ToolbarButtonProvider {
    // eslint-disable-next-line @typescript-eslint/max-params
    constructor (
        private terminal: TerminalService,
        private profiles: ProfilesService,
        private selector: SelectorService,
        private translate: TranslateService,
        private ngbModal: NgbModal,
    ) {
        super()
    }

    /**
     * Provider ids whose QuickConnect results are too under-specified
     * for a direct launch — they need the user to fill in port / creds
     * / TLS mode / etc. before the session actually tries to connect.
     *
     * Routing these through the EditProfileModal (same path the Tools
     * menu uses) mirrors the common-sense: SSH `user@host:port` is
     * usually enough, gNMI / RDP / Prometheus / Telnet / Collector
     * profiles aren't. Previously ALL providers launched directly from
     * the Quick connect entry, which gave users a gNMI tab that
     * immediately failed with "capabilities request failed: HOST:6030"
     * because they'd typed only the IP.
     */
    private readonly LAUNCH_VIA_EDIT_MODAL = new Set(['gnmi', 'rdp', 'collector', 'telnet'])

    /**
     * Open the Settings plugin's EditProfileModalComponent (loaded
     * dynamically so tlink-local keeps no compile-time dep on
     * tlink-settings), seeded with the QuickConnect-derived partial
     * profile. On Save: launch the tab. On Cancel: no-op. Falls back
     * to a direct launch if tlink-settings isn't available.
     */
    private async launchViaEditModal (profile: PartialProfile<Profile>): Promise<void> {
        let EditProfileModalComponent: any = null
        try {
            ({ EditProfileModalComponent } = window['nodeRequire']('tlink-settings'))
        } catch {
            await this.profiles.openNewTabForProfile(profile)
            return
        }
        const provider = this.profiles.providerForProfile(profile as Profile)
        if (!provider) {
            await this.profiles.openNewTabForProfile(profile)
            return
        }
        const modal = this.ngbModal.open(EditProfileModalComponent, { size: 'lg' })
        modal.componentInstance.profile = JSON.parse(JSON.stringify(profile))
        modal.componentInstance.profileProvider = provider
        const result = await modal.result.catch(() => null)
        if (!result) { return }
        result.type = provider.id
        await this.profiles.openNewTabForProfile(result)
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
                    // "New connection" layout:
                    //   Default (empty search box):
                    //     weight 0  — launcher builtins (AI Chat, API client)
                    //     weight 100 — per-provider Quick Connect entries
                    //   When the user types in the search box, saved
                    //   user profiles become visible too (fuzzy-searched
                    //   on name / group / description) so they can
                    //   reconnect to an existing SSH / gNMI / RDP / etc.
                    //   session without first opening Ctrl+P or the
                    //   sidebar. They're hiddenWithoutFilter to keep the
                    //   default view a compact launcher instead of a flat
                    //   dump of every saved session — matches the user's
                    //   feedback that "New connection" should feel like
                    //   a launcher, with search as the discovery path.
                    const LAUNCHER_PROFILE_TYPES = new Set(['chatgpt', 'api-client'])
                    const allProfiles = await this.profiles.getProfiles({ includeBuiltin: true })
                    const launcherProfiles = allProfiles.filter(p => p.isBuiltin && LAUNCHER_PROFILE_TYPES.has(p.type))
                    const options = launcherProfiles.map(p => {
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

                    // Saved, connectable user profiles. Skip templates,
                    // blacklisted entries, and builtin launcher shells —
                    // those either aren't real connections (templates,
                    // "New terminal" picker fodder) or are already in the
                    // launcher group above.
                    const providerNameById = new Map(this.profiles.getProviders().map(pv => [pv.id, pv.name]))
                    const userProfiles = allProfiles.filter(p =>
                        !p.isBuiltin &&
                        !p.isTemplate &&
                        p.id &&
                        !LAUNCHER_PROFILE_TYPES.has(p.type) &&
                        providerNameById.has(p.type),
                    )
                    userProfiles.forEach(p => {
                        const { result, ...opt } = this.profiles.selectorOptionForProfile(p)
                        options.push({
                            ...opt,
                            result: undefined,
                            group: providerNameById.get(p.type) ?? p.type,
                            weight: 1,
                            hiddenWithoutFilter: true,
                            callback: () => {
                                void this.profiles.openNewTabForProfile(p)
                            },
                        })
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
                                    if (!profile) { return }
                                    if (this.LAUNCH_VIA_EDIT_MODAL.has(provider.id)) {
                                        await this.launchViaEditModal(profile)
                                    } else {
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
