import { BehaviorSubject, Observable } from 'rxjs';
import { ConfigService, PlatformService, PluginInfo } from 'tlink-core';
import { PluginManagerService } from '../services/pluginManager.service';
declare enum BusyState {
    Installing = "Installing",
    Uninstalling = "Uninstalling"
}
/** @hidden */
export declare class PluginsSettingsTabComponent {
    private config;
    private platform;
    pluginManager: PluginManagerService;
    BusyState: typeof BusyState;
    availablePlugins$: Observable<PluginInfo[]>;
    availablePluginsQuery$: BehaviorSubject<string>;
    availablePluginsReady: boolean;
    installedPluginsQuery$: BehaviorSubject<string>;
    knownUpgrades: Record<string, PluginInfo | null>;
    busy: Map<string, BusyState>;
    erroredPlugin: string;
    errorMessage: string;
    true: any;
    installedPlugins$: PluginInfo[];
    installedFilter: string;
    availableFilter: string;
    private formatError;
    constructor(config: ConfigService, platform: PlatformService, pluginManager: PluginManagerService);
    ngOnInit(): void;
    openPluginsFolder(): void;
    searchAvailable(query: string): void;
    searchInstalled(query: string): void;
    isAlreadyInstalled(plugin: PluginInfo): boolean;
    installPlugin(plugin: PluginInfo): Promise<void>;
    uninstallPlugin(plugin: PluginInfo): Promise<void>;
    upgradePlugin(plugin: PluginInfo): Promise<void>;
    showPluginInfo(plugin: PluginInfo): void;
    showPluginHomepage(plugin: PluginInfo): void;
    isPluginEnabled(plugin: PluginInfo): boolean;
    canDisablePlugin(plugin: PluginInfo): boolean;
    togglePlugin(plugin: PluginInfo): void;
    enablePlugin(plugin: PluginInfo): void;
    disablePlugin(plugin: PluginInfo): void;
}
export {};
