/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'

import { HostAppService, Platform } from './api/hostApp'
import { AppService } from './services/app.service'
import { ProfilesService } from './services/profiles.service'
import { ConfigService } from './services/config.service'
import { CommandProvider, Command, CommandLocation } from './api/commands'
import { BookmarksService } from './services/bookmarks.service'
import { SidePanelService } from './services/sidePanel.service'
import { BookmarksPanelComponent } from './components/bookmarksPanel.component'
// import { CodeEditorTabComponent } from './components/codeEditorTab.component' // Tlink Studio - deactivated

/** @hidden */
@Injectable({ providedIn: 'root' })
export class CoreCommandProvider extends CommandProvider {
    constructor (
        private hostApp: HostAppService,
        // @ts-ignore Tlink Studio deactivated – keep for DI stability
        private _app: AppService,
        private profilesService: ProfilesService,
        private translate: TranslateService,
        private config: ConfigService,
    ) {
        super()
    }

    async activate () {
        const profile = await this.profilesService.showProfileSelector().catch(() => null)
        if (profile) {
            this.profilesService.launchProfile(profile)
        }
    }

    async provide (): Promise<Command[]> {
        return [
            {
                id: 'core:profile-selector',
                locations: [CommandLocation.StartPage],
                label: this.translate.instant('Profiles & connections'),
                icon: this.hostApp.platform === Platform.Web
                    ? require('./icons/plus.svg')
                    : require('./icons/profiles.svg'),
                run: async () => this.activate(),
            },
            {
                id: 'core:cycle-color-scheme',
                locations: [CommandLocation.RightToolbar],
                label: this.translate.instant('Switch color scheme'),
                icon: require('./icons/color-scheme.svg'),
                run: async () => this.cycleColorSchemeMode(),
            },
            // Tlink Studio - deactivated
            // {
            //     id: 'core:new-code-editor',
            //     locations: [CommandLocation.StartPage],
            //     label: this.translate.instant('Tlink Studio'),
            //     icon: require('./icons/code.svg'),
            //     run: async () => {
            //         if (this.hostApp.openCodeEditorWindow()) {
            //             return
            //         }
            //         const existing = this.app.tabs.find(tab => tab instanceof CodeEditorTabComponent)
            //         if (existing) {
            //             this.app.selectTab(existing)
            //             return
            //         }
            //         this.app.openNewTab({ type: CodeEditorTabComponent })
            //     },
            // },
            ...this.profilesService.getRecentProfiles().map((profile, index) => ({
                id: `core:recent-profile-${index}`,
                label: profile.name,
                locations: [CommandLocation.StartPage],
                icon: require('./icons/history.svg'),
                run: async () => {
                    const p = (await this.profilesService.getProfiles()).find(x => x.id === profile.id) ?? profile
                    this.profilesService.launchProfile(p)
                },
            })),
        ]
    }

    private cycleColorSchemeMode (): void {
        const order: Array<'auto'|'dark'|'light'> = ['auto', 'dark', 'light']
        const current = this.config.store.appearance.colorSchemeMode as 'auto'|'dark'|'light'|undefined
        const currentIndex = Math.max(0, order.indexOf(current ?? 'dark'))
        const next = order[(currentIndex + 1) % order.length]
        this.config.store.appearance.colorSchemeMode = next
        this.config.save()
    }
}

/** @hidden */
@Injectable({ providedIn: 'root' })
export class BookmarksCommandProvider extends CommandProvider {
    private bookmarksPanelReg = {
        id: 'bookmarks',
        component: BookmarksPanelComponent,
        label: 'Bookmarks',
        width: 280,
    }

    constructor (
        private bookmarksService: BookmarksService,
        private sidePanel: SidePanelService,
        private translate: TranslateService,
    ) {
        super()
        this.sidePanel.register(this.bookmarksPanelReg)
    }

    async provide (): Promise<Command[]> {
        const commands: Command[] = [
            {
                id: 'core:toggle-bookmarks',
                label: this.translate.instant('Toggle bookmarks panel'),
                icon: 'fas fa-bookmark',
                run: async () => {
                    this.sidePanel.toggle(this.bookmarksPanelReg)
                },
            },
        ]

        // Add individual bookmark commands for the palette
        for (const bookmark of this.bookmarksService.getAll()) {
            commands.push({
                id: `core:bookmark-${bookmark.id}`,
                label: bookmark.label,
                sublabel: bookmark.command,
                icon: 'fas fa-bookmark',
                run: async () => {
                    // Execution handled when selected from palette
                },
            })
        }

        return commands
    }
}
