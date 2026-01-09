import { Component, OnDestroy, OnInit, Inject, ElementRef, ViewChild } from '@angular/core'
import { Subject, Subscription, takeUntil } from 'rxjs'
import deepClone from 'clone-deep'

import { AppService, BaseTabComponent, ConfigService, PartialProfile, ProfilesService, SidePanelService, SplitTabComponent, TranslateService, NotificationsService } from 'tlink-core'
import { TerminalColorSchemeProvider } from '../api/colorSchemeProvider'
import { TerminalColorScheme } from '../api/interfaces'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'

@Component({
    selector: 'color-templates-panel',
    templateUrl: './colorTemplatesPanel.component.pug',
    styleUrls: ['./colorTemplatesPanel.component.scss'],
})
export class ColorTemplatesPanelComponent implements OnInit, OnDestroy {
    profiles: PartialProfile<any>[] = []
    selectedProfileId = ''
    colorSchemes: TerminalColorScheme[] = []
    filteredSchemes: TerminalColorScheme[] = []
    filterText = ''
    loading = true
    savingProfileId = ''
    @ViewChild('scrollRegion', { static: false }) scrollRegion: ElementRef<HTMLDivElement>|undefined

    private destroy$ = new Subject<void>()
    private splitFocusSub?: Subscription

    constructor (
        public profilesService: ProfilesService,
        private config: ConfigService,
        private sidePanel: SidePanelService,
        private translate: TranslateService,
        private notifications: NotificationsService,
        private app: AppService,
        @Inject(TerminalColorSchemeProvider) private colorSchemeProviders: TerminalColorSchemeProvider[],
    ) { }

    ngOnInit (): void {
        void this.init()
        this.config.changed$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            void this.loadColorSchemes()
        })
        this.app.activeTabChange$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.setActiveProfileFromFocusedTab()
            this.watchSplitFocus()
        })
        this.watchSplitFocus()
    }

    ngOnDestroy (): void {
        this.destroy$.next()
        this.destroy$.complete()
    }

    get currentProfile (): PartialProfile<any>|undefined {
        return this.profiles.find(p => p.id === this.selectedProfileId)
    }

    async init (): Promise<void> {
        await this.loadProfiles()
        this.setActiveProfileFromFocusedTab()
        await this.loadColorSchemes()
        this.applyFilter()
    }

    async loadProfiles (): Promise<void> {
        // Allow applying to built-in shell profiles too
        this.profiles = await this.profilesService.getProfiles({ includeBuiltin: true, clone: true })
        this.setActiveProfileFromFocusedTab()
        if (!this.selectedProfileId && this.profiles.length) {
            this.selectedProfileId = this.profiles[0].id ?? ''
        }
    }

    async loadColorSchemes (): Promise<void> {
        this.loading = true
        try {
            const stockColorSchemes = (await Promise.all(
                this.config.enabledServices(this.colorSchemeProviders).map(x => x.getSchemes()),
            )).reduce((a, b) => a.concat(b))
            stockColorSchemes.sort((a, b) => a.name.localeCompare(b.name))
            const customColorSchemes = this.config.store.terminal.customColorSchemes ?? []
            this.colorSchemes = this.normalizeSchemeNames([...customColorSchemes, ...stockColorSchemes])
            this.applyFilter()
        } finally {
            this.loading = false
        }
    }

    onFilterChange (value: string): void {
        this.filterText = value
        this.applyFilter()
    }

    applyFilter (): void {
        const query = this.filterText.trim().toLowerCase()
        this.filteredSchemes = this.colorSchemes.filter(scheme => !query || scheme.name.toLowerCase().includes(query))
    }

    selectProfile (id: string): void {
        this.selectedProfileId = id
    }

    async applyScheme (scheme: TerminalColorScheme): Promise<void> {
        const profile = this.currentProfile
        if (!profile?.id) {
            return
        }
        if (this.savingProfileId === profile.id) {
            return
        }
        const scrollPos = this.getScrollTop()
        this.savingProfileId = profile.id
        try {
            const latestProfiles = await this.profilesService.getProfiles({ includeBuiltin: true, clone: true })
            const latest = latestProfiles.find(p => p.id === profile.id) ?? profile
            const updated = deepClone(latest)
            updated.id = latest.id
            updated.type = latest.type
            updated.terminalColorScheme = deepClone(scheme)
            await this.profilesService.writeProfile(updated)
            await this.config.save()
            this.profiles = this.profiles.map(p => p.id === updated.id ? { ...p, terminalColorScheme: updated.terminalColorScheme } : p)
            this.applySchemeToOpenTabs(updated.id ?? '', updated.terminalColorScheme)
        } catch (error) {
            console.error(error)
            this.notifications.error(this.translate.instant('Could not apply template'))
        } finally {
            this.savingProfileId = ''
            this.restoreScroll(scrollPos)
        }
    }

    closePanel (): void {
        this.sidePanel.hide()
    }

    private applySchemeToOpenTabs (profileId: string, scheme: TerminalColorScheme|undefined): void {
        const tabs = this.collectTerminalTabs()
        for (const tab of tabs) {
            if (tab.profile?.id === profileId) {
                tab.profile.terminalColorScheme = scheme
                tab.configure()
            }
        }
    }

    private collectTerminalTabs (): BaseTerminalTabComponent<any>[] {
        const result: BaseTerminalTabComponent<any>[] = []
        const visit = (tab: BaseTabComponent) => {
            if (tab instanceof BaseTerminalTabComponent) {
                result.push(tab)
                return
            }
            if (tab instanceof SplitTabComponent) {
                for (const nested of tab.getAllTabs()) {
                    visit(nested)
                }
            }
        }
        for (const tab of this.app.tabs) {
            visit(tab)
        }
        return result
    }

    private setActiveProfileFromFocusedTab (): void {
        const activeTab = this.resolveFocusedTab(this.app.activeTab)
        if (activeTab instanceof BaseTerminalTabComponent && activeTab.profile?.id) {
            this.selectedProfileId = activeTab.profile.id
        }
    }

    private watchSplitFocus (): void {
        this.splitFocusSub?.unsubscribe()
        const active = this.app.activeTab
        if (active instanceof SplitTabComponent) {
            this.splitFocusSub = active.focusChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
                this.setActiveProfileFromFocusedTab()
            })
        }
    }

    private resolveFocusedTab (tab: BaseTabComponent|null): BaseTabComponent|null {
        if (!tab) {
            return null
        }
        if (tab instanceof SplitTabComponent) {
            return tab.getFocusedTab() ?? tab.getAllTabs()[0] ?? tab
        }
        return tab
    }

    private normalizeSchemeNames (schemes: TerminalColorScheme[]): TerminalColorScheme[] {
        return schemes.map(scheme => {
            const name = scheme.name?.trim() ?? ''
            const renamed = name === 'Termius Dark'
                ? 'Dark'
                : name === 'Termius Light'
                    ? 'Light'
                    : name
            if (renamed === name) {
                return scheme
            }
            return {
                ...scheme,
                name: renamed,
            }
        })
    }

    private getScrollTop (): number {
        return this.scrollRegion?.nativeElement?.scrollTop ?? 0
    }

    private restoreScroll (position: number): void {
        if (!this.scrollRegion?.nativeElement) {
            return
        }
        this.scrollRegion.nativeElement.scrollTop = position
    }
}
