import { ConfigService, NotificationsService, PlatformService } from 'tlink-core';
interface AgentLaunchSpec {
    runtimePath: string;
    args: string[];
    commandLine: string;
}
export declare class IntelliJBridgeService {
    private config;
    private platform;
    private notifications;
    constructor(config: ConfigService, platform: PlatformService, notifications: NotificationsService);
    resolveAssetRoot(): string | null;
    ensureRuntimeAgentScript(): string | null;
    getLaunchSpec(): AgentLaunchSpec | null;
    copyLaunchCommandToClipboard(): boolean;
    copyMcpJsonSnippetToClipboard(): boolean;
    openEditor(): Promise<boolean>;
    openAssetRoot(): boolean;
    revealRuntimeAgentScript(): boolean;
    notifyMissingAssets(): void;
    private notifyInstallIntelliJ;
    private getBridgeConfig;
    private getConfiguredNodeCommand;
    private getDefaultRuntimePath;
    private shouldRefreshRuntimeCopy;
    private normalizeSocketPort;
    private quoteShellArg;
    private launchEditorProcess;
    private launchDetached;
    private getNodeChildProcess;
    private getCustomEditorLauncher;
    private normalizeEditorArgs;
    private dedupeLaunchers;
    private getEditorLaunchers;
    private getMacJetBrainsAppPaths;
    private findJetBrainsAppsInDirectory;
    private getAssetRootCandidates;
    private getRepoRoot;
}
export {};
