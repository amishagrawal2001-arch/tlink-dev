/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { BehaviorSubject, Observable, debounceTime, distinctUntilChanged, first, tap, flatMap, map } from 'rxjs'
import semverGt from 'semver/functions/gt'

import { Component, HostBinding, Input } from '@angular/core'
import { ConfigService, PlatformService, PluginInfo } from 'tlink-core'
import { PluginManagerService } from '../services/pluginManager.service'

enum BusyState { Installing = 'Installing', Uninstalling = 'Uninstalling' }

const FORCE_ENABLE = ['tlink-core', 'tlink-settings', 'tlink-electron', 'tlink-web', 'tlink-plugin-manager']

_('Search plugins')

/**
 * Filter chips state for the Available tab. We keep this minimal —
 * the npm-search list can be hundreds of plugins long, so even simple
 * "official only" / "not yet installed" toggles do real work.
 */
type AvailableFilter = 'all' | 'official' | 'not-installed'
type InstalledFilter = 'all' | 'enabled' | 'disabled' | 'third-party' | 'has-update'

/** @hidden */
@Component({
    templateUrl: './pluginsSettingsTab.component.pug',
    styleUrls: ['./pluginsSettingsTab.component.scss'],
})
export class PluginsSettingsTabComponent {
    BusyState = BusyState
    @Input() availablePlugins$: Observable<PluginInfo[]>
    @Input() availablePluginsQuery$ = new BehaviorSubject<string>('')
    @Input() availablePluginsReady = false
    @Input() installedPluginsQuery$ = new BehaviorSubject<string>('')
    @Input() knownUpgrades: Record<string, PluginInfo|null> = {}
    @Input() busy = new Map<string, BusyState>()
    @Input() erroredPlugin: string
    @Input() errorMessage: string

    @HostBinding('class.content-box') true

    /** Snapshot of the most recent npm-search result so the Available
     *  tab template can render synchronously (counts, empty states,
     *  filters all need a stable list). The async pipe stream stays
     *  in place for the loading state but reads the same data. */
    availablePluginsList: PluginInfo[] = []
    installedPlugins$: PluginInfo[] = []
    installedFilter = ''
    availableFilter = ''

    /** Filter chip state per tab. */
    availableChip: AvailableFilter = 'all'
    installedChip: InstalledFilter = 'all'

    /** Sticky banner — flips on after any state-mutating action so the
     *  user knows a restart is needed to pick up the change. The sibling
     *  `requestRestart()` call still runs, but its UI lives elsewhere
     *  in the app and isn't always discoverable from this tab. */
    restartNeeded = false
    /** Plugin currently awaiting uninstall confirmation. Cleared after
     *  the user picks Confirm or Cancel. */
    pendingUninstall: PluginInfo | null = null
    /** Show a one-shot toast when "Copy package name" is hit. */
    copiedName: string | null = null

    constructor (
        private config: ConfigService,
        private platform: PlatformService,
        public pluginManager: PluginManagerService,
    ) {
    }

    private formatError (err: unknown): string {
        if (!err) {
            return 'Unknown error'
        }
        if (typeof err === 'string') {
            return err
        }
        if (err instanceof Error) {
            return err.stack ?? err.message
        }
        const { message } = (err as { message?: unknown })
        if (typeof message === 'string' && message.length) {
            return message
        }
        try {
            return JSON.stringify(err, null, 2)
        } catch {
            return String(err)
        }
    }

    ngOnInit () {
        this.availablePlugins$ = this.availablePluginsQuery$
            .asObservable()
            .pipe(
                debounceTime(200),
                distinctUntilChanged(),
                flatMap(query => {
                    this.availablePluginsReady = false
                    return this.pluginManager.listAvailable(query).pipe(tap(plugins => {
                        this.availablePluginsReady = true
                        this.availablePluginsList = plugins
                    }))
                }),
            )
        this.availablePlugins$.pipe(first(), map((plugins: PluginInfo[]) => {
            plugins.sort((a, b) => a.name > b.name ? 1 : -1)
            return plugins
        })).subscribe(available => {
            for (const plugin of this.pluginManager.installedPlugins) {
                this.knownUpgrades[plugin.name] = available.find(x => x.name === plugin.name && semverGt(x.version, plugin.version)) ?? null
            }
        })

        this.installedPluginsQuery$
            .asObservable()
            .pipe(
                debounceTime(200),
                distinctUntilChanged(),
                flatMap(query => {
                    return this.pluginManager.listInstalled(query)
                }),
            ).subscribe(plugin => {
                this.installedPlugins$ = plugin
            })
    }

    openPluginsFolder (): void {
        this.platform.openPath(this.pluginManager.userPluginsPath)
    }

    searchAvailable (query: string) {
        this.availablePluginsQuery$.next(query)
    }

    searchInstalled (query: string) {
        this.installedPluginsQuery$.next(query)
    }

    isAlreadyInstalled (plugin: PluginInfo): boolean {
        return this.pluginManager.installedPlugins.some(x => x.name === plugin.name)
    }

    // ----- Counts (used in tab badges + empty states) ------------------

    get installedCount (): number {
        return this.pluginManager.installedPlugins.length
    }

    get availableCount (): number {
        return this.availablePluginsList.filter(p => !this.isAlreadyInstalled(p)).length
    }

    /** Number of installed plugins that have a newer version on npm.
     *  Drives the Updates tab's badge + the dot indicator on the tab. */
    get updatesCount (): number {
        return this.pluginManager.installedPlugins.filter(
            p => this.knownUpgrades[p.name],
        ).length
    }

