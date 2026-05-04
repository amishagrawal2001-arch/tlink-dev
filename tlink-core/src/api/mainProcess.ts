export const BOOTSTRAP_DATA = 'BOOTSTRAP_DATA'

export interface PluginInfo {
    name: string
    description: string
    packageName: string
    isBuiltin: boolean
    isLegacy: boolean
    version: string
    author: string
    homepage?: string
    path?: string
    info?: any
    /** True when the npm publisher matches the project's official
     *  account. Set by PluginManagerService when listing available
     *  plugins; absent on installed-only entries (where it doesn't
     *  matter). */
    isOfficial?: boolean
}

export interface BootstrapData {
    config: Record<string, any>
    executable: string
    isMainWindow: boolean
    windowID: number
    windowRole?: 'default'|'code-editor'|'ai-assistant'
    installedPlugins: PluginInfo[]
    userPluginsPath: string
}
