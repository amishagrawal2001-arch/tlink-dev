import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { LoggerService } from './logger.service';
import { FileStorageService } from './file-storage.service';
import { SecurityConfig } from '../../types/security.types';
import { ProviderConfig, PROVIDER_DEFAULTS, ProviderConfigUtils } from '../../types/provider.types';
import { ContextConfig } from '../../types/ai.types';

/**
 * AI Assistant configuration interface
 */
export interface AiAssistantConfig {
    enabled: boolean;
    defaultProvider: string;
    chatHistoryEnabled: boolean;
    maxChatHistory: number;
    autoSaveChat: boolean;
    theme: 'light' | 'dark' | 'auto';
    language: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    security: SecurityConfig;
    providers: { [name: string]: ProviderConfig };
    hotkeys: {
        openChat: string;
        generateCommand: string;
        explainCommand: string;
    };
    ui: {
        showTooltips: boolean;
        compactMode: boolean;
        fontSize: number;
    };
    /** Agent execution engine. 'auto' picks Legacy for Anthropic/Claude
     *  providers (closest to native tool-use) and LangGraph for everyone
     *  else (planner+reviewer scaffolding helps weaker models). */
    agentEngine: 'auto' | 'langgraph' | 'legacy' | 'continue';
    /** Enable planner node in agent flow */
    agentPlannerEnabled: boolean;
    /** Enable reviewer node in agent flow */
    agentReviewerEnabled: boolean;
    /** Agent 最大执行轮数 */
    agentMaxRounds: number;
    /** Agent working directory (optional) */
    agentWorkingDir?: string;
}

const DEFAULT_CONFIG: AiAssistantConfig = {
    enabled: true,
    defaultProvider: 'openai',
    chatHistoryEnabled: true,
    maxChatHistory: 100,
    autoSaveChat: true,
    theme: 'auto',
    language: 'en-US',
    logLevel: 'info',
    security: {
        enablePasswordProtection: false,
        consentExpiryDays: 30,
        maxConsentAge: 30,
        enableRiskAssessment: true,
        autoApproveLowRisk: true,
        promptForMediumRisk: true,
        requirePasswordForHighRisk: true,
        dangerousPatterns: [
            'rm -rf /',
            'sudo rm -rf /',
            'format',
            'dd if=',
            '> /dev/null',
            'fork\\('
        ],
        allowedCommands: [],
        forbiddenCommands: []
    },
    providers: {},
    hotkeys: {
        openChat: 'Ctrl-Shift-A',
        generateCommand: 'Ctrl-Shift-G',
        explainCommand: 'Ctrl-Shift-E'
    },
    ui: {
        showTooltips: true,
        compactMode: false,
        fontSize: 14
    },
    agentEngine: 'auto',
    agentPlannerEnabled: true,
    agentReviewerEnabled: true,
    agentMaxRounds: 50,
    agentWorkingDir: ''
};

@Injectable({ providedIn: 'root' })
export class ConfigProviderService {
    private config: AiAssistantConfig = { ...DEFAULT_CONFIG };
    private configChange$ = new Subject<{ key: string; value: any }>();

    /** 文件存储键名 */
    private readonly STORAGE_FILENAME = 'config';

    constructor(
        private logger: LoggerService,
        private fileStorage: FileStorageService
    ) {
        this.loadConfig();
    }

    /**
     * 加载配置
     */
    private loadConfig(): void {
        this.config = this.readConfigFromStorage();
        if (this.config.language !== 'en-US') {
            this.config.language = 'en-US';
            this.saveConfig();
        }
    }

    /**
     * Reload config from storage and notify listeners.
     */
    reloadConfigFromStorage(): void {
        this.config = this.readConfigFromStorage();
        this.configChange$.next({ key: '*', value: this.config });
        this.logger.info('Configuration reloaded from file storage');
    }

