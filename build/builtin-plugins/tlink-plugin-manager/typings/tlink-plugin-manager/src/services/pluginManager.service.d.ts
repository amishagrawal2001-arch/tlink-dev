import { Observable } from 'rxjs';
import { Logger, PluginInfo } from 'tlink-core';
export declare class PluginManagerService {
    private platform;
    logger: Logger;
    userPluginsPath: string;
    installedPlugins: PluginInfo[];
    private constructor();
    listAvailable(query?: string): Observable<PluginInfo[]>;
    listInstalled(query: string): Observable<PluginInfo[]>;
    _listAvailableInternal(namePrefix: string, keyword: string, query?: string): Observable<PluginInfo[]>;
    installPlugin(plugin: PluginInfo): Promise<void>;
    uninstallPlugin(plugin: PluginInfo): Promise<void>;
}
