import { Injectable } from '@angular/core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { ConfigService, NotificationsService, PlatformService } from 'tlink-core'

interface AgentLaunchSpec {
    runtimePath: string
    args: string[]
    commandLine: string
}

interface EditorLauncher {
    command: string
    args: string[]
}

@Injectable()
export class IntelliJBridgeService {
    constructor (
        private config: ConfigService,
        private platform: PlatformService,
        private notifications: NotificationsService,
    ) { }

    resolveAssetRoot (): string | null {
        const candidates = this.getAssetRootCandidates()
        for (const candidate of candidates) {
            const source = path.join(candidate, 'tabby-agent', 'node', 'index.js')
            if (fs.existsSync(source)) {
                return candidate
            }
        }
        return null
    }

    ensureRuntimeAgentScript (): string | null {
        const assetRoot = this.resolveAssetRoot()
        if (!assetRoot) {
            return null
        }

        const sourcePath = path.join(assetRoot, 'tabby-agent', 'node', 'index.js')
        const configuredPath = String(this.getBridgeConfig().runtimeAgentPath ?? '').trim()
        const runtimePath = configuredPath || this.getDefaultRuntimePath()

        fs.mkdirSync(path.dirname(runtimePath), { recursive: true })

        if (this.shouldRefreshRuntimeCopy(sourcePath, runtimePath)) {
            fs.copyFileSync(sourcePath, runtimePath)
        }

        return runtimePath
    }

    getLaunchSpec (): AgentLaunchSpec | null {
        const runtimePath = this.ensureRuntimeAgentScript()
        if (!runtimePath) {
            return null
        }

        const cfg = this.getBridgeConfig()
        const nodeCommand = String(cfg.nodeCommand ?? '').trim() || 'node'
        const transport = cfg.transport === 'socket' ? 'socket' : 'stdio'
        const args = [runtimePath]

        if (transport === 'socket') {
            const socketPort = this.normalizeSocketPort(cfg.socketPort)
            args.push(`--socket=${socketPort}`)
        } else {
            args.push('--stdio')
        }

        const commandLine = [nodeCommand, ...args].map(x => this.quoteShellArg(x)).join(' ')

        return {
            runtimePath,
            args,
            commandLine,
        }
    }

    copyLaunchCommandToClipboard (): boolean {
        const spec = this.getLaunchSpec()
        if (!spec) {
            this.notifyMissingAssets()
            return false
        }

        this.platform.setClipboard({ text: spec.commandLine })
        this.notifications.notice('Copied IntelliJ agent command to clipboard')
        return true
    }

    copyMcpJsonSnippetToClipboard (): boolean {
        const spec = this.getLaunchSpec()
        if (!spec) {
            this.notifyMissingAssets()
            return false
        }

        const snippet = {
            servers: {
                'tabby-intellij': {
                    type: 'stdio',
                    command: this.getConfiguredNodeCommand(),
                    args: [spec.runtimePath, '--stdio'],
                },
            },
        }

        this.platform.setClipboard({ text: JSON.stringify(snippet, null, 2) })
        this.notifications.notice('Copied IntelliJ MCP JSON snippet to clipboard')
        return true
    }

    async openEditor (): Promise<boolean> {
        const launchers = this.getEditorLaunchers()
        for (const launcher of launchers) {
            const launched = await this.launchEditorProcess(launcher)
            if (launched) {
                this.notifications.notice('Opened JetBrains editor')
                return true
            }
        }
        this.notifyInstallIntelliJ()
        return false
    }

    openAssetRoot (): boolean {
        const assetRoot = this.resolveAssetRoot()
        if (!assetRoot) {
            this.notifyMissingAssets()
            return false
        }
        this.platform.openPath(assetRoot)
        return true
    }

    revealRuntimeAgentScript (): boolean {
        const runtimePath = this.ensureRuntimeAgentScript()
        if (!runtimePath) {
            this.notifyMissingAssets()
            return false
        }
        this.platform.showItemInFolder(runtimePath)
        return true
    }

    notifyMissingAssets (): void {
        const expected = this.getAssetRootCandidates()[0] ?? 'builtin-plugins/tlink-intellij-editor'
        this.notifications.error('IntelliJ integration assets not found', expected)
    }

    private notifyInstallIntelliJ (): void {
        const downloadURL = 'https://www.jetbrains.com/idea/download/'
        this.notifications.info(
            `IntelliJ IDEA not found. Opening download page: ${downloadURL}`,
            'Optional override: intellijBridge.editorCommand',
        )
        try {
            this.platform.openExternal(downloadURL)
        } catch {
            // Ignore, notification already contains the URL.
        }
    }

    private getBridgeConfig (): any {
        return this.config.store?.intellijBridge ?? {}
    }

    private getConfiguredNodeCommand (): string {
        const nodeCommand = String(this.getBridgeConfig().nodeCommand ?? '').trim()
        return nodeCommand || 'node'
    }

    private getDefaultRuntimePath (): string {
        const configPath = this.platform.getConfigPath()
        const rootDir = configPath
            ? path.dirname(configPath)
            : path.join(os.homedir(), '.tlink')

        return path.join(rootDir, 'intellij-bridge', 'tabby-agent.cjs')
    }