    /**
     * Read config from storage with defaults.
     */
    private readConfigFromStorage(): AiAssistantConfig {
        try {
            const data = this.fileStorage.load<Partial<AiAssistantConfig>>(
                this.STORAGE_FILENAME,
                {}
            );

            if (Object.keys(data).length > 0) {
                this.logger.info('Configuration loaded from file storage');
                return { ...DEFAULT_CONFIG, ...data };
            }
            this.logger.info('No stored configuration found, using defaults');
            return { ...DEFAULT_CONFIG };
        } catch (error) {
            this.logger.error('Failed to load configuration', error);
            return { ...DEFAULT_CONFIG };
        }
    }

    /**
     * 保存配置
     */
    private saveConfig(): void {
        this.fileStorage.save(this.STORAGE_FILENAME, this.config);
        this.logger.debug('Configuration saved to file storage');
    }

    /**
     * 获取完整配置
     */
    getConfig(): AiAssistantConfig {
        return { ...this.config };
    }

    /**
     * 设置完整配置
     * Validates the proposed merge before writing — rejects obviously-bad
     * values (negative counts, broken URLs, out-of-range temperature) so
     * a malformed import or programmatic call can't corrupt the store.
     */
    setConfig(config: Partial<AiAssistantConfig>): void {
        const merged = { ...this.config, ...config };
        const check = this.validateIncomingConfig(merged);
        if (!check.valid) {
            this.logger.warn('Rejected configuration update: invalid values', { errors: check.errors });
            throw new Error(`Invalid configuration: ${check.errors.join(', ')}`);
        }
        this.config = merged;
        this.saveConfig();
        this.configChange$.next({ key: '*', value: this.config });
        this.logger.info('Configuration updated');
    }

    /**
     * 设置指定配置项
     * Validates the single-path update against a minimal schema so a
     * negative temperature / empty API key / malformed URL can't land.
     */
    set<T>(key: string, value: T): void {
        const issue = this.validateSettingValue(key, value);
        if (issue) {
            this.logger.warn('Rejected configuration setting', { key, issue });
            throw new Error(`Invalid value for "${key}": ${issue}`);
        }

        const keys = key.split('.');
        const lastKey = keys.pop()!;

        // 导航到父对象
        let target: any = this.config;
        for (const k of keys) {
            if (!(k in target) || typeof target[k] !== 'object') {
                target[k] = {};
            }
            target = target[k];
        }

        // 设置值
        target[lastKey] = value;
        this.saveConfig();
        this.configChange$.next({ key, value });

        this.logger.debug('Configuration item updated', { key, value });
    }

