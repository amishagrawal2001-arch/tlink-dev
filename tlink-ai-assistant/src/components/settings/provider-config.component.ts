import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';
import { OllamaModelService, OllamaModel, ModelPullProgress } from '../../services/ollama/ollama-model.service';

@Component({
    selector: 'app-provider-config',
    templateUrl: './provider-config.component.html',
    styleUrls: ['./provider-config.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ProviderConfigComponent implements OnInit, OnDestroy {
    @Input() providerStatus: any = {};
    @Output() refreshStatus = new EventEmitter<void>();
    @Output() switchProvider = new EventEmitter<string>();

    // 暴露 Object 给模板使用
    Object = Object;

    selectedProvider = '';
    configs: { [key: string]: any } = {};
    expandedProvider: string = '';
    localStatus: { [key: string]: boolean } = {};
    passwordVisibility: { [key: string]: { [fieldKey: string]: boolean } } = {};

    // Ollama model management
    ollamaModels: OllamaModel[] = [];
    ollamaModelLoading = false;
    ollamaModelPulling: { [modelName: string]: boolean } = {};
    ollamaModelProgress: { [modelName: string]: ModelPullProgress } = {};
    newModelName = '';
    showModelManager = false;

    // OpenAI models cache
    openAiModels: string[] = [];
    openAiModelsLoading = false;

    // Groq models cache
    groqModels: { id: string; ownedBy?: string }[] = [];
    groqModelsLoading = false;

    // Deepseek models cache (legacy key: minimax)
    deepseekModels: { id: string; ownedBy?: string }[] = [];
    deepseekModelsLoading = false;

    // Tlink Agentic models cache
    proxyModels: { id: string; ownedBy?: string; provider?: string }[] = [];
    proxyModelsLoading = false;
    private lastProxyManualModel?: string;

    // 翻译对象
    t: any;

    // API Key 格式校验规则
    private apiKeyPatterns: { [key: string]: RegExp } = {
        // OpenAI keys include formats like sk-xxxxx, sk-proj-xxxxx; allow hyphens and varying lengths
        'openai': /^sk-[a-zA-Z0-9-]{20,}$/,
        'anthropic': /^sk-ant-[a-zA-Z0-9-]+$/,
        'minimax': /^[a-zA-Z0-9]{32,}$/,
        'glm': /^[a-zA-Z0-9._-]+$/
    };

    private destroy$ = new Subject<void>();

    private isAgentic(name: string): boolean {
        return name === 'tlink-agentic' || name === 'tlink-proxy' || name === 'tlink-agent';
    }

    private getAgenticConfig() {
        return this.configs['tlink-agentic'] || this.configs['tlink-proxy'] || this.configs['tlink-agent'];
    }

    private getAgenticKey(): 'tlink-agentic' | 'tlink-proxy' | 'tlink-agent' | undefined {
        if (this.configs['tlink-agentic']) return 'tlink-agentic';
        if (this.configs['tlink-agent']) return 'tlink-agent';
        if (this.configs['tlink-proxy']) return 'tlink-proxy';
        return undefined;
    }

    // 云端提供商模板
    cloudProviderTemplates = {
        'openai': {
            name: 'OpenAI',
            description: 'OpenAI GPT Models',
            icon: 'fa-robot',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.openai.com/v1', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'gpt-4', required: false, placeholder: '例如: gpt-4, gpt-4-turbo, gpt-3.5-turbo' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'GPT-4: 128000, GPT-3.5: 16385' }
            ]
        },
        'anthropic': {
            name: 'Anthropic Claude',
            description: 'Anthropic Claude Models',
            icon: 'fa-comments',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.anthropic.com', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'claude-3-sonnet-20240229', required: false, placeholder: '例如: claude-3-opus, claude-3-sonnet' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 200000, required: false, placeholder: 'Claude 3: 200000' }
            ]
        },
        'minimax': {
            name: 'Deepseek',
            description: 'Deepseek AI Models',
            icon: 'fa-brain',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.deepseek.com', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'deepseek-chat', required: false, placeholder: '例如: deepseek-chat, deepseek-coder' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'Deepseek: 128000' }
            ]
        },
        'glm': {
            name: 'GLM (ChatGLM)',
            description: 'Zhipu AI ChatGLM Models',
            icon: 'fa-network-wired',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://open.bigmodel.cn/api/paas/v4', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'glm-4', required: false, placeholder: '例如: glm-4, glm-4-air, glm-4-flash' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'GLM-4: 128000' }
            ]
        },
        'openai-compatible': {
            name: 'OpenAI Compatible',
            description: 'Third-party services supporting OpenAI API format (e.g., DeepSeek, OneAPI, etc.)',
            icon: 'fa-plug',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: '', required: true, placeholder: '例如: https://api.deepseek.com/v1' },
                { key: 'model', label: 'Model', type: 'text', default: '', required: true, placeholder: '例如: deepseek-chat, gpt-3.5-turbo' },
                { key: 'disableStreaming', label: 'Disable Streaming', type: 'checkbox', default: false, required: false, placeholder: 'Check this if the service does not support streaming responses' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'Set according to model' }
            ]
        },
        'groq': {
            name: 'Groq',
            description: 'Groq API (OpenAI-compatible endpoints)',
            icon: 'fa-microchip',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'gsk_xxx' },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://api.groq.com/openai/v1', required: false, placeholder: 'https://api.groq.com/openai/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'llama-3.1-8b-instant', required: true, placeholder: '例如: llama-3.1-8b-instant, llama-3.3-70b-versatile' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 8192, required: false, placeholder: 'Set according to model' }
            ]
        },
        'tlink-agentic': {
            name: 'Tlink Agentic',
            description: 'Tlink Agentic gateway (no API key required, supports proxy tokens)',
            icon: 'fa-cloud',
            fields: [
                { key: 'apiKey', label: 'API Key (Not needed)', type: 'password', required: false },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:3052/v1', required: true, placeholder: '例如: http://localhost:3052/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'auto', required: false, placeholder: 'auto (proxy selects best model)' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'Default: 128000' }
            ]
        },
        'tlink-agent': {
            name: 'Tlink Agent',
            description: 'Tlink Agent gateway (alias of Tlink Agentic)',
            icon: 'fa-cloud',
            fields: [
                { key: 'apiKey', label: 'API Key (Not needed)', type: 'password', required: false },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:3052/v1', required: true, placeholder: '例如: http://localhost:3052/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'auto', required: false, placeholder: 'auto (proxy selects best model)' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'Default: 128000' }
            ]
        }
    };

    // 本地提供商模板（不需要 API Key）
    localProviderTemplates = {
        'ollama': {
            name: 'Ollama (Local)',
            description: 'Locally running Ollama service, supporting Llama, Qwen and other models',
            icon: 'fa-server',
            defaultURL: 'http://localhost:11434/v1',
            fields: [
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:11434/v1', required: true, placeholder: '例如: http://localhost:11434/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'llama3.1', required: false, placeholder: '例如: llama3.1, qwen2.5, mistral' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 8192, required: false, placeholder: 'Llama 3.1: 8192' }
            ]
        },
        'vllm': {
            name: 'vLLM (Local)',
            description: 'Locally running vLLM service, suitable for production deployment',
            icon: 'fa-database',
            defaultURL: 'http://localhost:8000/v1',
            fields: [
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:8000/v1', required: true, placeholder: '例如: http://localhost:8000/v1' },
                { key: 'apiKey', label: 'API Key (Optional)', type: 'password', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'meta-llama/Llama-3.1-8B', required: false, placeholder: 'HuggingFace 模型路径' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 8192, required: false, placeholder: 'Set according to actual model configuration' }
            ]
        }
    };

    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService,
        private toast: ToastService,
        private translate: TranslateService,
        private ollamaModelService: OllamaModelService
    ) {
        this.t = this.translate.t;
    }

    ngOnInit(): void {
        // 监听语言变化
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
        });

        this.loadConfigs();
        // Preload cloud model lists when keys are present
        this.preloadOpenAiModels();
        this.preloadGroqModels();
        this.preloadDeepseekModels();
        // 检测本地供应商状态
        this.checkLocalProviderStatus();
        // Load Ollama models if Ollama is configured
        this.loadOllamaModels();
    }

    async openExternal(url: string, event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        try {
            const target = this.resolveExternalUrl(url);
            const win: any = window as any;
            const shell = win?.electron?.shell || win?.require?.('electron')?.shell;
            const fs = win?.require?.('fs');

            if (shell) {
                if (target.isFile && target.filePath && shell.openPath) {
                    if (fs?.existsSync && !fs.existsSync(target.filePath)) {
                        this.logger.warn('Doc path not found, falling back to openExternal', { path: target.filePath });
                    } else {
                        const result = await shell.openPath(target.filePath);
                        if (!result) {
                            return;
                        }
                        this.logger.warn('Failed to open path, falling back to openExternal', { error: result });
                    }
                }
                if (shell.openExternal) {
                    await shell.openExternal(target.url);
                    return;
                }
            }

            window.open(target.url, '_blank', 'noopener');
        } catch (error) {
            this.logger.error('Failed to open external link', error);
            this.toast.error('Unable to open link. Please open it manually: ' + url);
            try {
                const fallback = this.resolveExternalUrl(url);
                window.open(fallback.url, '_blank', 'noopener');
            } catch (fallbackError) {
                this.logger.warn('Failed to open fallback URL', fallbackError);
            }
        }
    }


    private resolveExternalUrl(url: string): { url: string; isFile: boolean; filePath?: string } {
        const trimmed = url?.trim();
        if (!trimmed) {
            return { url, isFile: false };
        }
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
        if (hasScheme) {
            if (trimmed.startsWith('file://')) {
                const filePath = this.safeFilePathFromUrl(trimmed);
                return { url: trimmed, isFile: true, filePath };
            }
            return { url: trimmed, isFile: false };
        }
        try {
            const win: any = window as any;
            const path = win?.require?.('path');
            const urlModule = win?.require?.('url');
            const fs = win?.require?.('fs');
            const cwd = win?.process?.cwd?.();
            if (path && cwd) {
                const directPath = path.resolve(cwd, trimmed);
                const pluginPath = path.resolve(cwd, 'tlink-ai-assistant', trimmed);
                const finalPath = (fs?.existsSync && fs.existsSync(directPath))
                    ? directPath
                    : (fs?.existsSync && fs.existsSync(pluginPath))
                        ? pluginPath
                        : directPath;

                if (urlModule?.pathToFileURL) {
                    return { url: urlModule.pathToFileURL(finalPath).toString(), isFile: true, filePath: finalPath };
                }
                return { url: `file://${finalPath}`, isFile: true, filePath: finalPath };
            }
        } catch (error) {
            this.logger.warn('Failed to resolve local doc path', error);
        }
        try {
            return { url: new URL(trimmed, window.location.href).toString(), isFile: false };
        } catch {
            return { url: trimmed, isFile: false };
        }
    }

    private safeFilePathFromUrl(fileUrl: string): string | undefined {
        try {
            const win: any = window as any;
            const urlModule = win?.require?.('url');
            if (urlModule?.fileURLToPath) {
                return urlModule.fileURLToPath(fileUrl);
            }
        } catch (error) {
            this.logger.warn('Failed to parse file URL', error);
        }
        return fileUrl.replace(/^file:\/\//, '');
    }

    /**
     * Return only the currently active Ollama model (if one is selected).
     * This keeps the list focused on the in-use model instead of all installed models.
     */
    getActiveOllamaModels(): OllamaModel[] {
        const activeName = this.configs['ollama']?.model;
        if (!activeName) {
            return this.ollamaModels;
        }
        return this.ollamaModels.filter(m => m.name === activeName);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 加载配置
     */
    private loadConfigs(): void {
        const allConfigs = this.config.getAllProviderConfigs();

        // Migrate legacy id tlink-proxy to tlink-agentic
        if (allConfigs['tlink-proxy'] && !allConfigs['tlink-agentic']) {
            allConfigs['tlink-agentic'] = { ...allConfigs['tlink-proxy'], name: 'tlink-agentic' };
        }
        if (allConfigs['tlink-proxy'] && allConfigs['tlink-agentic']) {
            // Remove the legacy entry to avoid duplicate provider rows in the UI
            delete allConfigs['tlink-proxy'];
        }
        // Update default provider if legacy id
        const defaultProvider = this.config.getDefaultProvider();
        if (defaultProvider === 'tlink-proxy') {
            this.config.setDefaultProvider('tlink-agentic');
        }

        // 为所有云端供应商初始化默认配置
        for (const providerName of Object.keys(this.cloudProviderTemplates)) {
            if (!allConfigs[providerName]) {
                const template = this.cloudProviderTemplates[providerName];
                allConfigs[providerName] = {
                    name: providerName,
                    displayName: template.name,
                    enabled: false,
                    ...this.createDefaultConfig(template.fields)
                };
            }
        }

        // 为所有本地供应商初始化默认配置
        for (const providerName of Object.keys(this.localProviderTemplates)) {
            if (!allConfigs[providerName]) {
                const template = this.localProviderTemplates[providerName];
                allConfigs[providerName] = {
                    name: providerName,
                    displayName: template.name,
                    enabled: false,
                    ...this.createDefaultConfig(template.fields)
                };
            }
        }

        this.configs = allConfigs;
        const sel = this.config.getDefaultProvider();
        this.selectedProvider = (sel === 'tlink-proxy') ? 'tlink-agentic' : sel;
    }

    /**
     * 切换展开/折叠
     */
    toggleExpand(providerName: string): void {
        this.expandedProvider = this.expandedProvider === providerName ? '' : providerName;
    }

    /**
     * 检查是否是本地提供商
     */
    isLocalProvider(providerName: string): boolean {
        return providerName in this.localProviderTemplates;
    }

    /**
     * 检测本地供应商状态
     */
    private async checkLocalProviderStatus(): Promise<void> {
        for (const name of Object.keys(this.localProviderTemplates)) {
            const wasOnline = this.localStatus[name];
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                const cfg = this.configs[name];
                const base = cfg?.baseURL || this.localProviderTemplates[name]?.defaultURL;
                if (!base) {
                    this.localStatus[name] = false;
                    continue;
                }
                const trimmedBase = base.replace(/\/+$/, '');
                let url = trimmedBase;
                if (name === 'ollama') {
                    if (/\/v1(\/|$)/.test(trimmedBase) || trimmedBase.endsWith('/models')) {
                        url = trimmedBase.endsWith('/models') ? trimmedBase : `${trimmedBase}/models`;
                    } else {
                        url = `${trimmedBase}/api/tags`;
                    }
                } else {
                    url = trimmedBase.endsWith('/models') ? trimmedBase : `${trimmedBase}/models`;
                }

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);
                this.localStatus[name] = response.ok;
                
                // If Ollama just came online, load models
                if (name === 'ollama' && !wasOnline && response.ok) {
                    this.loadOllamaModels();
                }
            } catch {
                this.localStatus[name] = false;
            }
        }
    }

    /**
     * 获取本地供应商在线状态
     */
    getLocalStatus(providerName: string): { text: string; color: string; icon: string } {
        const isOnline = this.localStatus[providerName];
        return isOnline
            ? { text: 'Online', color: '#4caf50', icon: 'fa-check-circle' }
            : { text: 'Offline', color: '#f44336', icon: 'fa-times-circle' };
    }

    /**
     * 测试本地提供商连接
     */
    async testLocalProvider(providerName: string): Promise<void> {
        const template = this.localProviderTemplates[providerName];
        const baseURL = this.configs[providerName]?.baseURL || template?.defaultURL;

        if (!baseURL) {
            this.toast.error(this.t.providers.baseURL + ': ' + this.t.providers.testError);
            return;
        }

        const testingMessage = `${this.t.providers.testConnection} ${template.name}...`;
        this.logger.info(testingMessage);

        try {
            const trimmedBase = baseURL.replace(/\/+$/, '');
            const isOllama = providerName === 'ollama';
            const url = isOllama && !/\/v1(\/|$)/.test(trimmedBase) && !trimmedBase.endsWith('/models')
                ? `${trimmedBase}/api/tags`
                : (trimmedBase.endsWith('/models') ? trimmedBase : `${trimmedBase}/models`);

            const response = await fetch(url, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                this.toast.success(`${template.name}: ${this.t.providers.testSuccess}`);
                this.localStatus[providerName] = true;
                this.logger.info('Local provider test successful', { provider: providerName });
            } else {
                this.toast.error(`${this.t.providers.testFail}: ${response.status}`);
                this.localStatus[providerName] = false;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : this.t.providers.testError;
            this.toast.error(`${template.name}\n\n${this.t.providers.testError}\n${errorMessage}`);
            this.localStatus[providerName] = false;
            this.logger.error('Local provider test failed', { provider: providerName, error: errorMessage });
        }
    }

    /**
     * Determine whether an OpenAI model is suitable for chat/completions.
     * Filters out embeddings, tts/audio, moderation, image, search/realtime/transcribe,
     * whisper, codex/completions, and obvious non-chat placeholders.
     */
    private isLikelyChatOpenAiModel(model: string | undefined): boolean {
        if (!model) return true;
        const m = model.toLowerCase();
        const forbiddenSubstrings = [
            'embedding',
            'tts',
            'audio',
            'moderation',
            'image',
            'dall-e',
            'realtime',
            'search',
            'transcribe',
            'whisper',
            'codex',
            'completion'
        ];
        if (forbiddenSubstrings.some(s => m.includes(s))) return false;
        if (m.startsWith('text-')) return false;
        return true;
    }

    /**
     * Allowlist of chat-friendly OpenAI models we expose in the dropdown.
     */
    private isAllowedChatModel(model: string | undefined): boolean {
        if (!model) return false;
        const allowed = [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4.1',
            'gpt-4.1-mini',
            'gpt-4-turbo',
            'gpt-3.5-turbo',
            'gpt-4' // keep legacy base for safety
        ];
        return allowed.includes(model);
    }

    /**
     * 保存配置
     */
    saveConfig(providerName: string): void {
        const providerConfig = this.configs[providerName];
        if (providerConfig) {
            if (providerName === 'openai') {
                const model = providerConfig.model;
                if (!this.isLikelyChatOpenAiModel(model)) {
                    this.toast.error('Selected model is not supported for chat/completions. Please choose a chat model.');
                    this.logger.warn('Blocked saving non-chat OpenAI model', { model });
                    return;
                }
            }
            this.config.setProviderConfig(providerName, providerConfig);
            this.logger.info('Provider config saved', { provider: providerName });
            this.toast.success(`${this.getProviderTemplate(providerName)?.name || providerName} ${this.t.providers.configSaved || '配置已保存'}`);
        }
    }

    /**
     * 添加提供商
     */
    addProvider(providerName: string): void {
        if (!this.configs[providerName]) {
            // 检查是云端还是本地提供商
            let template = this.cloudProviderTemplates[providerName];
            if (!template) {
                template = this.localProviderTemplates[providerName];
            }
            if (template) {
                const newConfig = {
                    name: providerName,
                    displayName: template.name,
                    enabled: true,
                    ...this.createDefaultConfig(template.fields)
                };
                this.configs[providerName] = newConfig;
                this.saveConfig(providerName);
            }
        }
    }

    /**
     * 删除提供商
     */
    removeProvider(providerName: string): void {
        if (confirm(this.t.providers.deleteConfirm)) {
            delete this.configs[providerName];
            this.config.deleteProviderConfig(providerName);
            this.logger.info('Provider config removed', { provider: providerName });
        }
    }

    /**
     * 切换提供商启用状态
     */
    toggleProviderEnabled(providerName: string): void {
        if (this.configs[providerName]) {
            const wasEnabled = this.configs[providerName].enabled !== false;
            this.configs[providerName].enabled = !this.configs[providerName].enabled;
            const isNowEnabled = this.configs[providerName].enabled !== false;
            
            this.saveConfig(providerName);
            
            // If disabling the current active provider, switch to another enabled provider
            if (!isNowEnabled && wasEnabled) {
                const currentDefault = this.config.getDefaultProvider();
                if (currentDefault === providerName) {
                    // Find another enabled provider
                    const enabledProviders = Object.keys(this.configs).filter(key => {
                        const config = this.configs[key];
                        return config && config.enabled !== false && key !== providerName;
                    });
                    
                    if (enabledProviders.length > 0) {
                        // Switch to the first available enabled provider
                        const newProvider = enabledProviders[0];
                        this.config.setDefaultProvider(newProvider);
                        this.switchProvider.emit(newProvider);
                        this.logger.info('Switched to another provider after disabling current', {
                            disabled: providerName,
                            switchedTo: newProvider
                        });
                    } else {
                        // No other enabled providers, clear default
                        this.config.setDefaultProvider('');
                        this.switchProvider.emit('');
                        this.logger.warn('No enabled providers available after disabling', { disabled: providerName });
                    }
                }
            }
        }
    }

    /**
     * 测试连接
     */
    async testConnection(providerName: string): Promise<void> {
        const providerConfig = this.configs[providerName];
        if (!providerConfig) {
            this.toast.error(this.t.providers.testError);
            return;
        }

        // 本地提供商使用不同的测试方法
        if (this.isLocalProvider(providerName)) {
            await this.testLocalProvider(providerName);
            return;
        }

        const apiKey = providerConfig.apiKey;
        const baseURL = providerConfig.baseURL;

        if (!apiKey) {
            this.toast.error(this.t.providers.apiKey + ': ' + this.t.providers.testError);
            return;
        }

        const template = this.cloudProviderTemplates[providerName];
        const providerDisplayName = template?.name || providerName;

        // 显示测试中状态
        const testingMessage = `${this.t.providers.testConnection} ${providerDisplayName}...`;
        this.logger.info(testingMessage);

        try {
            // 构造测试请求
            const testEndpoint = this.getTestEndpoint(providerName, baseURL);
            const headers = this.getTestHeaders(providerName, apiKey, baseURL);
            const body = this.getTestBody(providerName, baseURL);
            const method = providerName === 'openai' ? 'GET' : 'POST';

            // Retry lightly on 429s to smooth out burst limits
            const maxAttempts = 3;
            let attempt = 0;
            let response: Response | null = null;
            let lastErrorText = '';

            while (attempt < maxAttempts) {
                attempt++;
                const fetchOptions: RequestInit = {
                    method,
                    headers
                };

                if (method === 'POST') {
                    fetchOptions.body = JSON.stringify(body);
                }

                response = await fetch(testEndpoint, fetchOptions);

                if (response.status !== 429 || attempt === maxAttempts) {
                    break;
                }

                this.logger.warn('Connection test rate limited, retrying', {
                    provider: providerName,
                    status: response.status,
                    attempt
                });
                lastErrorText = await response.text();
                await this.sleep(500 * attempt); // exponential-ish backoff with jitter-free simple delay
            }

            if (response && response.ok) {
                this.toast.success(this.t.providers.testSuccess);
                this.logger.info('Connection test successful', { provider: providerName });
            } else if (response) {
                const errorData = lastErrorText || (await response.text());
                this.toast.error(`${this.t.providers.testFail}\n\nStatus: ${response.status}\n${errorData.substring(0, 200)}`);
                this.logger.error('Connection test failed', { provider: providerName, status: response.status });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : this.t.providers.testError;
            this.toast.error(`${this.t.providers.testFail}\n\n${errorMessage}`);
            this.logger.error('Connection test error', { provider: providerName, error: errorMessage });
        }
    }

    /**
     * 获取测试端点
     */
    private getTestEndpoint(providerName: string, baseURL: string): string {
        // 检查 baseURL 是否包含 anthropic 路径（如 Minimax 的 Anthropic 兼容接口）
        const isAnthropicCompatible = baseURL.includes('/anthropic');

        if (isAnthropicCompatible) {
            return `${baseURL}/v1/messages`;
        }

        if (this.isAgentic(providerName)) {
            const cleanBase = (baseURL || '').replace(/\/$/, '');
            if (cleanBase.endsWith('/v1')) {
                return `${cleanBase}/chat/completions`;
            }
            return `${cleanBase}/v1/chat/completions`;
        }

        switch (providerName) {
            case 'openai':
                // Use models endpoint to avoid consuming RPM/TPM on a chat request during tests
                return `${baseURL}/models`;
            case 'anthropic':
                return `${baseURL}/v1/messages`;
            case 'glm':
                return `${baseURL}/chat/completions`;
            default:
                return `${baseURL}/v1/chat/completions`;
        }
    }

    /**
     * 获取测试请求头
     */
    private getTestHeaders(providerName: string, apiKey: string, baseURL: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // 检查是否使用 Anthropic 兼容接口
        const isAnthropicCompatible = baseURL.includes('/anthropic') || providerName === 'anthropic';

        if (isAnthropicCompatible) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
    }

    /**
     * 获取测试请求体
     */
    private getTestBody(providerName: string, baseURL: string): any {
        // 检查是否使用 Anthropic 兼容接口
        const isAnthropicCompatible = baseURL.includes('/anthropic') || providerName === 'anthropic';

        if (isAnthropicCompatible) {
            return {
                model: this.configs[providerName]?.model || 'claude-3-sonnet-20240229',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
            };
        }

        const defaultModel = this.isAgentic(providerName)
            ? 'auto'
            : providerName === 'openai'
                ? 'gpt-4o-mini'
                : 'gpt-3.5-turbo';

        return {
            model: this.configs[providerName]?.model || defaultModel,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
        };
    }

    /**
     * Simple async sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
    * Refresh Groq models from /models endpoint and populate dropdown
    */
    async refreshGroqModels(silent: boolean = false): Promise<void> {
        const providerConfig = this.configs['groq'];
        if (!providerConfig || !providerConfig.apiKey) {
            if (!silent) {
                this.toast.error('Please set Groq API key first');
            }
            return;
        }

        const baseURL = (providerConfig.baseURL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
        this.groqModelsLoading = true;
        this.logger.info('Refreshing Groq models...', { baseURL, silent });

        try {
            const resp = await fetch(`${baseURL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${providerConfig.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Status ${resp.status}: ${text.substring(0, 200)}`);
            }

            const data = await resp.json();
            const models: { id: string; ownedBy?: string }[] = (data?.data || [])
                .map((m: any) => {
                    const id = m?.id as string | undefined;
                    const ownedBy = m?.owned_by as string | undefined;
                    return id && id.trim().length > 0 ? { id, ownedBy } : undefined;
                })
                .filter((m: { id: string; ownedBy?: string } | undefined): m is { id: string; ownedBy?: string } => !!m);

            // Deduplicate by id, keep first occurrence of ownedBy
            const seen = new Set<string>();
            const uniqueModels: { id: string; ownedBy?: string }[] = [];
            models.forEach(m => {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    uniqueModels.push(m);
                }
            });
            uniqueModels.sort((a, b) => a.id.localeCompare(b.id));
            this.groqModels = uniqueModels;

            // Auto-populate the model field if it's empty
            if (!providerConfig.model && uniqueModels.length > 0) {
                this.configs['groq'].model = uniqueModels[0].id;
            }

            // Log full model list for debugging/filtering
            this.logger.info('Groq models list', { models: uniqueModels });

            if (!silent) {
                this.toast.success(`Loaded ${uniqueModels.length} Groq models`);
            }
            this.logger.info('Groq models refreshed', { count: uniqueModels.length, silent });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to refresh models: ${message.substring(0, 200)}`);
            }
            this.logger.error('Groq models refresh failed', { error: message });
        } finally {
            this.groqModelsLoading = false;
        }
    }

    /**
     * Refresh Deepseek (legacy key: minimax) models from /v1/models
     */
    async refreshDeepseekModels(silent: boolean = false): Promise<void> {
        const providerConfig = this.configs['minimax'];
        if (!providerConfig || !providerConfig.apiKey) {
            if (!silent) {
                this.toast.error('Please set Deepseek API key first');
            }
            return;
        }

        const baseURL = (providerConfig.baseURL || 'https://api.deepseek.com').replace(/\/$/, '');
        this.deepseekModelsLoading = true;
        this.logger.info('Refreshing Deepseek models...', { baseURL, silent });

        try {
            const resp = await fetch(`${baseURL}/v1/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${providerConfig.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Status ${resp.status}: ${text.substring(0, 200)}`);
            }

            const data = await resp.json();
            const models: { id: string; ownedBy?: string }[] = (data?.data || [])
                .map((m: any) => {
                    const id = m?.id as string | undefined;
                    const ownedBy = m?.owned_by as string | undefined;
                    return id && id.trim().length > 0 ? { id, ownedBy } : undefined;
                })
                .filter((m: { id: string; ownedBy?: string } | undefined): m is { id: string; ownedBy?: string } => !!m);

            const seen = new Set<string>();
            const uniqueModels: { id: string; ownedBy?: string }[] = [];
            models.forEach(m => {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    uniqueModels.push(m);
                }
            });
            uniqueModels.sort((a, b) => a.id.localeCompare(b.id));
            this.deepseekModels = uniqueModels;

            if (!providerConfig.model && uniqueModels.length > 0) {
                this.configs['minimax'].model = uniqueModels[0].id;
            }

            this.logger.info('Deepseek models list', { models: uniqueModels });

            if (!silent) {
                this.toast.success(`Loaded ${uniqueModels.length} Deepseek models`);
            }
            this.logger.info('Deepseek models refreshed', { count: uniqueModels.length, silent });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to refresh models: ${message.substring(0, 200)}`);
            }
            this.logger.error('Deepseek models refresh failed', { error: message });
        } finally {
            this.deepseekModelsLoading = false;
        }
    }

    /**
     * Preload Deepseek models on init if an API key is already configured.
     */
    private preloadDeepseekModels(): void {
        if (this.deepseekModels.length > 0) {
            return;
        }
        const providerConfig = this.configs['minimax'];
        if (!providerConfig?.apiKey) {
            return;
        }
        this.refreshDeepseekModels(true).catch(err => {
            this.logger.warn('Deepseek models preload failed', { error: err?.message || err });
        });
    }

    /**
     * Preload Groq models on init if an API key is already configured so users
     * don’t need to click refresh after app restart.
     */
    private preloadGroqModels(): void {
        if (this.groqModels.length > 0) {
            return;
        }
        const providerConfig = this.configs['groq'];
        if (!providerConfig?.apiKey) {
            return;
        }
        // Fire and forget; errors are logged but not toasted.
        this.refreshGroqModels(true).catch(err => {
            this.logger.warn('Groq models preload failed', { error: err?.message || err });
        });
    }

    /**
     * Check if a Groq model id is already in the fetched list.
     * Used to avoid arrow functions in templates (Angular template parser restriction).
     */
    isGroqModelKnown(modelId: string | undefined): boolean {
        if (!modelId) {
            return false;
        }
        return this.groqModels.some(m => m.id === modelId);
    }

    /**
     * Check if a Deepseek model id is already in the fetched list.
     */
    isDeepseekModelKnown(modelId: string | undefined): boolean {
        if (!modelId) {
            return false;
        }
        return this.deepseekModels.some(m => m.id === modelId);
    }

    /**
     * Check if a proxy model id is already in the fetched list.
     */
    isProxyModelKnown(modelId: string | undefined): boolean {
        if (!modelId) {
            return false;
        }
        return this.proxyModels.some(m => m.id === modelId);
    }

    /**
     * Whether the proxy model is currently set to auto.
     */
    isProxyModelAuto(): boolean {
        const current = this.getAgenticConfig()?.model;
        return typeof current === 'string' && current.toLowerCase() === 'auto';
    }

    /**
     * Toggle proxy auto-model mode.
     * When enabling auto, remember the last manual selection.
     * When disabling, restore the last manual selection or first available model.
     */
    setProxyAutoMode(enabled: boolean): void {
        const cfg = this.getAgenticConfig();
        if (!cfg) return;

        if (enabled) {
            if (cfg.model && !this.isProxyModelAuto()) {
                this.lastProxyManualModel = cfg.model;
            }
            cfg.model = 'auto';
        } else {
            const fallback = this.lastProxyManualModel || this.proxyModels[0]?.id;
            if (fallback) {
                cfg.model = fallback;
            }
        }
    }

    /**
     * Refresh Tlink Proxy models from /models endpoint on the proxy
     */
    async refreshTlinkProxyModels(silent: boolean = false): Promise<void> {
        const providerConfig = this.getAgenticConfig();
        if (!providerConfig || !providerConfig.baseURL) {
            if (!silent) {
                this.toast.error('Please set Tlink Agentic Base URL first');
            }
            return;
        }

        const baseURL = (providerConfig.baseURL || '').replace(/\/$/, '');
        this.proxyModelsLoading = true;
        this.logger.info('Refreshing Tlink Agentic models...', { baseURL, silent });

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (providerConfig.apiKey) {
                headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
            }

            const resp = await fetch(`${baseURL}/models`, {
                method: 'GET',
                headers
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Status ${resp.status}: ${text.substring(0, 200)}`);
            }

            const data = await resp.json();
            const models: { id: string; ownedBy?: string; provider?: string }[] = (data?.data || [])
                .map((m: any) => {
                    const id = m?.id as string | undefined;
                    if (!id || !id.trim()) return undefined;
                    const ownedBy = m?.owned_by as string | undefined;
                    const provider = m?.provider as string | undefined;
                    return { id, ownedBy, provider };
                })
                .filter((m: { id: string; ownedBy?: string; provider?: string } | undefined): m is { id: string; ownedBy?: string; provider?: string } => !!m);

            // Deduplicate by id, keep first occurrence with metadata
            const seen = new Set<string>();
            const uniqueModels: { id: string; ownedBy?: string; provider?: string }[] = [];
            models.forEach(m => {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    uniqueModels.push(m);
                }
            });
            uniqueModels.sort((a, b) => a.id.localeCompare(b.id));
            this.proxyModels = uniqueModels;

            if (!providerConfig.model && uniqueModels.length > 0) {
                const key = this.getAgenticKey();
                if (key) {
                    this.configs[key].model = uniqueModels[0].id;
                }
            }

            this.logger.info('Tlink Agentic models list', { models: uniqueModels });

            if (!silent) {
                this.toast.success(`Loaded ${uniqueModels.length} models`);
            }
            this.logger.info('Tlink Agentic models refreshed', { count: uniqueModels.length, silent });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to refresh models: ${message.substring(0, 200)}`);
            }
            this.logger.error('Tlink Agentic models refresh failed', { error: message });
        } finally {
            this.proxyModelsLoading = false;
        }
    }

    /**
     * Refresh OpenAI models from /models endpoint and populate dropdown
     */
    async refreshOpenAiModels(silent: boolean = false): Promise<void> {
        const providerConfig = this.configs['openai'];
        if (!providerConfig || !providerConfig.apiKey) {
            if (!silent) {
                this.toast.error('Please set OpenAI API key first');
            }
            return;
        }

        const baseURL = (providerConfig.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
        this.openAiModelsLoading = true;
        this.logger.info('Refreshing OpenAI models...', { baseURL, silent });

        try {
            const resp = await fetch(`${baseURL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${providerConfig.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Status ${resp.status}: ${text.substring(0, 200)}`);
            }

            const data = await resp.json();
            const models: string[] = (data?.data || [])
                .map((m: any) => m?.id as string | undefined)
                .filter((id: string | undefined): id is string => typeof id === 'string' && id.trim().length > 0);

            const uniqueModels: string[] = Array.from(new Set<string>(models)).sort();
            const filteredModels = uniqueModels.filter(m => this.isAllowedChatModel(m));
            this.openAiModels = filteredModels;

            // Auto-populate the model field if it's empty
            if (!providerConfig.model && filteredModels.length > 0) {
                this.configs['openai'].model = filteredModels[0];
            }

            // Log full model list for debugging/filtering
            this.logger.info('OpenAI models list', { models: uniqueModels, filtered: filteredModels });

            if (!silent) {
                this.toast.success(`Loaded ${filteredModels.length} chat models`);
            }
            this.logger.info('OpenAI models refreshed', { count: filteredModels.length, silent });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to refresh models: ${message.substring(0, 200)}`);
            }
            this.logger.error('OpenAI models refresh failed', { error: message });
        } finally {
            this.openAiModelsLoading = false;
        }
    }

    /**
     * Preload OpenAI models on init if an API key is already configured so users
     * don’t need to click refresh after app restart.
     */
    private preloadOpenAiModels(): void {
        if (this.openAiModels.length > 0) {
            return;
        }
        const providerConfig = this.configs['openai'];
        if (!providerConfig?.apiKey) {
            return;
        }
        // Fire and forget; errors are logged but not toasted.
        this.refreshOpenAiModels(true).catch(err => {
            this.logger.warn('OpenAI models preload failed', { error: err?.message || err });
        });
    }

    /**
     * 创建默认配置
     */
    private createDefaultConfig(fields: any[]): any {
        const config: any = {};
        fields.forEach(field => {
            if (field.default !== undefined) {
                config[field.key] = field.default;
            }
        });
        return config;
    }

    /**
     * 获取字段类型
     */
    getFieldType(field: any): string {
        return field.type || 'text';
    }

    /**
     * 获取选项
     */
    getFieldOptions(field: any): string[] {
        return field.options || [];
    }

    /**
     * 检查是否是密码字段
     */
    isPasswordField(field: any): boolean {
        return field.type === 'password';
    }

    /**
     * 检查是否必填
     */
    isRequired(field: any): boolean {
        return field.required;
    }

    /**
     * 获取提供商模板（支持云端和本地）
     */
    getProviderTemplate(providerName: string): any {
        return this.cloudProviderTemplates[providerName] || this.localProviderTemplates[providerName];
    }

    /**
     * 获取提供商图标
     */
    getProviderIcon(providerName: string): string {
        const template = this.getProviderTemplate(providerName);
        return template?.icon || 'fa-cog';
    }

    /**
     * 检查是否有配置
     */
    hasConfig(providerName: string): boolean {
        return !!this.configs[providerName];
    }

    /**
     * 获取配置值
     */
    getConfigValue(providerName: string, key: string, defaultValue: any = ''): any {
        return this.configs[providerName]?.[key] ?? defaultValue;
    }

    /**
     * 更新配置值
     */
    updateConfigValue(providerName: string, key: string, value: any): void {
        if (!this.configs[providerName]) {
            this.configs[providerName] = {};
        }
        this.configs[providerName][key] = value;
    }

    /**
     * 切换密码字段可见性
     */
    togglePasswordVisibility(providerName: string, fieldKey: string): void {
        if (!this.passwordVisibility[providerName]) {
            this.passwordVisibility[providerName] = {};
        }
        this.passwordVisibility[providerName][fieldKey] = !this.passwordVisibility[providerName][fieldKey];
    }

    /**
     * 获取密码字段可见性状态
     */
    isPasswordVisible(providerName: string, fieldKey: string): boolean {
        return this.passwordVisibility[providerName]?.[fieldKey] ?? false;
    }

    /**
     * 验证 API Key 格式
     */
    validateApiKeyFormat(providerName: string, apiKey: string): { valid: boolean; message: string } {
        if (!apiKey || apiKey.trim().length === 0) {
            return { valid: false, message: this.t?.providers?.apiKeyRequired || 'API Key cannot be empty' };
        }

        const pattern = this.apiKeyPatterns[providerName];
        if (pattern && !pattern.test(apiKey)) {
            const hints: { [key: string]: string } = {
                'openai': 'OpenAI API Key should start with sk-',
                'anthropic': 'Anthropic API Key should start with sk-ant-',
                'minimax': 'Deepseek API Key should be 32+ alphanumeric characters',
                'glm': 'GLM API Key format is incorrect'
            };
            return { valid: false, message: hints[providerName] || 'API Key format may be incorrect' };
        }

        return { valid: true, message: '' };
    }

    /**
     * 获取输入框的验证状态类
     */
    getInputValidationClass(providerName: string, fieldKey: string): string {
        if (fieldKey !== 'apiKey') return '';

        const value = this.configs[providerName]?.[fieldKey];
        if (!value || value.trim().length === 0) return '';

        const result = this.validateApiKeyFormat(providerName, value);
        return result.valid ? 'is-valid' : 'is-invalid';
    }

    /**
     * Load Ollama models
     */
    async loadOllamaModels(): Promise<void> {
        if (!this.localStatus['ollama']) {
            return;
        }

        try {
            this.ollamaModelLoading = true;
            const baseURL = this.configs['ollama']?.baseURL || 'http://localhost:11434';
            this.ollamaModelService.setBaseURL(baseURL);
            this.ollamaModels = await this.ollamaModelService.getInstalledModels();
            this.logger.info('Ollama models loaded', { count: this.ollamaModels.length });
        } catch (error) {
            this.logger.error('Failed to load Ollama models', error);
            this.toast.error('Failed to load Ollama models');
        } finally {
            this.ollamaModelLoading = false;
        }
    }

    /**
     * Pull a new Ollama model
     */
    async pullOllamaModel(): Promise<void> {
        if (!this.newModelName.trim()) {
            this.toast.error('Please enter a model name');
            return;
        }

        const modelName = this.newModelName.trim();
        this.ollamaModelPulling[modelName] = true;
        this.ollamaModelProgress[modelName] = {
            model: modelName,
            status: 'pulling',
            message: 'Starting download...',
            progress: 0
        };

        try {
            const baseURL = this.configs['ollama']?.baseURL || 'http://localhost:11434';
            this.ollamaModelService.setBaseURL(baseURL);

            this.ollamaModelService.pullModel(modelName).subscribe({
                next: (progress) => {
                    this.ollamaModelProgress[modelName] = progress;
                    // Log progress updates
                    if (progress.progress !== undefined && progress.progress > 0) {
                        this.logger.debug('Model pull progress', { 
                            model: modelName, 
                            progress: progress.progress,
                            status: progress.status,
                            message: progress.message
                        });
                    }
                },
                complete: () => {
                    this.ollamaModelPulling[modelName] = false;
                    // Clear progress after a short delay
                    setTimeout(() => {
                        delete this.ollamaModelProgress[modelName];
                    }, 2000);
                    this.toast.success(`Model "${modelName}" downloaded successfully`);
                    this.newModelName = '';
                    // Reload models list
                    this.loadOllamaModels();
                },
                error: (error) => {
                    this.ollamaModelPulling[modelName] = false;
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.toast.error(`Failed to download model: ${errorMessage}`);
                    this.logger.error('Model pull failed', { model: modelName, error });
                    // Clear progress on error
                    delete this.ollamaModelProgress[modelName];
                }
            });
        } catch (error) {
            this.ollamaModelPulling[modelName] = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.toast.error(`Failed to start model download: ${errorMessage}`);
            this.logger.error('Failed to start model pull', { model: modelName, error });
            delete this.ollamaModelProgress[modelName];
        }
    }

    /**
     * Check if any model is currently being pulled
     */
    isAnyModelPulling(): boolean {
        return Object.values(this.ollamaModelPulling).some(pulling => pulling === true);
    }

    /**
     * Get the currently pulling model name
     */
    getPullingModelName(): string | null {
        for (const [modelName, isPulling] of Object.entries(this.ollamaModelPulling)) {
            if (isPulling) {
                return modelName;
            }
        }
        return null;
    }

    /**
     * Delete an Ollama model
     */
    async deleteOllamaModel(modelName: string): Promise<void> {
        if (!confirm(`Are you sure you want to delete model "${modelName}"? This cannot be undone.`)) {
            return;
        }

        try {
            const baseURL = this.configs['ollama']?.baseURL || 'http://localhost:11434';
            this.ollamaModelService.setBaseURL(baseURL);
            await this.ollamaModelService.deleteModel(modelName);
            this.toast.success(`Model "${modelName}" deleted successfully`);
            // Reload models list
            await this.loadOllamaModels();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.toast.error(`Failed to delete model: ${errorMessage}`);
            this.logger.error('Failed to delete model', { model: modelName, error });
        }
    }

    /**
     * Use a model (set it as the current model)
     */
    useOllamaModel(modelName: string): void {
        if (this.configs['ollama']) {
            this.configs['ollama'].model = modelName;
            this.saveConfig('ollama');
            this.toast.success(`Switched to model "${modelName}"`);
        }
    }

    /**
     * Format model size
     */
    formatModelSize(bytes: number): string {
        return this.ollamaModelService.formatModelSize(bytes);
    }

    /**
     * Toggle model manager visibility
     */
    toggleModelManager(): void {
        this.showModelManager = !this.showModelManager;
        if (this.showModelManager) {
            this.loadOllamaModels();
        }
    }
}