    private shouldRefreshRuntimeCopy (sourcePath: string, runtimePath: string): boolean {
        if (!fs.existsSync(runtimePath)) {
            return true
        }

        try {
            const sourceStat = fs.statSync(sourcePath)
            const runtimeStat = fs.statSync(runtimePath)
            return sourceStat.size !== runtimeStat.size || sourceStat.mtimeMs > runtimeStat.mtimeMs
        } catch {
            return true
        }
    }

    private normalizeSocketPort (value: any): number {
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) {
            return 7654
        }
        const normalized = Math.trunc(parsed)
        if (normalized < 1 || normalized > 65535) {
            return 7654
        }
        return normalized
    }

    private quoteShellArg (value: string): string {
        if (/^[A-Za-z0-9_./:=-]+$/.test(value)) {
            return value
        }
        return `"${value.replace(/(["\\$`])/g, '\\$1')}"`
    }

    private async launchEditorProcess (launcher: EditorLauncher): Promise<boolean> {
        const childProcess = this.getNodeChildProcess()
        if (childProcess) {
            const launched = await this.launchDetached(childProcess, launcher)
            if (launched) {
                return true
            }
        }

        // Fallback for runtimes where Node child_process cannot be required.
        try {
            await this.platform.exec(launcher.command, launcher.args)
            return true
        } catch {
            return false
        }
    }

    private async launchDetached (childProcess: typeof import('child_process'), launcher: EditorLauncher): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            let settled = false
            try {
                const useShell = process.platform === 'win32' && launcher.command.toLowerCase().endsWith('.bat')
                const child = childProcess.spawn(launcher.command, launcher.args, {
                    detached: true,
                    stdio: 'ignore',
                    shell: useShell,
                })
                const settle = (value: boolean): void => {
                    if (!settled) {
                        settled = true
                        resolve(value)
                    }
                }
                child.once('error', () => {
                    settle(false)
                })
                child.once('exit', (code, signal) => {
                    if (code === 0 && signal == null) {
                        child.unref()
                        settle(true)
                        return
                    }
                    settle(false)
                })
                setTimeout(() => {
                    child.unref()
                    settle(true)
                }, 1200)
            } catch {
                resolve(false)
            }
        })
    }

    private getNodeChildProcess (): typeof import('child_process') | null {
        try {
            const nodeRequire = (globalThis as any).require
            if (nodeRequire) {
                return nodeRequire('child_process') as typeof import('child_process')
            }
        } catch {
            // Ignore and fall back to platform.exec.
        }
        return null
    }

    private getCustomEditorLauncher (): EditorLauncher | null {
        const cfg = this.getBridgeConfig()
        const command = String(cfg.editorCommand ?? '').trim()
        if (!command) {
            return null
        }
        return {
            command,
            args: this.normalizeEditorArgs(cfg.editorArgs),
        }
    }

    private normalizeEditorArgs (value: any): string[] {
        if (Array.isArray(value)) {
            return value.map(v => String(v).trim()).filter(Boolean)
        }
        if (typeof value === 'string') {
            const tokens = value.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) ?? []
            return tokens
                .map(token => token.trim())
                .filter(Boolean)
                .map(token => token.replace(/^["']|["']$/g, ''))
        }
        return []
    }

    private dedupeLaunchers (launchers: EditorLauncher[]): EditorLauncher[] {
        const deduped: EditorLauncher[] = []
        const seen = new Set<string>()
        for (const launcher of launchers) {
            const key = `${launcher.command}\0${launcher.args.join('\0')}`
            if (!seen.has(key)) {
                seen.add(key)
                deduped.push(launcher)
            }
        }
        return deduped
    }

    private getEditorLaunchers (): EditorLauncher[] {
        const custom = this.getCustomEditorLauncher()
        if (process.platform === 'darwin') {
            const byBundleId: EditorLauncher[] = [
                { command: 'open', args: ['-b', 'com.jetbrains.intellij'] },
                { command: 'open', args: ['-b', 'com.jetbrains.intellij.ce'] },
                { command: 'open', args: ['-b', 'com.jetbrains.pycharm'] },
                { command: 'open', args: ['-b', 'com.jetbrains.pycharm.ce'] },
                { command: 'open', args: ['-b', 'com.jetbrains.webstorm'] },
                { command: 'open', args: ['-b', 'com.jetbrains.goland'] },
                { command: 'open', args: ['-b', 'com.jetbrains.clion'] },
                { command: 'open', args: ['-b', 'com.jetbrains.rider'] },
                { command: 'open', args: ['-b', 'com.jetbrains.rubymine'] },
                { command: 'open', args: ['-b', 'com.jetbrains.datagrip'] },
                { command: 'open', args: ['-b', 'com.jetbrains.phpstorm'] },
                { command: 'open', args: ['-b', 'com.jetbrains.aqua'] },
            ]
            const byName: EditorLauncher[] = [
                { command: 'open', args: ['-a', 'IntelliJ IDEA'] },
                { command: 'open', args: ['-a', 'IntelliJ IDEA CE'] },
                { command: 'open', args: ['-a', 'IntelliJ IDEA Community Edition'] },
                { command: 'open', args: ['-a', 'IntelliJ IDEA Ultimate'] },
                { command: 'open', args: ['-a', 'IntelliJ IDEA Ultimate Edition'] },
                { command: 'open', args: ['-a', 'PyCharm'] },
                { command: 'open', args: ['-a', 'PyCharm CE'] },
                { command: 'open', args: ['-a', 'WebStorm'] },
                { command: 'open', args: ['-a', 'GoLand'] },
                { command: 'open', args: ['-a', 'CLion'] },
                { command: 'open', args: ['-a', 'Rider'] },
                { command: 'open', args: ['-a', 'RubyMine'] },
                { command: 'open', args: ['-a', 'DataGrip'] },
                { command: 'open', args: ['-a', 'PhpStorm'] },
                { command: 'open', args: ['-a', 'Aqua'] },
                { command: 'open', args: ['-a', 'Android Studio'] },
            ]
            const byPath = this.getMacJetBrainsAppPaths().map(appPath => ({ command: 'open', args: [appPath] }))
            const launchers = [
                ...(custom ? [custom] : []),
                ...byBundleId,
                ...byName,
                ...byPath,
                { command: 'idea', args: [] },
            ]
            return this.dedupeLaunchers(launchers)
        }
        if (process.platform === 'win32') {
            const launchers = [
                ...(custom ? [custom] : []),
                { command: 'idea64.exe', args: [] },
                { command: 'idea.exe', args: [] },
                { command: 'idea.bat', args: [] },
                { command: 'pycharm64.exe', args: [] },
                { command: 'pycharm.exe', args: [] },
            ]
            return this.dedupeLaunchers(launchers)
        }
        const launchers = [
            ...(custom ? [custom] : []),
            { command: 'idea', args: [] },
            { command: 'intellij-idea-community', args: [] },
            { command: 'intellij-idea-ultimate', args: [] },
            { command: 'pycharm', args: [] },
            { command: 'webstorm', args: [] },
            { command: 'goland', args: [] },
            { command: 'clion', args: [] },
            { command: 'rider', args: [] },
            { command: 'rubymine', args: [] },
            { command: 'datagrip', args: [] },
            { command: 'phpstorm', args: [] },
        ]
        return this.dedupeLaunchers(launchers)
    }

    private getMacJetBrainsAppPaths (): string[] {
        const appRoots = [
            '/Applications',
            path.join(os.homedir(), 'Applications'),
            path.join(os.homedir(), 'Library', 'Application Support', 'JetBrains', 'Toolbox', 'apps'),
            '/Users/Shared/JetBrains/Toolbox/apps',
        ]
        const seen = new Set<string>()
        for (const appRoot of appRoots) {
            for (const appPath of this.findJetBrainsAppsInDirectory(appRoot)) {
                seen.add(appPath)
            }
        }
        return Array.from(seen)
    }

    private findJetBrainsAppsInDirectory (rootDir: string): string[] {
        if (!fs.existsSync(rootDir)) {
            return []
        }
        const matches: string[] = []
        let entries: fs.Dirent[] = []
        try {
            entries = fs.readdirSync(rootDir, { withFileTypes: true })
        } catch {
            return matches
        }
        for (const entry of entries) {
            const entryPath = path.join(rootDir, entry.name)
            if (!entry.isDirectory()) {
                continue
            }
            if (/^(IntelliJ IDEA|PyCharm|WebStorm|GoLand|CLion|Rider|RubyMine|DataGrip|PhpStorm|Aqua|Android Studio).*\.app$/i.test(entry.name)) {
                matches.push(entryPath)
                continue
            }
            if (entry.name.endsWith('.app')) {
                continue
            }
            for (const nestedApp of this.findJetBrainsAppsInDirectory(entryPath)) {
                matches.push(nestedApp)
            }
        }
        return matches
    }

    private getAssetRootCandidates (): string[] {
        const repoRoot = this.getRepoRoot()
        const resourcesPath = String((process as any).resourcesPath ?? '')

        const candidates = [
            resourcesPath ? path.join(resourcesPath, 'builtin-plugins', 'tlink-intellij-editor') : '',
            repoRoot ? path.join(repoRoot, 'tlink-intellij-editor') : '',
            repoRoot ? path.join(repoRoot, 'builtin-plugins', 'tlink-intellij-editor') : '',
            repoRoot ? path.join(repoRoot, 'build', 'builtin-plugins', 'tlink-intellij-editor') : '',
        ].filter(Boolean)

        return Array.from(new Set(candidates))
    }

    private getRepoRoot (): string {
        try {
            const nodeRequire = (globalThis as any).require
            if (nodeRequire) {
                const remote = nodeRequire('@electron/remote')
                const appPath = remote?.app?.getAppPath?.()
                if (typeof appPath === 'string' && appPath.length) {
                    return path.dirname(appPath)
                }
            }
        } catch {
            // Ignore and fall back to cwd.
        }

        return process.cwd()
    }
}