    /** Plugins eligible for the Updates tab — installed AND has a
     *  newer version on npm. Computed live so toggling enable/disable
     *  doesn't move plugins out (an upgrade is independent of state). */
    get pluginsWithUpdates (): PluginInfo[] {
        return this.pluginManager.installedPlugins.filter(
            p => this.knownUpgrades[p.name],
        )
    }

    // ----- Filtering ---------------------------------------------------

    /** Apply the active filter chip to the npm-search results. */
    filteredAvailable (plugins: PluginInfo[] | null): PluginInfo[] {
        if (!plugins) {return []}
        const installed = new Set(this.pluginManager.installedPlugins.map(p => p.name))
        return plugins.filter(p => {
            if (installed.has(p.name) && this.availableChip !== 'all') {
                return false
            }
            if (this.availableChip === 'official' && !p.isOfficial) {
                return false
            }
            return true
        })
    }

    filteredInstalled (): PluginInfo[] {
        return this.installedPlugins$.filter(p => {
            switch (this.installedChip) {
                case 'enabled': return this.isPluginEnabled(p)
                case 'disabled': return !this.isPluginEnabled(p)
                case 'third-party': return !p.isBuiltin
                case 'has-update': return !!this.knownUpgrades[p.name]
                case 'all':
                default: return true
            }
        })
    }

    // ----- Install / uninstall / upgrade -------------------------------

    async installPlugin (plugin: PluginInfo): Promise<void> {
        this.busy.set(plugin.name, BusyState.Installing)
        try {
            await this.pluginManager.installPlugin(plugin)
            this.busy.delete(plugin.name)
            this.config.requestRestart()
            this.restartNeeded = true
            // After install, refresh the upgrade map for this plugin —
            // we'll consider it up-to-date until the next npm search.
            this.knownUpgrades[plugin.name] = null
        } catch (err) {
            console.error('Error installing plugin', plugin.name, err)
            this.erroredPlugin = plugin.name
            this.errorMessage = this.formatError(err)
            this.busy.delete(plugin.name)
            throw err
        }
    }

    /** Two-step uninstall: first click flags the plugin for confirm,
     *  second click on the same plugin actually uninstalls. Click
     *  elsewhere or the Cancel button clears it. */
    requestUninstall (plugin: PluginInfo): void {
        this.pendingUninstall = plugin
    }

    cancelUninstall (): void {
        this.pendingUninstall = null
    }

    async confirmUninstall (plugin: PluginInfo): Promise<void> {
        this.pendingUninstall = null
        this.busy.set(plugin.name, BusyState.Uninstalling)
        try {
            await this.pluginManager.uninstallPlugin(plugin)
            this.busy.delete(plugin.name)
            this.config.requestRestart()
            this.restartNeeded = true
        } catch (err) {
            console.error('Error uninstalling plugin', plugin.name, err)
            this.erroredPlugin = plugin.name
            this.errorMessage = this.formatError(err)
            this.busy.delete(plugin.name)
            throw err
        }
    }

    async upgradePlugin (plugin: PluginInfo): Promise<void> {
        const upgrade = this.knownUpgrades[plugin.name]
        if (!upgrade) {return}
        return this.installPlugin(upgrade)
    }

    /**
     * Sequential bulk upgrade. We deliberately don't run them in
     * parallel — npm install touches the same node_modules dir per
     * call, so concurrent installs can step on each other and leave
     * a half-extracted package. Sequencing also lets the per-row
     * spinners show real progress.
     */
    async upgradeAll (): Promise<void> {
        const targets = this.pluginsWithUpdates.slice()  // clone — list mutates as we go
        for (const p of targets) {
            try {
                await this.upgradePlugin(p)
            } catch {
                // Per-plugin error is already surfaced via formatError;
                // keep going so a single bad package doesn't stop the rest.
            }
        }
    }

    showPluginInfo (plugin: PluginInfo) {
        this.platform.openExternal('https://www.npmjs.com/package/' + plugin.packageName)
    }

    showPluginHomepage (plugin: PluginInfo) {
        this.platform.openExternal(plugin.homepage ?? '')
    }

    /** Convenience for the per-row "copy package name" button —
     *  often what users actually want when troubleshooting. */
    async copyPackageName (plugin: PluginInfo): Promise<void> {
        try {
            await navigator.clipboard.writeText(plugin.packageName)
            this.copiedName = plugin.packageName
            setTimeout(() => {
                if (this.copiedName === plugin.packageName) {
                    this.copiedName = null
                }
            }, 1500)
        } catch {
            /* clipboard unavailable */
        }
    }

    isPluginEnabled (plugin: PluginInfo) {
        return !this.config.store.pluginBlacklist.includes(plugin.name)
    }

    canDisablePlugin (plugin: PluginInfo) {
        return !FORCE_ENABLE.includes(plugin.packageName)
    }

    togglePlugin (plugin: PluginInfo) {
        if (this.isPluginEnabled(plugin)) {
            this.disablePlugin(plugin)
        } else {
            this.enablePlugin(plugin)
        }
    }

    enablePlugin (plugin: PluginInfo) {
        this.config.store.pluginBlacklist = this.config.store.pluginBlacklist.filter(x => x !== plugin.name)
        this.config.save()
        this.config.requestRestart()
        this.restartNeeded = true
    }

    disablePlugin (plugin: PluginInfo) {
        this.config.store.pluginBlacklist = [...this.config.store.pluginBlacklist, plugin.name]
        this.config.save()
        this.config.requestRestart()
        this.restartNeeded = true
    }

    /** Dismiss the restart-needed banner without restarting — useful
     *  when the user is mid-batch and doesn't want the prompt yet. */
    dismissRestartBanner (): void {
        this.restartNeeded = false
    }

    /** Clear the error message — the banner is sticky otherwise. */
    dismissError (): void {
        this.errorMessage = ''
        this.erroredPlugin = ''
    }
}