    /**
     * Minimal schema-level check for incoming config updates. Designed to
     * catch programmer bugs and malformed imports; NOT a replacement for
     * runtime validation of individual fields at their read site.
     */
    private validateIncomingConfig(cfg: Partial<AiAssistantConfig>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const providers: any = (cfg as any).providers;
        if (providers && typeof providers === 'object') {
            for (const [name, p] of Object.entries(providers)) {
                const issue = this.validateProviderFields(p as any);
                if (issue) errors.push(`providers.${name}: ${issue}`);
            }
        }
        if ((cfg as any).security?.consentExpiryDays !== undefined) {
            const v = (cfg as any).security.consentExpiryDays;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) {
                errors.push('security.consentExpiryDays must be a positive number');
            }
        }
        if ((cfg as any).maxChatHistory !== undefined) {
            const v = (cfg as any).maxChatHistory;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
                errors.push('maxChatHistory must be a non-negative number');
            }
        }
        return { valid: errors.length === 0, errors };
    }

    /**
     * Schema check for a single provider config entry. Returns a human
     * reason string when invalid, or `null` when fine.
     */
    private validateProviderFields(p: any): string | null {
        if (!p || typeof p !== 'object') return 'must be an object';
        if (p.baseURL !== undefined && p.baseURL !== '' && p.baseURL !== null) {
            if (typeof p.baseURL !== 'string') return 'baseURL must be a string';
            try { new URL(p.baseURL); } catch { return `baseURL "${p.baseURL}" is not a valid URL`; }
        }
        if (p.apiKey !== undefined && p.apiKey !== null) {
            if (typeof p.apiKey !== 'string') return 'apiKey must be a string';
        }
        if (p.temperature !== undefined && p.temperature !== null) {
            const v = p.temperature;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 2) {
                return 'temperature must be a number between 0 and 2';
            }
        }
        if (p.maxTokens !== undefined && p.maxTokens !== null) {
            const v = p.maxTokens;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 1_000_000) {
                return 'maxTokens must be a positive integer';
            }
        }
        if (p.timeout !== undefined && p.timeout !== null) {
            const v = p.timeout;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
                return 'timeout must be a non-negative number (ms)';
            }
        }
        return null;
    }

    /**
     * Lightweight per-path validation used by `set()`. Known paths are
     * checked against the schema; unknown paths pass through (the caller
     * is usually setting a plugin-specific key we shouldn't police).
     */
    private validateSettingValue(key: string, value: any): string | null {
        if (key.startsWith('providers.')) {
            const parts = key.split('.');
            // providers.<name>           (whole object)
            if (parts.length === 2) return this.validateProviderFields(value);
            // providers.<name>.<field>
            if (parts.length === 3) return this.validateProviderFields({ [parts[2]]: value });
        }
        if (key === 'security.consentExpiryDays') {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
                return 'must be a positive number';
            }
        }
        if (key === 'maxChatHistory') {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
                return 'must be a non-negative number';
            }
        }
        return null;
    }

    /**
     * 获取指定配置项
     */
    get<T>(key: string, defaultValue?: T): T {
        const keys = key.split('.');
        let target: any = this.config;
        for (const k of keys) {
            if (!target || typeof target !== 'object' || !(k in target)) {
                return defaultValue as T;
            }
            target = target[k];
        }
        return (target as T) ?? (defaultValue as T);
    }

    /**
     * 获取提供商配置
     */
    getProviderConfig(name: string): ProviderConfig | null {
        const raw = this.config.providers[name];
        if (!raw) {
            return null;
        }
        try {
            return ProviderConfigUtils.fillDefaults({ ...raw, name }, name);
        } catch {
            return raw;
        }
    }

    /**
     * 设置提供商配置
     */
    setProviderConfig(name: string, config: ProviderConfig): void {
        this.config.providers[name] = config;
        this.saveConfig();
        this.configChange$.next({ key: `providers.${name}`, value: config });
        this.logger.info('Provider configuration updated', { provider: name });
    }

    /**
     * 删除提供商配置
     */
    deleteProviderConfig(name: string): void {
        delete this.config.providers[name];
        this.saveConfig();
        this.configChange$.next({ key: `providers.${name}`, value: null });
        this.logger.info('Provider configuration deleted', { provider: name });
    }

    /**
     * 获取所有提供商配置
     * Includes both saved configs and providers from defaults
     */
    getAllProviderConfigs(): { [name: string]: ProviderConfig } {
        const savedConfigs = { ...this.config.providers };

        const allConfigs: { [name: string]: ProviderConfig } = {};

        // Fill defaults for saved configs first
        for (const [providerName, providerConfig] of Object.entries(savedConfigs)) {
            const defaults = PROVIDER_DEFAULTS[providerName];
            if (defaults) {
                allConfigs[providerName] = ProviderConfigUtils.fillDefaults({
                    ...providerConfig,
                    name: providerName
                }, providerName);
            } else {
                allConfigs[providerName] = providerConfig;
            }
        }

        // Include providers from defaults if they're not in saved config
        for (const providerName of Object.keys(PROVIDER_DEFAULTS)) {
            if (!allConfigs[providerName]) {
                allConfigs[providerName] = ProviderConfigUtils.fillDefaults({
                    name: providerName,
                    displayName: providerName.charAt(0).toUpperCase() + providerName.slice(1),
                    enabled: true
                }, providerName);
            }
        }

        return allConfigs;
    }

    /**
     * 获取活跃供应商的上下文窗口大小
     */
    getActiveProviderContextWindow(): number {
        const activeProvider = this.config.defaultProvider;
        if (!activeProvider) {
            return 200000; // 默认值
        }
        const providerConfig = this.getProviderConfig(activeProvider);
        const contextWindow = providerConfig?.contextWindow;
        if (contextWindow && contextWindow > 0) {
            return contextWindow;
        }
        // 从统一默认值获取
        const defaults = PROVIDER_DEFAULTS[activeProvider];
        return defaults?.contextWindow || 200000;
    }

    /**
     * 获取默认提供商
     */
    getDefaultProvider(): string {
        return this.config.defaultProvider;
    }

    /**
     * 设置默认提供商
     */
    setDefaultProvider(name: string): void {
        this.config.defaultProvider = name;
        this.saveConfig();
        this.configChange$.next({ key: 'defaultProvider', value: name });
        this.logger.info('Default provider changed', { provider: name });
    }

    /**
     * 获取安全配置
     */
    getSecurityConfig(): SecurityConfig {
        return { ...this.config.security };
    }

    /**
     * 更新安全配置
     */
    updateSecurityConfig(config: Partial<SecurityConfig>): void {
        this.config.security = { ...this.config.security, ...config };
        this.saveConfig();
        this.configChange$.next({ key: 'security', value: this.config.security });
        this.logger.info('Security configuration updated');
    }

    /**
     * 获取启用状态
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * 设置启用状态
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.saveConfig();
        this.configChange$.next({ key: 'enabled', value: enabled });
        this.logger.info('AI Assistant enabled state changed', { enabled });
    }

    /**
     * 获取日志级别
     */
    getLogLevel(): string {
        return this.config.logLevel;
    }

    /**
     * 设置日志级别
     */
    setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
        this.config.logLevel = level;
        this.saveConfig();
        this.configChange$.next({ key: 'logLevel', value: level });
        this.logger.info('Log level changed', { level });
    }

    /**
     * 重置为默认配置
     */
    reset(): void {
        this.config = { ...DEFAULT_CONFIG };
        this.saveConfig();
        this.configChange$.next({ key: '*', value: this.config });
        this.logger.info('Configuration reset to defaults');
    }

    /**
     * 订阅配置变化
     */
    onConfigChange(): Observable<{ key: string; value: any }> {
        return this.configChange$.asObservable();
    }

    /**
     * 导出配置
     */
    exportConfig(): string {
        // 排除敏感信息（如API密钥）
        const exportData = { ...this.config };
        if (exportData.providers) {
            Object.keys(exportData.providers).forEach(name => {
                if (exportData.providers[name].apiKey) {
                    exportData.providers[name].apiKey = '***MASKED***';
                }
            });
        }
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导入配置
     */
    importConfig(configJson: string): void {
        try {
            const imported = JSON.parse(configJson);
            this.setConfig(imported);
            this.logger.info('Configuration imported successfully');
        } catch (error) {
            this.logger.error('Failed to import configuration', error);
            throw new Error('Invalid configuration format');
        }
    }

    /**
     * 验证配置
     */
    validateConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // 验证默认提供商
        if (!this.config.providers[this.config.defaultProvider]) {
            errors.push('Default provider configuration not found');
        }

        // 验证安全配置
        if (this.config.security.consentExpiryDays < 1) {
            errors.push('Consent expiry days must be at least 1');
        }

        // 验证聊天历史配置
        if (this.config.maxChatHistory < 0) {
            errors.push('Max chat history must be non-negative');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ==================== 上下文配置 ====================

    /** 上下文配置存储键名 */
    private readonly CONTEXT_CONFIG_FILENAME = 'context-config';

    /** 自动压缩配置存储键名 */
    private readonly AUTO_COMPACT_FILENAME = 'auto-compact';

    /**
     * 获取上下文配置
     */
    getContextConfig(): ContextConfig | null {
        try {
            return this.fileStorage.load<ContextConfig | null>(
                this.CONTEXT_CONFIG_FILENAME,
                null
            );
        } catch {
            return null;
        }
    }

    /**
     * 设置上下文配置
     */
    setContextConfig(config: ContextConfig): void {
        this.fileStorage.save(this.CONTEXT_CONFIG_FILENAME, config);
    }

    /**
     * 获取自动压缩开关状态
     */
    isAutoCompactEnabled(): boolean {
        return this.fileStorage.load<boolean>(this.AUTO_COMPACT_FILENAME, true);
    }

    /**
     * 设置自动压缩开关状态
     */
    setAutoCompactEnabled(enabled: boolean): void {
        this.fileStorage.save(this.AUTO_COMPACT_FILENAME, enabled);
    }
}
