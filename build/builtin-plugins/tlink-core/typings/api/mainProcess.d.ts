export declare const BOOTSTRAP_DATA = "BOOTSTRAP_DATA";
export interface PluginInfo {
    name: string;
    description: string;
    packageName: string;
    isBuiltin: boolean;
    isLegacy: boolean;
    version: string;
    author: string;
    homepage?: string;
    path?: string;
    info?: any;
}
export interface BootstrapData {
    config: Record<string, any>;
    executable: string;
    isMainWindow: boolean;
    windowID: number;
    windowRole?: 'default' | 'code-editor' | 'ai-assistant';
    installedPlugins: PluginInfo[];
    userPluginsPath: string;
}
