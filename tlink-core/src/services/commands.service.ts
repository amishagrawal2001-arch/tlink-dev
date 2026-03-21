import { Inject, Injectable, Optional } from '@angular/core'
import { AppService, Command, CommandContext, CommandProvider, ConfigService, MenuItemOptions, SelectorOption, SplitTabComponent, TabContextMenuItemProvider, ToolbarButton, ToolbarButtonProvider, TranslateService } from '../api'
import { SelectorService } from './selector.service'
import { ProfilesService } from './profiles.service'

@Injectable({ providedIn: 'root' })
export class CommandService {
    private lastCommand = Promise.resolve()

    constructor (
        private selector: SelectorService,
        private config: ConfigService,
        private app: AppService,
        private translate: TranslateService,
        private profilesService: ProfilesService,
        @Optional() @Inject(TabContextMenuItemProvider) protected contextMenuProviders: TabContextMenuItemProvider[],
        @Optional() @Inject(ToolbarButtonProvider) private toolbarButtonProviders: ToolbarButtonProvider[],
        @Inject(CommandProvider) private commandProviders: CommandProvider[],
    ) {
        this.contextMenuProviders.sort((a, b) => a.weight - b.weight)
    }

    async getCommands (context: CommandContext): Promise<Command[]> {
        let buttons: ToolbarButton[] = []
        this.config.enabledServices(this.toolbarButtonProviders).forEach(provider => {
            buttons = buttons.concat(provider.provide())
        })
        buttons = buttons
            .sort((a: ToolbarButton, b: ToolbarButton) => (a.weight ?? 0) - (b.weight ?? 0))

        let items: MenuItemOptions[] = []
        if (context.tab) {
            for (const tabHeader of [false, true]) {
            // Top-level tab menu
                for (let section of await Promise.all(this.contextMenuProviders.map(x => x.getItems(context.tab!, tabHeader)))) {
                    // eslint-disable-next-line @typescript-eslint/no-loop-func
                    section = section.filter(item => !items.some(ex => ex.label === item.label))
                    items = items.concat(section)
                }
                if (context.tab instanceof SplitTabComponent) {
                    const tab = context.tab.getFocusedTab()
                    if (tab) {
                        for (let section of await Promise.all(this.contextMenuProviders.map(x => x.getItems(tab, tabHeader)))) {
                            // eslint-disable-next-line @typescript-eslint/no-loop-func
                            section = section.filter(item => !items.some(ex => ex.label === item.label))
                            items = items.concat(section)
                        }
                    }
                }
            }
        }

        items = items.filter(x => (x.enabled ?? true) && x.type !== 'separator')

        const flatItems: MenuItemOptions[] = []
        function flattenItem (item: MenuItemOptions, prefix?: string): void {
            if (item.submenu) {
                item.submenu.forEach(x => flattenItem(x, (prefix ? `${prefix} > ` : '') + (item.commandLabel ?? item.label)))
            } else {
                flatItems.push({
                    ...item,
                    label: (prefix ? `${prefix} > ` : '') + (item.commandLabel ?? item.label),
                })
            }
        }
        items.forEach(x => flattenItem(x))

        const commands = buttons.map(x => Command.fromToolbarButton(x))
        commands.push(...flatItems.map(x => Command.fromMenuItem(x)))

        for (const provider of this.config.enabledServices(this.commandProviders)) {
            commands.push(...await provider.provide(context))
        }

        return commands
            .filter(c => !this.config.store.commandBlacklist.includes(c.id))
            .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
            .map(command => {
                const run = command.run
                command.run = async () => {
                    // Serialize execution
                    this.lastCommand = this.lastCommand.finally(run)
                    await this.lastCommand
                }
                return command
            })
    }

    async run (id: string, context: CommandContext): Promise<void> {
        const commands = await this.getCommands(context)
        const command = commands.find(x => x.id === id)
        await command?.run()
    }

    async showPalette (): Promise<void> {
        if (this.selector.active) {
            return
        }

        const options: SelectorOption<void>[] = []

        // Open tabs
        const tabs = this.app.tabs
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i]
            options.push({
                name: tab.title || `Tab ${i + 1}`,
                group: this.translate.instant('Open Tabs'),
                icon: 'fas fa-window-maximize',
                weight: -30,
                callback: () => { this.app.selectTab(tab) },
            })
        }

        // Recent profiles
        const recentProfiles = this.profilesService.getRecentProfiles()
        for (const profile of recentProfiles) {
            options.push({
                ...this.profilesService.selectorOptionForProfile(profile),
                group: this.translate.instant('Recent'),
                weight: -20,
                callback: () => { this.profilesService.openNewTabForProfile(profile) },
            })
        }

        // All profiles
        const allProfiles = await this.profilesService.getProfiles()
        for (const profile of allProfiles) {
            if (profile.isTemplate) {
                continue
            }
            options.push({
                ...this.profilesService.selectorOptionForProfile(profile),
                group: this.translate.instant('Profiles'),
                weight: -10,
                callback: () => { this.profilesService.openNewTabForProfile(profile) },
            })
        }

        // Commands
        const context: CommandContext = {}
        const tab = this.app.activeTab
        if (tab instanceof SplitTabComponent) {
            context.tab = tab.getFocusedTab() ?? undefined
        }
        const commands = await this.getCommands(context)
        for (const c of commands) {
            options.push({
                name: c.label,
                description: c.sublabel,
                icon: c.icon,
                group: this.translate.instant('Commands'),
                weight: 0,
                callback: c.run,
            })
        }

        return this.selector.show(this.translate.instant('Command Palette'), options)
    }

    async showSelector (): Promise<void> {
        if (this.selector.active) {
            return
        }

        const context: CommandContext = {}
        const tab = this.app.activeTab
        if (tab instanceof SplitTabComponent) {
            context.tab = tab.getFocusedTab() ?? undefined
        }
        const commands = await this.getCommands(context)
        return this.selector.show(
            this.translate.instant('Commands'),
            commands.map(c => ({
                name: c.label,
                callback: c.run,
                description: c.sublabel,
                icon: c.icon,
            })),
        )
    }
}
