import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { AiProviderManagerService } from '../../services/core/ai-provider-manager.service';
import { ChatHistoryService } from '../../services/chat/chat-history.service';
import { UsageAggregatorService, UsageAggregate } from '../../services/core/usage-aggregator.service';
import { formatCost } from '../../utils/cost.utils';
import { OllamaModelService, OllamaModel, ModelPullProgress } from '../../services/ollama/ollama-model.service';
import { CircuitBreakerSnapshot } from '../../services/providers/circuit-breaker';
import { DocViewerComponent } from '../doc-viewer/doc-viewer.component';
// Bundled vLLM setup guide — webpack `asset/source` rule imports it as a
// raw string. Shipping the text inside the plugin bundle means the in-app
// viewer works in both dev and packaged installs with no filesystem lookup.
import vllmGuideMarkdown from '../../../README-vllm.md';

type TabbyModelKind = 'completion' | 'chat' | 'embedding';

interface TabbyCatalogModel {
    id: string;
    kind: TabbyModelKind;
}

interface TabbyInstalledModel {
    id: string;
    vendor: string;
    path: string;
    hasGgml: boolean;
}

interface TabbyModelConfigSelection {
    completion: string;
    chat: string;
    embedding: string;
}

@Component({
    selector: 'app-provider-config',
    templateUrl: './provider-config.component.html',
    styleUrls: ['./provider-config.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ProviderConfigComponent implements OnInit, OnDestroy {
    @Input() providerStatus: any = {};
    @Input() tabbyOnly = false;
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

    // Tabby models cache
    tabbyModels: { id: string; ownedBy?: string }[] = [];
    tabbyModelsLoading = false;
    tabbyInstalledModels: TabbyInstalledModel[] = [];
    tabbyInstalledModelsLoading = false;
    tabbyModelInstallInProgress = false;
    tabbyCatalogFilter: 'all' | TabbyModelKind = 'all';
    tabbySelectedCatalogModel = 'StarCoder-1B';
    tabbyCustomModelId = '';
    tabbyModelConfigLoading = false;
    tabbyModelConfigSaving = false;
    tabbyModelConfigPath = '';
    tabbyActiveModels: TabbyModelConfigSelection = {
        completion: 'StarCoder-1B',
        chat: 'Qwen2-1.5B-Instruct',
        embedding: 'Nomic-Embed-Text'
    };
    readonly tabbyCatalogModels: TabbyCatalogModel[] = [
        { id: 'StarCoder-1B', kind: 'completion' },
        { id: 'StarCoder-3B', kind: 'completion' },
        { id: 'StarCoder-7B', kind: 'completion' },
        { id: 'StarCoder2-3B', kind: 'completion' },
        { id: 'StarCoder2-7B', kind: 'completion' },
        { id: 'CodeLlama-7B', kind: 'completion' },
        { id: 'CodeLlama-13B', kind: 'completion' },
        { id: 'DeepSeekCoder-1.3B', kind: 'completion' },
        { id: 'DeepSeekCoder-6.7B', kind: 'completion' },
        { id: 'CodeGemma-2B', kind: 'completion' },
        { id: 'CodeGemma-7B', kind: 'completion' },
        { id: 'CodeQwen-7B', kind: 'completion' },
        { id: 'Qwen2.5-Coder-0.5B', kind: 'completion' },
        { id: 'Qwen2.5-Coder-1.5B', kind: 'completion' },
        { id: 'Qwen2.5-Coder-3B', kind: 'completion' },
        { id: 'Qwen2.5-Coder-7B', kind: 'completion' },
        { id: 'Qwen2.5-Coder-14B', kind: 'completion' },
        { id: 'Codestral-22B', kind: 'completion' },
        { id: 'DeepSeek-Coder-V2-Lite', kind: 'completion' },
        { id: 'Mistral-7B', kind: 'chat' },
        { id: 'CodeGemma-7B-Instruct', kind: 'chat' },
        { id: 'CodeQwen-7B-Chat', kind: 'chat' },
        { id: 'Qwen2.5-Coder-0.5B-Instruct', kind: 'chat' },
        { id: 'Qwen2.5-Coder-1.5B-Instruct', kind: 'chat' },
        { id: 'Qwen2.5-Coder-7B-Instruct', kind: 'chat' },
        { id: 'Qwen2.5-Coder-14B-Instruct', kind: 'chat' },
        { id: 'Qwen2.5-Coder-32B-Instruct', kind: 'chat' },
        { id: 'Qwen2-1.5B-Instruct', kind: 'chat' },
        { id: 'Qwen3-0.6B', kind: 'chat' },
        { id: 'Qwen3-1.7B', kind: 'chat' },
        { id: 'Qwen3-4B', kind: 'chat' },
        { id: 'Qwen3-8B', kind: 'chat' },
        { id: 'Qwen3-14B', kind: 'chat' },
        { id: 'Qwen3-32B', kind: 'chat' },
        { id: 'Qwen3-30B-A3B', kind: 'chat' },
        { id: 'Qwen3-235B-A22B', kind: 'chat' },
        { id: 'Codestral-22B', kind: 'chat' },
        { id: 'Yi-Coder-9B-Chat', kind: 'chat' },
        { id: 'Nomic-Embed-Text', kind: 'embedding' },
        { id: 'Jina-Embeddings-V2-Code', kind: 'embedding' }
    ];

    // Tlink Agentic models cache
    proxyModels: { id: string; ownedBy?: string; provider?: string }[] = [];
    proxyModelsLoading = false;
    private lastProxyManualModel?: string;

    // 翻译对象
    t: any;

    readonly tabbyInstallCommands = {
        brew: 'brew install tabbyml/tabby/tabby && brew services start tabby',
        windowsNative: `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'tabby_windows.zip'; $dest=Join-Path $env:LOCALAPPDATA 'Tlink\\\\Tabby'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/TabbyML/tabby/releases/latest/download/tabby_x86_64-windows-msvc-cpu.zip' -OutFile $zip; if(Test-Path $dest){Remove-Item $dest -Recurse -Force}; Expand-Archive -Path $zip -DestinationPath $dest -Force; $exe=Get-ChildItem -Path $dest -Filter tabby.exe -Recurse | Select-Object -First 1; if(-not $exe){throw 'tabby.exe not found in package'}; $config=Join-Path $env:USERPROFILE '.tabby\\\\config.toml'; $args=if(Test-Path $config){'serve'}else{'serve --model StarCoder-1B --chat-model Qwen2-1.5B-Instruct'}; Start-Process -FilePath $exe.FullName -ArgumentList $args -WindowStyle Hidden; Write-Output ('Tabby started from ' + $exe.FullName)"`,
        dockerUnix: 'docker run -d --name tabby -p 8080:8080 -v "$HOME/.tabby:/data" registry.tabbyml.com/tabbyml/tabby serve --model StarCoder-1B --chat-model Qwen2-1.5B-Instruct --device cpu --chat-device cpu',
        dockerUnixArmCompat: 'docker run -d --name tabby -p 8080:8080 -v "$HOME/.tabby:/data" --platform linux/amd64 registry.tabbyml.com/tabbyml/tabby serve --model StarCoder-1B --chat-model Qwen2-1.5B-Instruct --device cpu --chat-device cpu',
        dockerWindows: 'docker run -d --name tabby -p 8080:8080 -v "%USERPROFILE%\\\\.tabby:/data" registry.tabbyml.com/tabbyml/tabby serve --model StarCoder-1B --chat-model Qwen2-1.5B-Instruct --device cpu --chat-device cpu',
        dockerWindowsArmCompat: 'docker run -d --name tabby -p 8080:8080 -v "%USERPROFILE%\\\\.tabby:/data" --platform linux/amd64 registry.tabbyml.com/tabbyml/tabby serve --model StarCoder-1B --chat-model Qwen2-1.5B-Instruct --device cpu --chat-device cpu'
    };
    tabbyInstallInProgress = false;
    tabbyInstallMethod: 'native' | 'docker' | null = null;
    tabbyStartInProgress = false;
    tabbyRestartInProgress = false;
    tabbyStopInProgress = false;
    private readonly tabbyServerCommandTimeoutMs = 45_000;
    private readonly tabbyReachabilityRequestTimeoutMs = 3_000;

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

    isOllamaModelKnown(name: string | undefined): boolean {
        if (!name) return false;
        return this.ollamaModels.some(model => model.name === name);
    }

    private getAgenticConfig() {
        return this.configs['tlink-agentic'] || this.configs['tlink-agent'] || this.configs['tlink-proxy'];
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
                { key: 'model', label: 'Model', type: 'text', default: 'gpt-4', required: false, placeholder: 'e.g. gpt-4, gpt-4-turbo, gpt-3.5-turbo' },
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
                { key: 'model', label: 'Model', type: 'text', default: 'claude-3-sonnet-20240229', required: false, placeholder: 'e.g. claude-3-opus, claude-3-sonnet' },
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
                { key: 'model', label: 'Model', type: 'text', default: 'deepseek-chat', required: false, placeholder: 'e.g. deepseek-chat, deepseek-coder' },
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
                { key: 'model', label: 'Model', type: 'text', default: 'glm-4', required: false, placeholder: 'e.g. glm-4, glm-4-air, glm-4-flash' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'GLM-4: 128000' }
            ]
        },
        'openai-compatible': {
            name: 'OpenAI Compatible',
            description: 'Third-party services supporting OpenAI API format (e.g., DeepSeek, OneAPI, etc.)',
            icon: 'fa-plug',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: '', required: true, placeholder: 'e.g. https://api.deepseek.com/v1' },
                { key: 'model', label: 'Model', type: 'text', default: '', required: true, placeholder: 'e.g. deepseek-chat, gpt-3.5-turbo' },
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
                { key: 'model', label: 'Model', type: 'text', default: 'llama-3.1-8b-instant', required: true, placeholder: 'e.g. llama-3.1-8b-instant, llama-3.3-70b-versatile' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 8192, required: false, placeholder: 'Set according to model' }
            ]
        },
        'ollama-cloud': {
            name: 'Ollama Cloud',
            description: 'Ollama Cloud API (hosted models)',
            icon: 'fa-cloud',
            fields: [
                { key: 'apiKey', label: 'API Key', type: 'password', required: true },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'https://ollama.com/api', required: true, placeholder: 'https://ollama.com/api' },
                { key: 'model', label: 'Model', type: 'text', default: 'gpt-oss:120b', required: true, placeholder: 'e.g., gpt-oss:120b, gpt-oss:20b' },
                { key: 'disableStreaming', label: 'Disable Streaming', type: 'checkbox', default: true, required: false, placeholder: 'Recommended for Ollama Cloud' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'Set according to model' }
            ]
        },
        'tlink-agentic': {
            name: 'Tlink Agentic',
            description: 'Tlink Agentic gateway (no API key required, supports proxy tokens)',
            icon: 'fa-cloud',
            fields: [
                { key: 'apiKey', label: 'API Key (Not needed)', type: 'password', required: false },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:3052/v1', required: true, placeholder: 'e.g. http://localhost:3052/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'auto', required: false, placeholder: 'auto (proxy selects best model)' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 128000, required: false, placeholder: 'Default: 128000' }
            ]
        },
        'tabby': {
            name: 'Tabby',
            description: 'Self-hosted AI coding assistant from TabbyML (OpenAI-compatible)',
            icon: 'fa-code',
            fields: [
                { key: 'apiKey', label: 'API Key (Auth Token)', type: 'password', required: true, placeholder: 'Your Tabby auth token' },
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:8080', required: true, placeholder: 'e.g. http://localhost:8080' },
                { key: 'model', label: 'Model', type: 'text', default: 'default', required: false, placeholder: 'default (or specific model name)' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 16384, required: false, placeholder: 'Default: 16384' }
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
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:11434/v1', required: true, placeholder: 'e.g. http://localhost:11434/v1' },
                { key: 'model', label: 'Model', type: 'text', default: 'llama3.1', required: false, placeholder: 'e.g. llama3.1, qwen2.5, mistral' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 8192, required: false, placeholder: 'Llama 3.1: 8192' }
            ]
        },
        'vllm': {
            name: 'vLLM (Local)',
            description: 'Locally running vLLM service, suitable for production deployment',
            icon: 'fa-database',
            defaultURL: 'http://localhost:8000/v1',
            fields: [
                { key: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:8000/v1', required: true, placeholder: 'e.g. http://localhost:8000/v1' },
                { key: 'apiKey', label: 'API Key (Optional)', type: 'password', required: false },
                { key: 'model', label: 'Model', type: 'text', default: 'meta-llama/Llama-3.1-8B', required: false, placeholder: 'HuggingFace model path' },
                { key: 'contextWindow', label: 'Context Window', type: 'number', default: 8192, required: false, placeholder: 'Set according to actual model configuration' }
            ]
        }
    };

    constructor(
        private config: ConfigProviderService,
        private logger: LoggerService,
        private toast: ToastService,
        private translate: TranslateService,
        private ollamaModelService: OllamaModelService,
        private aiService: AiAssistantService,
        private modal: NgbModal,
        private providerManager: AiProviderManagerService,
        private chatHistory: ChatHistoryService,
        private usageAggregator: UsageAggregatorService,
    ) {
        this.t = this.translate.t;
    }

    /**
     * Per-provider lifetime usage cache. Built once per ngOnInit by
     * walking the entire chat history; pricing is computed via the
     * usage aggregator's per-message provider+model stamping. Reading
     * a provider's value during render is O(1) — the work happens
     * upfront, not per CD pass.
     */
    private providerUsageCache: Map<string, UsageAggregate> = new Map();

    /**
     * Build the lifetime-usage cache from the saved chat sessions.
     * Called from ngOnInit. Cheap (~1ms even for hundreds of
     * sessions) because all messages are already in memory.
     */
    private rebuildProviderUsageCache(): void {
        const all = this.chatHistory.getAllMessages();
        // Group messages by provider name, then aggregate each bucket.
        const byProvider: Record<string, typeof all> = {};
        for (const m of all) {
            const provider = m.metadata?.['provider'] as string | undefined;
            if (!provider) {continue;}
            if (!byProvider[provider]) {byProvider[provider] = [];}
            byProvider[provider].push(m);
        }
        this.providerUsageCache.clear();
        for (const [providerName, messages] of Object.entries(byProvider)) {
            this.providerUsageCache.set(providerName, this.usageAggregator.aggregate(messages));
        }
    }

    /**
     * Lifetime usage for a single provider. Returns null when there's
     * no recorded usage so the template can `*ngIf` the footer out
     * entirely (avoids a misleading "0 tokens · $0.00" badge).
     */
    getProviderLifetimeUsage(providerName: string): UsageAggregate | null {
        const agg = this.providerUsageCache.get(providerName);
        if (!agg || agg.totalTokens === 0) {return null;}
        return agg;
    }

    /** Pretty-format the lifetime cost string ("$1.23") for the
     *  template. Empty when zero (self-hosted providers). */
    formatProviderCost(providerName: string): string {
        const agg = this.providerUsageCache.get(providerName);
        if (!agg || agg.totalCost <= 0) {return '';}
        return formatCost(agg.totalCost);
    }

    /**
     * Read the per-provider circuit-breaker snapshot for UI badges.
     * Returns null for providers that aren't registered yet (the manager
     * only knows about providers wired through `registerProvider`).
     */
    getBreakerSnapshot(providerName: string): CircuitBreakerSnapshot | null {
        try {
            const provider = this.providerManager.getProvider(providerName);
            if (!provider || typeof (provider as any).getBreakerSnapshot !== 'function') {
                return null;
            }
            return (provider as any).getBreakerSnapshot();
        } catch {
            return null;
        }
    }

    /** True when a provider's breaker is OPEN — caller renders the badge. */
    isBreakerOpen(providerName: string): boolean {
        return this.getBreakerSnapshot(providerName)?.state === 'open';
    }

    /**
     * Approximate cooldown remaining in seconds. Cached fields would
     * require a 1Hz ticker; the snapshot read is cheap so we just
     * refresh on every render. Floors to the nearest second so the
     * badge text doesn't flicker every CD pass.
     */
    getBreakerCooldownSec(providerName: string): number {
        const snap = this.getBreakerSnapshot(providerName);
        if (!snap || snap.state !== 'open') {return 0;}
        return Math.max(0, Math.ceil(snap.remainingCooldownMs / 1000));
    }

    /** Manual reset hook — for the "Retry now" button next to the badge. */
    resetBreaker(providerName: string): void {
        try {
            const provider = this.providerManager.getProvider(providerName);
            if (provider && typeof (provider as any).resetBreaker === 'function') {
                (provider as any).resetBreaker();
                this.toast.success(`${providerName}: circuit breaker reset`);
            }
        } catch (e) {
            this.logger.warn('Failed to reset breaker', { provider: providerName, error: e });
        }
    }

    /**
     * Opens the vLLM setup guide in an in-app modal. Uses the markdown that
     * was bundled via webpack at build time — no filesystem access, works
     * identically in dev and packaged installs.
     */
    openVllmGuide(event?: Event): void {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        // backdrop: 'static' disables the click-outside-to-dismiss behaviour —
        // users must use the explicit Close button or Escape. Prevents
        // accidental dismissal while scrolling a long setup guide.
        const ref = this.modal.open(DocViewerComponent, { size: 'lg', scrollable: true, centered: true, backdrop: 'static' });
        ref.componentInstance.title = 'vLLM setup guide';
        ref.componentInstance.markdown = vllmGuideMarkdown;
    }

    /**
     * Turn a non-2xx response from an AI-provider models endpoint into a
     * human-readable error message. Corporate proxies (Zscaler, Squid,
     * generic gateways) commonly reply with a full HTML error page even when
     * the client asked for JSON — dumping 200 chars of that HTML into a
     * toast is useless and historically broke the toast component. Instead
     * we detect the HTML payload, hint at the likely cause, and fall back to
     * a plain-text slice only when the body is genuinely short-text.
     */
    private describeUpstreamError(status: number, body: string): string {
        const trimmed = (body ?? '').trim();
        const looksHtml = trimmed.startsWith('<') || trimmed.toLowerCase().includes('<!doctype');
        const zscaler = /zscaler/i.test(trimmed);
        if (looksHtml) {
            if (zscaler) {
                return `Status ${status}: blocked by Zscaler proxy. Ask IT to allow the provider's domain, or use a different network.`;
            }
            if (status === 407) return `Status ${status}: proxy authentication required.`;
            if (status === 504 || status === 502 || status === 503) {
                return `Status ${status}: gateway / proxy timeout. The request didn't reach the provider — likely a corporate firewall.`;
            }
            return `Status ${status}: upstream returned an HTML error page (likely a proxy / firewall block).`;
        }
        return `Status ${status}: ${trimmed.substring(0, 200)}`;
    }

    ngOnInit(): void {
        // 监听语言变化
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
        });

        this.rebuildProviderUsageCache();
        this.loadConfigs();
        // Preload cloud model lists when keys are present
        this.preloadOpenAiModels();
        this.preloadGroqModels();
        this.preloadDeepseekModels();
        this.preloadTabbyModels();
        this.refreshInstalledTabbyModels(undefined, true);
        this.loadTabbyModelConfig(undefined, true);
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

    copyCommand(command: string, label: string, event?: Event): void {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const successMessage = `${label} command copied`;
        const failMessage = 'Unable to copy command automatically. Please copy it manually.';

        if (!command?.trim()) {
            this.toast.error(failMessage);
            return;
        }

        const fallbackCopy = () => {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = command;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const copied = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (copied) {
                    this.toast.success(successMessage);
                } else {
                    this.toast.error(failMessage);
                }
            } catch {
                this.toast.error(failMessage);
            }
        };

        try {
            if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(command)
                    .then(() => this.toast.success(successMessage))
                    .catch(() => fallbackCopy());
                return;
            }
        } catch {
            // no-op, fallback below
        }

        fallbackCopy();
    }

    isInstallingTabby(method: 'native' | 'docker'): boolean {
        return this.tabbyInstallInProgress && this.tabbyInstallMethod === method;
    }

    isWindowsPlatform(): boolean {
        return this.getPlatform() === 'win32';
    }

    isMacPlatform(): boolean {
        return this.getPlatform() === 'darwin';
    }

    isNativeTabbyInstallSupported(): boolean {
        return this.isWindowsPlatform() || this.isMacPlatform();
    }

    getTabbyPrimaryInstallLabel(): string {
        if (!this.isNativeTabbyInstallSupported()) {
            return 'Direct install unsupported on this OS';
        }
        if (this.isWindowsPlatform()) {
            return this.isInstallingTabby('native')
                ? 'Installing via Tlink...'
                : 'Install via Tlink (Windows package)';
        }
        return this.isInstallingTabby('native')
            ? 'Installing via Tlink...'
            : 'Install via Tlink (Homebrew)';
    }

    getTabbyPrimaryInstallIcon(): string {
        return this.isInstallingTabby('native')
            ? 'fa-spinner fa-spin'
            : (this.isWindowsPlatform() ? 'fa-windows' : 'fa-download');
    }

    isStartingTabby(): boolean {
        return this.tabbyStartInProgress;
    }

    isRestartingTabby(): boolean {
        return this.tabbyRestartInProgress;
    }

    isStoppingTabby(): boolean {
        return this.tabbyStopInProgress;
    }

    getTabbyBaseUrl(): string {
        const rawBase = this.configs['tabby']?.baseURL || 'http://localhost:8080';
        return String(rawBase).trim().replace(/\/+$/, '');
    }

    private getTabbyServiceBaseUrl(): string {
        const base = this.getTabbyBaseUrl();
        return base
            .replace(/\/(v1beta|v1)$/i, '')
            .replace(/\/models$/i, '');
    }

    private getPreferredTabbyCompletionModel(): string {
        const completion = String(this.tabbyActiveModels?.completion || '').trim();
        if (completion && this.getTabbyModelKind(completion) === 'completion') {
            return completion;
        }

        const providerModel = String(this.configs['tabby']?.model || '').trim();
        if (providerModel && providerModel.toLowerCase() !== 'default' && this.getTabbyModelKind(providerModel) === 'completion') {
            return providerModel;
        }

        return this.getDefaultTabbyModelForKind('completion');
    }

    private getPreferredTabbyChatModel(): string {
        const chat = String(this.tabbyActiveModels?.chat || '').trim();
        if (chat && this.getTabbyModelKind(chat) === 'chat') {
            return chat;
        }

        const providerModel = String(this.configs['tabby']?.model || '').trim();
        if (providerModel && providerModel.toLowerCase() !== 'default' && this.getTabbyModelKind(providerModel) === 'chat') {
            return providerModel;
        }

        return this.getDefaultTabbyModelForKind('chat');
    }

    private runTabbyStartModelPrecheck(silent = false): void {
        if (silent) {
            return;
        }

        const selectedCompletion = String(this.tabbyActiveModels?.completion || '').trim();
        const selectedChat = String(this.tabbyActiveModels?.chat || '').trim();
        const resolvedCompletion = this.getPreferredTabbyCompletionModel();
        const resolvedChat = this.getPreferredTabbyChatModel();

        const warnings: string[] = [];
        if (selectedCompletion && selectedCompletion !== resolvedCompletion) {
            warnings.push(`Completion "${selectedCompletion}" is not a completion model.`);
        }
        if (selectedChat && selectedChat !== resolvedChat) {
            warnings.push(`Chat "${selectedChat}" is not a chat model.`);
        }

        if (!warnings.length) {
            return;
        }

        const message =
            `Tabby model pre-check: ${warnings.join(' ')} ` +
            `Using completion "${resolvedCompletion}" and chat "${resolvedChat}" for startup.`;
        this.toast.warning(message, 9000);
        this.logger.warn('Tabby model pre-check adjusted startup model selection', {
            selectedCompletion,
            selectedChat,
            resolvedCompletion,
            resolvedChat
        });
    }

    async startTabbyServer(event?: Event, silent = false): Promise<boolean> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyStartInProgress) {
            if (!silent) {
                this.toast.info('Tabby start is already in progress.');
            }
            return false;
        }
        if (this.tabbyRestartInProgress) {
            if (!silent) {
                this.toast.info('Tabby restart is already in progress.');
            }
            return false;
        }
        if (this.tabbyStopInProgress) {
            if (!silent) {
                this.toast.info('Tabby stop is already in progress.');
            }
            return false;
        }

        this.runTabbyStartModelPrecheck(silent);

        this.tabbyStartInProgress = true;
        if (!silent) {
            this.toast.info('Starting Tabby server...');
        }

        try {
            const command = this.getTabbyStartCommandForCurrentPlatform();
            const result = await this.executeShellCommand(command, undefined, this.tabbyServerCommandTimeoutMs);
            if (result.code !== 0) {
                const shortOutput = this.getTailOutput(result.output);
                const detail = shortOutput ? `\n\n${this.makeToastSafe(shortOutput)}` : '';
                if (!silent) {
                    this.toast.error(`Failed to start Tabby server.${detail}`, 9000);
                }
                this.logger.error('Tabby start command failed', {
                    code: result.code,
                    output: shortOutput
                });
                return false;
            }

            const reachable = await this.waitForTabbyReachability(20, 2000);
            if (reachable) {
                if (!silent) {
                    this.toast.success('Tabby server started and is reachable.');
                }
                return true;
            }

            if (!silent) {
                this.toast.warning('Tabby start command ran, but server is not reachable yet. Check ~/.tabby/tlink-tabby.log', 9000);
            }
            return false;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Unable to start Tabby server: ${message}`);
            }
            this.logger.error('Failed to start Tabby server', { error: message });
            return false;
        } finally {
            this.tabbyStartInProgress = false;
        }
    }

    async restartTabbyServer(event?: Event): Promise<boolean> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyRestartInProgress) {
            this.toast.info('Tabby restart is already in progress.');
            return false;
        }
        if (this.tabbyStartInProgress) {
            this.toast.info('Tabby start is already in progress.');
            return false;
        }
        if (this.tabbyInstallInProgress) {
            this.toast.info('Tabby install is in progress. Restart after it completes.');
            return false;
        }
        if (this.tabbyStopInProgress) {
            this.toast.info('Tabby stop is in progress. Restart after it completes.');
            return false;
        }

        this.runTabbyStartModelPrecheck(false);

        this.tabbyRestartInProgress = true;
        this.toast.info('Restarting Tabby server...');

        try {
            const command = this.getTabbyRestartCommandForCurrentPlatform();
            const result = await this.executeShellCommand(command, undefined, this.tabbyServerCommandTimeoutMs);
            if (result.code !== 0) {
                const shortOutput = this.getTailOutput(result.output);
                const detail = shortOutput ? `\n\n${this.makeToastSafe(shortOutput)}` : '';
                this.toast.error(`Failed to restart Tabby server.${detail}`, 9000);
                this.logger.error('Tabby restart command failed', {
                    code: result.code,
                    output: shortOutput
                });
                return false;
            }

            const reachable = await this.waitForTabbyReachability(20, 2000);
            if (reachable) {
                this.toast.success('Tabby server restarted and is reachable.');
                return true;
            }

            this.toast.warning('Tabby restart command ran, but server is not reachable yet. Check ~/.tabby/tlink-tabby.log', 9000);
            return false;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.toast.error(`Unable to restart Tabby server: ${message}`);
            this.logger.error('Failed to restart Tabby server', { error: message });
            return false;
        } finally {
            this.tabbyRestartInProgress = false;
        }
    }

    async stopTabbyServer(event?: Event): Promise<boolean> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyStopInProgress) {
            this.toast.info('Tabby stop is already in progress.');
            return false;
        }
        if (this.tabbyStartInProgress) {
            this.toast.info('Tabby start is in progress. Stop after it completes.');
            return false;
        }
        if (this.tabbyRestartInProgress) {
            this.toast.info('Tabby restart is in progress. Stop after it completes.');
            return false;
        }
        if (this.tabbyInstallInProgress) {
            this.toast.info('Tabby install is in progress. Stop after it completes.');
            return false;
        }

        this.tabbyStopInProgress = true;
        this.toast.info('Stopping Tabby server...');

        try {
            const command = this.getTabbyStopCommandForCurrentPlatform();
            const result = await this.executeShellCommand(command, undefined, this.tabbyServerCommandTimeoutMs);
            if (result.code !== 0) {
                const shortOutput = this.getTailOutput(result.output);
                const detail = shortOutput ? `\n\n${this.makeToastSafe(shortOutput)}` : '';
                this.toast.error(`Failed to stop Tabby server.${detail}`, 9000);
                this.logger.error('Tabby stop command failed', {
                    code: result.code,
                    output: shortOutput
                });
                return false;
            }

            const stopped = await this.waitForTabbyStopped(12, 1000);
            if (stopped) {
                this.toast.success('Tabby server stopped.');
                return true;
            }

            this.toast.warning('Tabby stop command ran, but service still appears reachable on configured URL.', 9000);
            return false;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.toast.error(`Unable to stop Tabby server: ${message}`);
            this.logger.error('Failed to stop Tabby server', { error: message });
            return false;
        } finally {
            this.tabbyStopInProgress = false;
        }
    }

    async openTabbyServerUrl(event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const base = this.getTabbyBaseUrl();
        if (!base) {
            this.toast.error('Tabby URL is empty. Set Base URL first.');
            return;
        }

        const webUrl = this.getTabbyWebUrl(base);
        await this.openExternal(webUrl);
    }

    private getTabbyWebUrl(baseURL: string): string {
        const trimmed = String(baseURL || '').trim().replace(/\/+$/, '');
        if (!trimmed) {
            return trimmed;
        }

        // Convert API endpoints to web root: /v1, /v1beta, /models
        return trimmed
            .replace(/\/(v1beta|v1)\/models$/i, '')
            .replace(/\/(v1beta|v1)$/i, '')
            .replace(/\/models$/i, '');
    }

    async installTabbyWithInstaller(method: 'native' | 'docker', event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyInstallInProgress) {
            this.toast.info('Tabby installation is already running. Please wait...');
            return;
        }

        const requestedMethod = method;
        let effectiveMethod: 'native' | 'docker' = method;
        if (requestedMethod === 'docker' && this.isMacPlatform()) {
            effectiveMethod = 'native';
            this.toast.info('Tabby Docker image requires NVIDIA CUDA and is not supported on macOS. Switching to Homebrew install.', 7000);
        }

        const methodLabel = this.getInstallMethodLabel(effectiveMethod);

        this.tabbyInstallInProgress = true;
        this.tabbyInstallMethod = effectiveMethod;
        this.toast.info(`Starting Tabby install via ${methodLabel}...`, 4000);

        try {
            if (effectiveMethod === 'docker') {
                const dockerReady = await this.ensureDockerReady();
                if (!dockerReady.ready) {
                    const dockerHint = dockerReady.message || this.getDockerFailureHint(dockerReady.output || '');
                    const fallback = 'Docker is not ready. Start Docker Desktop and retry.';
                    this.toast.error(dockerHint || fallback, 9000);
                    this.logger.warn('Docker not ready for Tabby installer', {
                        method: effectiveMethod,
                        output: this.getTailOutput(dockerReady.output || '')
                    });
                    return;
                }

                if (dockerReady.autoInstalled) {
                    this.toast.success('Docker Desktop installed and Docker daemon is ready.');
                } else if (dockerReady.autoStarted) {
                    this.toast.success('Docker Desktop started and Docker daemon is ready.');
                }

                await this.cleanupExistingTabbyDockerContainer();
            }

            const command = this.getDirectInstallCommand(effectiveMethod);

            this.logger.info('Running Tabby installer command', {
                method: effectiveMethod,
                requestedMethod,
                platform: this.getPlatform()
            });

            const result = await this.executeShellCommand(command);
            if (result.code === 0) {
                this.toast.success(`Tabby install command completed via ${methodLabel}.`);
                const reachable = await this.checkTabbyReachability();
                if (effectiveMethod === 'docker' && !reachable) {
                    await this.diagnoseDockerTabbyStartup();
                }
            } else {
                if (
                    effectiveMethod === 'native' &&
                    this.isMacPlatform() &&
                    this.isMacBrewServiceStartFailure(result.output)
                ) {
                    const recovered = await this.tryStartTabbyDirectlyOnMac();
                    if (recovered) {
                        return;
                    }
                }

                const shortOutput = this.getTailOutput(result.output);
                const dockerHint = effectiveMethod === 'docker'
                    ? this.getDockerFailureHint(result.output)
                    : null;
                const toastMessage = dockerHint || (
                    `Tabby install failed via ${methodLabel}.` +
                    (shortOutput ? `\n\n${this.makeToastSafe(shortOutput)}` : '')
                );
                this.toast.error(toastMessage, 9000);
                this.logger.error('Tabby installer command failed', {
                    method: effectiveMethod,
                    requestedMethod,
                    code: result.code,
                    output: shortOutput
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.toast.error(`Failed to run Tabby installer: ${message}`);
            this.logger.error('Failed to run Tabby installer command', {
                method: effectiveMethod,
                requestedMethod,
                error: message
            });
        } finally {
            this.tabbyInstallInProgress = false;
            this.tabbyInstallMethod = null;
        }
    }

    private getPlatform(): string {
        return String((window as any)?.process?.platform || '').toLowerCase();
    }

    private getArchitecture(): string {
        return String((window as any)?.process?.arch || '').toLowerCase();
    }

    isArm64Arch(): boolean {
        const arch = this.getArchitecture();
        return arch === 'arm64' || arch === 'aarch64';
    }

    private getInstallMethodLabel(method: 'native' | 'docker'): string {
        if (method === 'docker') {
            return 'Docker';
        }
        if (this.isWindowsPlatform()) {
            return 'Windows package';
        }
        return 'Homebrew';
    }

    private getDirectInstallCommand(method: 'native' | 'docker'): string {
        const platform = this.getPlatform();

        if (method === 'docker') {
            return this.getDockerCommandForCurrentPlatform();
        }

        if (platform === 'darwin') {
            return this.tabbyInstallCommands.brew;
        }

        if (platform === 'win32') {
            return this.tabbyInstallCommands.windowsNative;
        }

        throw new Error('Direct native install is supported on macOS and Windows. Use Docker on this platform.');
    }

    private getTabbyStartCommandForCurrentPlatform(): string {
        const platform = this.getPlatform();
        const completionModel = this.getPreferredTabbyCompletionModel();
        const chatModel = this.getPreferredTabbyChatModel();

        if (platform === 'darwin') {
            const deviceBackend = this.isArm64Arch() ? 'metal' : 'cpu';
            const escapedCompletionModel = this.quoteForPosixShell(completionModel);
            const escapedChatModel = this.quoteForPosixShell(chatModel);
            return [
                'TABBY_BIN="$(command -v tabby || true)"',
                'if [ -z "$TABBY_BIN" ] && [ -x "/opt/homebrew/bin/tabby" ]; then TABBY_BIN="/opt/homebrew/bin/tabby"; fi',
                'if [ -z "$TABBY_BIN" ] && [ -x "/usr/local/bin/tabby" ]; then TABBY_BIN="/usr/local/bin/tabby"; fi',
                'if [ -z "$TABBY_BIN" ]; then echo "tabby binary not found"; exit 1; fi',
                'mkdir -p "$HOME/.tabby"',
                'pkill -f "tabby serve" >/dev/null 2>&1 || true',
                'pkill -f "llama-server -m $HOME/.tabby/models/TabbyML/" >/dev/null 2>&1 || true',
                'sleep 1',
                'if lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then echo "tabby already listening on 8080"; exit 0; fi',
                `nohup "$TABBY_BIN" serve --model ${escapedCompletionModel} --chat-model ${escapedChatModel} --host 0.0.0.0 --port 8080 --device ${deviceBackend} --chat-device ${deviceBackend} > "$HOME/.tabby/tlink-tabby.log" 2>&1 < /dev/null &`,
                'echo "Started Tabby: $TABBY_BIN"'
            ].join('\n');
        }

        if (platform === 'win32') {
            const escapedCompletionModel = this.escapeForPowerShellSingleQuote(completionModel);
            const escapedChatModel = this.escapeForPowerShellSingleQuote(chatModel);
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "$tabby=(Get-Command tabby -ErrorAction SilentlyContinue); if(-not $tabby){ throw 'tabby binary not found in PATH' }; $args='serve --model ${escapedCompletionModel} --chat-model ${escapedChatModel} --host 0.0.0.0 --port 8080 --device cpu --chat-device cpu'; Start-Process -FilePath $tabby.Source -ArgumentList $args -WindowStyle Hidden; Write-Output ('Started Tabby: ' + $tabby.Source)"`;
        }

        throw new Error('Auto-start Tabby is supported on macOS and Windows in Tlink. Start Tabby manually on this OS.');
    }

    private getTabbyRestartCommandForCurrentPlatform(): string {
        const platform = this.getPlatform();

        if (platform === 'darwin') {
            return this.getTabbyStartCommandForCurrentPlatform();
        }

        if (platform === 'win32') {
            const completionModel = this.escapeForPowerShellSingleQuote(this.getPreferredTabbyCompletionModel());
            const chatModel = this.escapeForPowerShellSingleQuote(this.getPreferredTabbyChatModel());
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process tabby -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 750; $tabby=(Get-Command tabby -ErrorAction SilentlyContinue); if(-not $tabby){ throw 'tabby binary not found in PATH' }; $args='serve --model ${completionModel} --chat-model ${chatModel} --host 0.0.0.0 --port 8080 --device cpu --chat-device cpu'; Start-Process -FilePath $tabby.Source -ArgumentList $args -WindowStyle Hidden; Write-Output ('Restarted Tabby: ' + $tabby.Source)"`;
        }

        throw new Error('Auto-restart Tabby is supported on macOS and Windows in Tlink. Restart Tabby manually on this OS.');
    }

    private getTabbyStopCommandForCurrentPlatform(): string {
        const platform = this.getPlatform();

        if (platform === 'darwin') {
            return [
                'pkill -f "tabby serve" >/dev/null 2>&1 || true',
                'pkill -f "llama-server -m $HOME/.tabby/models/TabbyML/" >/dev/null 2>&1 || true',
                'sleep 1',
                'echo "Stop command sent for Tabby."'
            ].join('\n');
        }

        if (platform === 'win32') {
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process tabby -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 750; Write-Output 'Stop command sent for Tabby.'"`;
        }

        throw new Error('Auto-stop Tabby is supported on macOS and Windows in Tlink. Stop Tabby manually on this OS.');
    }

    private getTabbyDownloadCommandForCurrentPlatform(modelId: string): string {
        const platform = this.getPlatform();

        if (platform === 'win32') {
            const escapedModel = this.escapeForPowerShellSingleQuote(modelId);
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "$tabby=(Get-Command tabby -ErrorAction SilentlyContinue); if(-not $tabby){ throw 'tabby binary not found in PATH' }; & $tabby.Source download --model '${escapedModel}'; if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }"`;
        }

        const escapedModel = this.quoteForPosixShell(modelId);
        return [
            'TABBY_BIN="$(command -v tabby || true)"',
            'if [ -z "$TABBY_BIN" ] && [ -x "/opt/homebrew/bin/tabby" ]; then TABBY_BIN="/opt/homebrew/bin/tabby"; fi',
            'if [ -z "$TABBY_BIN" ] && [ -x "/usr/local/bin/tabby" ]; then TABBY_BIN="/usr/local/bin/tabby"; fi',
            'if [ -z "$TABBY_BIN" ]; then echo "tabby binary not found"; exit 1; fi',
            `"${'$'}TABBY_BIN" download --model ${escapedModel}`
        ].join('\n');
    }

    private quoteForPosixShell(raw: string): string {
        return `'${String(raw).replace(/'/g, `'\\''`)}'`;
    }

    private escapeForPowerShellSingleQuote(raw: string): string {
        return String(raw).replace(/'/g, "''");
    }

    getDockerCommandForCurrentPlatform(): string {
        const isArm64 = this.isArm64Arch();
        if (this.isWindowsPlatform()) {
            return isArm64
                ? this.tabbyInstallCommands.dockerWindowsArmCompat
                : this.tabbyInstallCommands.dockerWindows;
        }

        return isArm64
            ? this.tabbyInstallCommands.dockerUnixArmCompat
            : this.tabbyInstallCommands.dockerUnix;
    }

    private executeShellCommand(command: string, cwd?: string, timeoutMs?: number): Promise<{ code: number | null; output: string }> {
        return new Promise((resolve, reject) => {
            const win: any = window as any;
            const childProcess = win?.require?.('child_process');
            if (!childProcess?.spawn) {
                reject(new Error('Shell execution is not available in this environment.'));
                return;
            }

            const child = childProcess.spawn(command, {
                shell: true,
                cwd,
                env: win?.process?.env
            });

            let output = '';
            const append = (chunk: any) => {
                output += chunk?.toString ? chunk.toString() : String(chunk ?? '');
                if (output.length > 24000) {
                    output = output.slice(-24000);
                }
            };
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let forceKillId: ReturnType<typeof setTimeout> | null = null;

            const finish = (result?: { code: number | null; output: string }, error?: any) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (forceKillId) {
                    clearTimeout(forceKillId);
                }
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result || { code: null, output });
            };

            child.stdout?.on('data', append);
            child.stderr?.on('data', append);
            child.on('error', (error: any) => finish(undefined, error));
            child.on('close', (code: number | null) => finish({ code, output }));

            if (timeoutMs && timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    append(`\n[Tlink] Command timed out after ${Math.round(timeoutMs / 1000)}s. Terminating process.`);
                    try {
                        child.kill('SIGTERM');
                    } catch {
                        // no-op
                    }

                    forceKillId = setTimeout(() => {
                        try {
                            child.kill('SIGKILL');
                        } catch {
                            // no-op
                        }
                        finish({ code: -1, output });
                    }, 1500);
                }, timeoutMs);
            }
        });
    }

    private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
        if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                return await fetch(url, {
                    method: 'GET',
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }
        }

        return await Promise.race([
            fetch(url, { method: 'GET' }),
            new Promise<Response>((_, reject) => {
                setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
            })
        ]);
    }

    private getTailOutput(output: string, maxLines = 8): string {
        if (!output?.trim()) {
            return '';
        }
        const lines = output
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
        return lines.slice(-maxLines).join('\n').slice(0, 600);
    }

    private async ensureDockerReady(): Promise<{ ready: boolean; output?: string; message?: string; autoStarted?: boolean; autoInstalled?: boolean }> {
        const probe = async () => this.executeShellCommand(this.getDockerInfoProbeCommand());

        const firstProbe = await probe();
        if (firstProbe.code === 0) {
            return { ready: true };
        }

        let combinedOutput = firstProbe.output || '';
        let autoInstalled = false;

        if (this.isDockerCliMissing(firstProbe.output)) {
            const installCommand = this.getDockerDesktopInstallCommand();
            if (!installCommand) {
                return {
                    ready: false,
                    output: firstProbe.output,
                    message: 'Docker CLI is not installed. Install Docker Desktop, then retry.\nhttps://www.docker.com/products/docker-desktop/'
                };
            }

            this.toast.info('Docker CLI not found. Trying to install Docker Desktop...', 7000);
            const installResult = await this.executeShellCommand(installCommand);
            combinedOutput = `${combinedOutput}\n${installResult.output || ''}`.trim();

            if (installResult.code !== 0) {
                return {
                    ready: false,
                    output: combinedOutput,
                    message: 'Unable to auto-install Docker Desktop. Install it manually, then retry.\nhttps://www.docker.com/products/docker-desktop/'
                };
            }

            autoInstalled = true;
            this.toast.info('Docker Desktop install command completed. Launching Docker...', 6000);
        }

        const startOutcome = await this.startDockerDesktopAndWait(combinedOutput);
        if (startOutcome.ready) {
            return {
                ...startOutcome,
                autoInstalled
            };
        }

        if (autoInstalled) {
            return {
                ...startOutcome,
                autoInstalled: true,
                message: startOutcome.message || 'Docker Desktop was installed, but Docker daemon is not ready yet. Wait a moment and retry.'
            };
        }

        return startOutcome;
    }

    private async startDockerDesktopAndWait(priorOutput: string): Promise<{ ready: boolean; output?: string; message?: string; autoStarted?: boolean }> {
        const startCommand = this.getDockerDesktopStartCommand();
        if (!startCommand) {
            return {
                ready: false,
                output: priorOutput,
                message: 'Docker is installed but not running. Start Docker daemon manually and retry.'
            };
        }

        this.toast.info('Docker is not running. Trying to start Docker Desktop...', 5000);
        const startResult = await this.executeShellCommand(startCommand);
        const combined = `${priorOutput || ''}\n${startResult.output || ''}`.trim();
        if (startResult.code !== 0) {
            return {
                ready: false,
                output: combined,
                message: 'Unable to auto-start Docker Desktop. Start it manually, wait until it is running, then retry.\nhttps://www.docker.com/products/docker-desktop/'
            };
        }

        const probe = async () => this.executeShellCommand(this.getDockerInfoProbeCommand());
        const timeoutMs = 90_000;
        const intervalMs = 3_000;
        const deadline = Date.now() + timeoutMs;
        let lastOutput = combined;

        while (Date.now() < deadline) {
            await this.sleep(intervalMs);
            const nextProbe = await probe();
            if (nextProbe.code === 0) {
                return { ready: true, output: combined, autoStarted: true };
            }
            lastOutput = nextProbe.output || lastOutput;
            if (this.isDockerCliMissing(lastOutput)) {
                return {
                    ready: false,
                    output: lastOutput,
                    message: 'Docker CLI is not installed. Install Docker Desktop, then retry.\nhttps://www.docker.com/products/docker-desktop/'
                };
            }
        }

        return {
            ready: false,
            output: lastOutput,
            message: 'Docker Desktop was launched, but Docker daemon is not ready yet. Wait a bit and retry.'
        };
    }

    private getDockerInfoProbeCommand(): string {
        if (this.isWindowsPlatform()) {
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "$cmd=Get-Command docker -ErrorAction SilentlyContinue; if($cmd){ & docker info; exit $LASTEXITCODE }; $candidates=@('$Env:ProgramFiles\\\\Docker\\\\Docker\\\\resources\\\\bin\\\\docker.exe','$Env:LocalAppData\\\\Programs\\\\Docker\\\\Docker\\\\resources\\\\bin\\\\docker.exe'); $exe=$candidates | Where-Object { Test-Path $_ } | Select-Object -First 1; if($exe){ & $exe info; exit $LASTEXITCODE }; Write-Error 'docker CLI not found'; exit 1"`;
        }

        return 'if command -v docker >/dev/null 2>&1; then docker info; elif [ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then "/Applications/Docker.app/Contents/Resources/bin/docker" info; else echo "docker CLI not found" >&2; exit 1; fi';
    }

    private getDockerDesktopInstallCommand(): string | null {
        const platform = this.getPlatform();
        if (platform === 'darwin') {
            return 'brew install --cask docker';
        }

        if (platform === 'win32') {
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "if(-not (Get-Command winget -ErrorAction SilentlyContinue)){ throw 'winget is not available' }; winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements --silent"`;
        }

        return null;
    }

    private isDockerCliMissing(output: string): boolean {
        const text = String(output || '').toLowerCase();
        return text.includes('docker: command not found') ||
            text.includes('docker cli not found') ||
            text.includes('docker is not recognized') ||
            text.includes("'docker' is not recognized");
    }

    private getDockerDesktopStartCommand(): string | null {
        const platform = this.getPlatform();
        if (platform === 'darwin') {
            return 'open -ga Docker';
        }

        if (platform === 'win32') {
            return `powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidates=@('$Env:ProgramFiles\\\\Docker\\\\Docker\\\\Docker Desktop.exe','$Env:LocalAppData\\\\Programs\\\\Docker\\\\Docker Desktop.exe'); $exe=$candidates | Where-Object { Test-Path $_ } | Select-Object -First 1; if(-not $exe){ throw 'Docker Desktop executable not found' }; Start-Process -FilePath $exe; Write-Output ('Started Docker Desktop: ' + $exe)"`;
        }

        return null;
    }

    private makeToastSafe(text: string): string {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private getDockerFailureHint(output: string): string | null {
        const text = String(output || '').toLowerCase();
        const dockerDesktopUrl = 'https://www.docker.com/products/docker-desktop/';

        const missingCli =
            text.includes('docker: command not found') ||
            text.includes('docker is not recognized') ||
            text.includes("'docker' is not recognized");

        if (missingCli) {
            return `Docker CLI is not installed. Install Docker Desktop, then retry.\n${dockerDesktopUrl}`;
        }

        const armManifestMismatch =
            text.includes('no matching manifest') &&
            text.includes('linux/arm64');

        if (armManifestMismatch) {
            return 'Docker image does not provide linux/arm64 on this registry. Retrying with --platform linux/amd64 is required. Please retry install.';
        }

        const cudaRuntimeMissing =
            text.includes('libcuda.so.1') ||
            text.includes('cuda') && text.includes('cannot open shared object file');

        if (cudaRuntimeMissing) {
            return 'Tabby Docker image requires NVIDIA CUDA runtime. This host cannot provide libcuda.so.1. Use native install (Homebrew on macOS / Windows package on Windows).';
        }

        const daemonUnavailable =
            text.includes('failed to connect to the docker api') ||
            text.includes('cannot connect to the docker daemon') ||
            text.includes('is the docker daemon running') ||
            text.includes('docker.sock: connect: no such file or directory') ||
            text.includes('docker.sock') && text.includes('connection refused');

        if (daemonUnavailable) {
            return `Docker is installed but not running. Start Docker Desktop and wait until it shows as running, then retry.\n${dockerDesktopUrl}`;
        }

        const dockerPermission =
            text.includes('permission denied') &&
            (text.includes('docker.sock') || text.includes('/var/run/docker.sock'));

        if (dockerPermission) {
            return `Docker is running but access to docker.sock is denied for this user. Fix Docker permissions (or run with proper group rights), then retry.`;
        }

        return null;
    }

    private isMacBrewServiceStartFailure(output: string): boolean {
        const text = String(output || '').toLowerCase();
        return (
            text.includes('homebrew.mxcl.tabby.plist') ||
            text.includes('brew services') && text.includes('tabby') ||
            text.includes('launchctl') ||
            text.includes('exited with 5')
        );
    }

    private async tryStartTabbyDirectlyOnMac(): Promise<boolean> {
        this.toast.warning('Homebrew service start failed. Trying direct Tabby launch...', 6000);
        const completionModel = this.quoteForPosixShell(this.getPreferredTabbyCompletionModel());
        const chatModel = this.quoteForPosixShell(this.getPreferredTabbyChatModel());

        const command = [
            'TABBY_BIN="$(command -v tabby || true)"',
            'if [ -z "$TABBY_BIN" ] && [ -x "/opt/homebrew/bin/tabby" ]; then TABBY_BIN="/opt/homebrew/bin/tabby"; fi',
            'if [ -z "$TABBY_BIN" ] && [ -x "/usr/local/bin/tabby" ]; then TABBY_BIN="/usr/local/bin/tabby"; fi',
            'if [ -z "$TABBY_BIN" ]; then echo "tabby binary not found"; exit 1; fi',
            'mkdir -p "$HOME/.tabby"',
            `nohup "$TABBY_BIN" serve --model ${completionModel} --chat-model ${chatModel} --host 0.0.0.0 --port 8080 --device cpu --chat-device cpu > "$HOME/.tabby/tlink-tabby.log" 2>&1 < /dev/null &`,
            'echo "Started Tabby directly: $TABBY_BIN"'
        ].join('\n');

        const result = await this.executeShellCommand(command);
        if (result.code !== 0) {
            const tail = this.getTailOutput(result.output);
            this.logger.error('Failed to start Tabby directly on macOS after brew services failure', { output: tail });
            return false;
        }

        const reachable = await this.waitForTabbyReachability(8, 2500);
        if (reachable) {
            this.toast.success('Tabby started directly (without brew services) and is reachable at http://localhost:8080');
            return true;
        }

        this.toast.warning('Tabby launch command ran, but service is not reachable yet. Check logs at ~/.tabby/tlink-tabby.log', 9000);
        return true;
    }

    private async cleanupExistingTabbyDockerContainer(): Promise<void> {
        try {
            const result = await this.executeShellCommand('docker rm -f tabby');
            if (result.code === 0) {
                this.logger.info('Removed existing tabby Docker container before relaunch.');
            }
        } catch {
            // Ignore cleanup failures; docker run will report actionable errors.
        }
    }

    private async diagnoseDockerTabbyStartup(): Promise<void> {
        try {
            const inspect = await this.executeShellCommand('docker inspect tabby --format "{{.State.Running}}|{{.State.ExitCode}}|{{.State.Status}}"');
            const stateLine = inspect.output.split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';
            const stateLower = stateLine.toLowerCase();

            if (stateLower.startsWith('true|')) {
                this.toast.info('Tabby container is running. Service may still be warming up models.');
                return;
            }

            const logs = await this.executeShellCommand('docker logs --tail 80 tabby');
            const tail = this.getTailOutput(logs.output, 12);
            const lower = String(logs.output || '').toLowerCase();

            if (lower.includes('libcuda.so.1') || lower.includes('no such file or directory') && lower.includes('cuda')) {
                this.toast.error(
                    'Tabby Docker image requires NVIDIA CUDA runtime (libcuda.so.1). On macOS, use native Homebrew install instead of Docker.',
                    10000
                );
                this.logger.error('Tabby Docker startup failed with CUDA runtime error', {
                    state: stateLine,
                    logs: tail
                });
                return;
            }

            if (tail) {
                this.toast.error(`Tabby container exited during startup.\n\n${this.makeToastSafe(tail)}`, 10000);
            } else {
                this.toast.error('Tabby container exited during startup. Check Docker logs: docker logs tabby', 8000);
            }
            this.logger.error('Tabby Docker startup diagnostics', {
                state: stateLine,
                logs: tail
            });
        } catch (error) {
            this.logger.warn('Failed to diagnose Tabby Docker startup', { error: String(error) });
        }
    }

    private async waitForTabbyReachability(attempts = 6, delayMs = 2000): Promise<boolean> {
        for (let i = 0; i < attempts; i++) {
            const reachable = await this.checkTabbyReachability(true);
            if (reachable) {
                return true;
            }

            if (i < attempts - 1) {
                await this.sleep(delayMs);
            }
        }
        return false;
    }

    private async waitForTabbyStopped(attempts = 8, delayMs = 1000): Promise<boolean> {
        for (let i = 0; i < attempts; i++) {
            const reachable = await this.checkTabbyReachability(true);
            if (!reachable) {
                return true;
            }

            if (i < attempts - 1) {
                await this.sleep(delayMs);
            }
        }
        return false;
    }

    private async checkTabbyReachability(silent = false): Promise<boolean> {
        const base = this.getTabbyServiceBaseUrl();
        // Try non-auth endpoints first to avoid noisy 401 logs when auth is enabled.
        const endpoints = [`${base}/health`, `${base}/v1/health`, base];

        for (const endpoint of endpoints) {
            try {
                const response = await this.fetchWithTimeout(endpoint, this.tabbyReachabilityRequestTimeoutMs);
                if (response.ok) {
                    if (!silent) {
                        this.toast.success(`Tabby server is reachable at ${base}`);
                    }
                    return true;
                }

                if (response.status === 401 || response.status === 403) {
                    if (!silent) {
                        this.toast.success(`Tabby server is reachable at ${base} (auth required)`);
                    }
                    return true;
                }

                if (response.status < 500 && response.status !== 404) {
                    if (!silent) {
                        this.toast.success(`Tabby server is reachable at ${base}`);
                    }
                    return true;
                }
            } catch {
                // Try next endpoint
            }
        }

        if (!silent) {
            this.toast.warning(`Tabby install finished, but ${base} is not reachable yet. It may still be starting up.`);
        }
        return false;
    }

    async startOllama(event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        try {
            const win: any = window as any;
            const shell = win?.electron?.shell || win?.require?.('electron')?.shell;
            const fs = win?.require?.('fs');
            const platform = win?.process?.platform;
            const childProcess = win?.require?.('child_process');

            if (!shell) {
                this.toast.error('Unable to start Ollama from here. Please launch it manually.');
                return;
            }

            if (platform === 'darwin') {
                const appPath = '/Applications/Ollama.app';
                if (fs?.existsSync && !fs.existsSync(appPath)) {
                    this.toast.error('Ollama app not found. Please install it from ollama.com/download.');
                    return;
                }
                if (childProcess?.exec) {
                    childProcess.exec('open -gj -a Ollama', (err: any) => {
                        if (err) {
                            this.logger.warn('Failed to start Ollama via open', { error: String(err) });
                            this.toast.error('Unable to start Ollama. Please launch it manually.');
                            return;
                        }
                        this.toast.success('Starting Ollama...');
                        this.scheduleOllamaStatusRefresh();
                    });
                    return;
                }
                if (shell.openPath) {
                    const result = await shell.openPath(appPath);
                    if (!result) {
                        this.toast.success('Starting Ollama...');
                        this.scheduleOllamaStatusRefresh();
                        return;
                    }
                    this.logger.warn('Failed to open Ollama app', { error: result });
                }
                if (shell.openExternal) {
                    await shell.openExternal('https://ollama.com/download');
                    this.toast.error('Unable to start Ollama. Please install or launch it manually.');
                    return;
                }
            } else {
                if (shell.openExternal) {
                    await shell.openExternal('https://ollama.com/download');
                }
                this.toast.error('Unable to start Ollama automatically. Please start it manually.');
            }
        } catch (error) {
            this.logger.error('Failed to start Ollama', error);
            this.toast.error('Unable to start Ollama. Please launch it manually.');
        }
    }

    private scheduleOllamaStatusRefresh(): void {
        const delays = [1000, 2500, 5000];
        delays.forEach((delay) => {
            setTimeout(() => {
                this.testLocalProvider('ollama');
                this.loadOllamaModels();
            }, delay);
        });
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
        const savedAgenticConfig = this.config.getProviderConfig('tlink-agentic');
        const savedAgentConfig = this.config.getProviderConfig('tlink-agent');
        const savedProxyConfig = this.config.getProviderConfig('tlink-proxy');
        let migratedAgenticConfig: any | null = null;

        // Migrate legacy ids to tlink-agentic
        if (savedAgentConfig && !savedAgenticConfig) {
            migratedAgenticConfig = {
                ...(allConfigs['tlink-agentic'] || {}),
                ...savedAgentConfig,
                name: 'tlink-agentic',
                displayName: 'Tlink Agentic'
            };
            allConfigs['tlink-agentic'] = migratedAgenticConfig;
        }
        if (savedProxyConfig && !savedAgenticConfig && !migratedAgenticConfig) {
            migratedAgenticConfig = {
                ...(allConfigs['tlink-agentic'] || {}),
                ...savedProxyConfig,
                name: 'tlink-agentic',
                displayName: 'Tlink Agentic'
            };
            allConfigs['tlink-agentic'] = migratedAgenticConfig;
        }
        if (migratedAgenticConfig) {
            this.config.setProviderConfig('tlink-agentic', migratedAgenticConfig);
        }
        if (savedAgentConfig) {
            this.config.deleteProviderConfig('tlink-agent');
        }
        if (savedProxyConfig) {
            this.config.deleteProviderConfig('tlink-proxy');
        }
        if (allConfigs['tlink-agent']) {
            delete allConfigs['tlink-agent'];
        }
        if (allConfigs['tlink-proxy'] && allConfigs['tlink-agentic']) {
            // Remove the legacy entry to avoid duplicate provider rows in the UI
            delete allConfigs['tlink-proxy'];
        }
        // Update default provider if legacy id
        const defaultProvider = this.config.getDefaultProvider();
        if (defaultProvider === 'tlink-proxy' || defaultProvider === 'tlink-agent') {
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
        this.selectedProvider = (sel === 'tlink-proxy' || sel === 'tlink-agent') ? 'tlink-agentic' : sel;
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
            this.aiService.refreshProvider(providerName);
            this.logger.info('Provider config saved', { provider: providerName });
            this.toast.success(`${this.getProviderTemplate(providerName)?.name || providerName} ${this.t.providers.configSaved || 'Configuration saved'}`);
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
            const method = (providerName === 'openai' || providerName === 'ollama-cloud') ? 'GET' : 'POST';

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
            case 'tabby': {
                const cleanBase = (baseURL || '').replace(/\/+$/, '');
                const rootBase = cleanBase.replace(/\/(v1beta|v1)$/, '');
                return `${rootBase}/v1/health`;
            }
            case 'ollama-cloud': {
                const cleanBase = (baseURL || '').replace(/\/+$/, '');
                return cleanBase.endsWith('/api') ? `${cleanBase}/tags` : `${cleanBase}/api/tags`;
            }
            case 'anthropic':
                return `${baseURL}/v1/messages`;
            case 'glm':
                return `${baseURL}/chat/completions`;
            default:
                return this.buildOpenAiCompatibleChatEndpoint(baseURL, providerName);
        }
    }

    private buildOpenAiCompatibleChatEndpoint(baseURL: string, providerName: string): string {
        const cleanBase = (baseURL || '').replace(/\/+$/, '');
        if (providerName === 'tabby') {
            const rootBase = cleanBase.replace(/\/(v1beta|v1)$/, '');
            return `${rootBase}/v1beta/chat/completions`;
        }
        if (cleanBase.endsWith('/v1')) {
            return `${cleanBase}/chat/completions`;
        }
        return `${cleanBase}/v1/chat/completions`;
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

        if (providerName === 'ollama-cloud') {
            return null;
        }

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
                throw new Error(this.describeUpstreamError(resp.status, text));
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
                throw new Error(this.describeUpstreamError(resp.status, text));
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
     * Check if a Tabby model id is already in the fetched list.
     */
    isTabbyModelKnown(modelId: string | undefined): boolean {
        if (!modelId) {
            return false;
        }
        return this.tabbyModels.some(m => m.id === modelId);
    }

    /**
     * Get docs-backed Tabby model registry list filtered by selected model type.
     */
    getFilteredTabbyCatalogModels(): TabbyCatalogModel[] {
        const models = this.tabbyCatalogFilter === 'all'
            ? this.tabbyCatalogModels
            : this.tabbyCatalogModels.filter(m => m.kind === this.tabbyCatalogFilter);

        return [...models].sort((a, b) => a.id.localeCompare(b.id));
    }

    /**
     * Check whether a model appears to be installed locally in ~/.tabby/models.
     */
    isTabbyInstalledModel(modelId: string | undefined): boolean {
        if (!modelId) {
            return false;
        }
        const needle = modelId.trim().toLowerCase();
        return this.tabbyInstalledModels.some(m => m.id.toLowerCase() === needle);
    }

    getTabbySelectableModels(kind: TabbyModelKind): string[] {
        const options = new Set<string>();
        const addModel = (raw: unknown) => {
            if (typeof raw !== 'string') {
                return;
            }
            const value = raw.trim();
            if (value) {
                options.add(value);
            }
        };

        addModel(this.tabbyActiveModels[kind]);

        if (kind === 'chat') {
            addModel(this.configs['tabby']?.model);
        }

        this.tabbyInstalledModels.forEach(model => {
            if (this.getTabbyModelKind(model.id) === kind) {
                addModel(model.id);
            }
        });

        this.tabbyModels.forEach(model => {
            if (this.getTabbyModelKind(model.id) === kind) {
                addModel(model.id);
            }
        });

        this.tabbyCatalogModels.forEach(model => {
            if (model.kind === kind) {
                addModel(model.id);
            }
        });

        if (options.size === 0) {
            addModel(this.getDefaultTabbyModelForKind(kind));
        }

        return Array.from(options).sort((a, b) => a.localeCompare(b));
    }

    async loadTabbyModelConfig(event?: Event, silent = false): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyModelConfigLoading) {
            if (!silent) {
                this.toast.info('Tabby model config load is already in progress.');
            }
            return;
        }

        this.tabbyModelConfigLoading = true;
        try {
            const win: any = window as any;
            const fs = win?.require?.('fs');
            const path = win?.require?.('path');
            const os = win?.require?.('os');
            if (!fs || !path || !os) {
                throw new Error('File system access is unavailable in this environment.');
            }

            const configPath = path.join(os.homedir(), '.tabby', 'config.toml');
            this.tabbyModelConfigPath = configPath;

            let parsed: Partial<TabbyModelConfigSelection> = {};
            if (fs.existsSync(configPath)) {
                const content = String(fs.readFileSync(configPath, 'utf8') || '');
                parsed = this.parseTabbyModelConfigToml(content);
            }

            this.tabbyActiveModels.completion = String(parsed.completion || '').trim() || this.getDefaultTabbyModelForKind('completion');
            this.tabbyActiveModels.chat = String(parsed.chat || '').trim() || this.getDefaultTabbyModelForKind('chat');
            this.tabbyActiveModels.embedding = String(parsed.embedding || '').trim() || this.getDefaultTabbyModelForKind('embedding');

            if (!silent) {
                if (fs.existsSync(configPath)) {
                    this.toast.success('Loaded Tabby model config from ~/.tabby/config.toml');
                } else {
                    this.toast.info('No ~/.tabby/config.toml found yet. Select models and click Apply model config.');
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to load Tabby model config: ${message.substring(0, 200)}`);
            }
            this.logger.error('Failed to load Tabby model config', { error: message });
        } finally {
            this.tabbyModelConfigLoading = false;
        }
    }

    async applyTabbyModelConfig(event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyModelConfigSaving) {
            this.toast.info('Tabby model config apply is already in progress.');
            return;
        }
        if (this.tabbyInstallInProgress || this.tabbyStartInProgress || this.tabbyRestartInProgress || this.tabbyStopInProgress || this.tabbyModelInstallInProgress) {
            this.toast.info('Tabby server/model action is in progress. Retry after it completes.');
            return;
        }

        const completion = String(this.tabbyActiveModels.completion || '').trim();
        const chat = String(this.tabbyActiveModels.chat || '').trim();
        const embedding = String(this.tabbyActiveModels.embedding || '').trim();

        if (!completion || !chat || !embedding) {
            this.toast.error('Completion, chat, and embedding model values are required.');
            return;
        }
        const isValidId = (value: string) => /^[A-Za-z0-9._/-]+$/.test(value);
        if (!isValidId(completion) || !isValidId(chat) || !isValidId(embedding)) {
            this.toast.error('Model ids may only contain letters, numbers, dot, underscore, slash, or hyphen.');
            return;
        }

        this.tabbyModelConfigSaving = true;
        try {
            const win: any = window as any;
            const fs = win?.require?.('fs');
            const path = win?.require?.('path');
            const os = win?.require?.('os');
            if (!fs || !path || !os) {
                throw new Error('File system access is unavailable in this environment.');
            }

            const configPath = path.join(os.homedir(), '.tabby', 'config.toml');
            this.tabbyModelConfigPath = configPath;
            fs.mkdirSync(path.dirname(configPath), { recursive: true });

            const existingContent = fs.existsSync(configPath)
                ? String(fs.readFileSync(configPath, 'utf8') || '')
                : '';

            const preservedContent = this.removeTabbyModelSections(existingContent).trim();
            const modelBlock = this.renderTabbyModelSections({
                completion,
                chat,
                embedding
            });
            const output = preservedContent
                ? `${preservedContent}\n\n${modelBlock}\n`
                : `${modelBlock}\n`;

            fs.writeFileSync(configPath, output, 'utf8');

            this.tabbyActiveModels = { completion, chat, embedding };
            if (this.configs['tabby']) {
                this.configs['tabby'].model = chat;
            }

            this.toast.success('Updated ~/.tabby/config.toml model sections.');
            this.toast.info('Click Restart Tabby to apply the new models.');
            this.logger.info('Tabby model config updated via Tlink UI', {
                completion,
                chat,
                embedding
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.toast.error(`Failed to apply Tabby model config: ${message.substring(0, 200)}`);
            this.logger.error('Failed to apply Tabby model config', { error: message });
        } finally {
            this.tabbyModelConfigSaving = false;
        }
    }

    private parseTabbyModelConfigToml(content: string): Partial<TabbyModelConfigSelection> {
        const parsed: Partial<TabbyModelConfigSelection> = {};
        if (!content) {
            return parsed;
        }

        let currentSection = '';
        const lines = content.split(/\r?\n/);
        lines.forEach(line => {
            const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1].trim();
                return;
            }

            const modelIdMatch = line.match(/^\s*model_id\s*=\s*"([^"]+)"\s*$/);
            if (!modelIdMatch) {
                return;
            }

            const modelId = modelIdMatch[1].trim();
            if (!modelId) {
                return;
            }

            if (currentSection === 'model.completion.local') {
                parsed.completion = modelId;
            } else if (currentSection === 'model.chat.local') {
                parsed.chat = modelId;
            } else if (currentSection === 'model.embedding.local') {
                parsed.embedding = modelId;
            }
        });

        return parsed;
    }

    private removeTabbyModelSections(content: string): string {
        let output = String(content || '');
        const sections = [
            'model.completion.local',
            'model.chat.local',
            'model.embedding.local'
        ];

        sections.forEach(section => {
            const escaped = section.replace(/\./g, '\\.');
            const blockRegex = new RegExp(`\\[${escaped}\\][\\s\\S]*?(?=\\r?\\n\\[[^\\]]+\\]|$)`, 'g');
            output = output.replace(blockRegex, '');
        });

        return output
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+\n/g, '\n')
            .trim();
    }

    private renderTabbyModelSections(models: TabbyModelConfigSelection): string {
        return [
            '[model.completion.local]',
            `model_id = "${this.escapeTomlString(models.completion)}"`,
            '',
            '[model.chat.local]',
            `model_id = "${this.escapeTomlString(models.chat)}"`,
            '',
            '[model.embedding.local]',
            `model_id = "${this.escapeTomlString(models.embedding)}"`
        ].join('\n');
    }

    private escapeTomlString(raw: string): string {
        return String(raw || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }

    private getDefaultTabbyModelForKind(kind: TabbyModelKind): string {
        if (kind === 'completion') {
            const installedCompletion = this.tabbyInstalledModels.find(m => this.getTabbyModelKind(m.id) === 'completion')?.id;
            if (installedCompletion) {
                return installedCompletion;
            }
            return 'StarCoder-1B';
        }

        if (kind === 'chat') {
            const providerChat = String(this.configs['tabby']?.model || '').trim();
            if (providerChat) {
                return providerChat;
            }
            const installedChat = this.tabbyInstalledModels.find(m => this.getTabbyModelKind(m.id) === 'chat')?.id;
            if (installedChat) {
                return installedChat;
            }
            return 'Qwen2-1.5B-Instruct';
        }

        const installedEmbedding = this.tabbyInstalledModels.find(m => this.getTabbyModelKind(m.id) === 'embedding')?.id;
        if (installedEmbedding) {
            return installedEmbedding;
        }
        return 'Nomic-Embed-Text';
    }

    private getTabbyModelKind(modelId: string): TabbyModelKind {
        const value = String(modelId || '').trim();
        const normalized = value.toLowerCase();
        const fromCatalog = this.tabbyCatalogModels.find(m => m.id.toLowerCase() === normalized);
        if (fromCatalog) {
            return fromCatalog.kind;
        }

        if (
            normalized.includes('embed') ||
            normalized.includes('embedding') ||
            normalized.includes('nomic') ||
            normalized.includes('jina')
        ) {
            return 'embedding';
        }

        if (normalized.includes('chat') || normalized.includes('instruct')) {
            return 'chat';
        }

        return 'completion';
    }

    /**
     * Discover installed Tabby models by scanning ~/.tabby/models/<vendor>/<model>.
     */
    async refreshInstalledTabbyModels(event?: Event, silent = false): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyInstalledModelsLoading) {
            if (!silent) {
                this.toast.info('Installed Tabby model refresh is already in progress.');
            }
            return;
        }

        this.tabbyInstalledModelsLoading = true;

        try {
            const win: any = window as any;
            const fs = win?.require?.('fs');
            const path = win?.require?.('path');
            const os = win?.require?.('os');

            if (!fs || !path || !os) {
                throw new Error('File system access is unavailable in this environment.');
            }

            const modelsRoot = path.join(os.homedir(), '.tabby', 'models');
            const discovered: TabbyInstalledModel[] = [];

            if (fs.existsSync(modelsRoot)) {
                const vendors = fs.readdirSync(modelsRoot, { withFileTypes: true })
                    .filter((entry: any) => entry?.isDirectory?.());

                vendors.forEach((vendorEntry: any) => {
                    const vendor = vendorEntry.name;
                    const vendorPath = path.join(modelsRoot, vendor);
                    const modelDirs = fs.readdirSync(vendorPath, { withFileTypes: true })
                        .filter((entry: any) => entry?.isDirectory?.());

                    modelDirs.forEach((modelEntry: any) => {
                        const id = modelEntry.name;
                        const modelPath = path.join(vendorPath, id);
                        const hasGgml = fs.existsSync(path.join(modelPath, 'ggml'));
                        discovered.push({
                            id,
                            vendor,
                            path: modelPath,
                            hasGgml
                        });
                    });
                });
            }

            discovered.sort((a, b) => {
                const byId = a.id.localeCompare(b.id);
                if (byId !== 0) return byId;
                return a.vendor.localeCompare(b.vendor);
            });
            this.tabbyInstalledModels = discovered;

            const available = this.getFilteredTabbyCatalogModels();
            if (!available.some(m => m.id === this.tabbySelectedCatalogModel) && available.length > 0) {
                this.tabbySelectedCatalogModel = available[0].id;
            }

            if (!silent) {
                this.toast.success(`Loaded ${discovered.length} installed Tabby models.`);
            }
            this.logger.info('Tabby installed models refreshed', { count: discovered.length });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to load installed Tabby models: ${message.substring(0, 200)}`);
            }
            this.logger.error('Failed to refresh installed Tabby models', { error: message });
        } finally {
            this.tabbyInstalledModelsLoading = false;
        }
    }

    /**
     * Install selected Tabby model via: tabby download --model <id>
     */
    async installTabbyModel(event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyModelInstallInProgress) {
            this.toast.info('Tabby model install is already in progress.');
            return;
        }
        if (this.tabbyInstallInProgress || this.tabbyStartInProgress || this.tabbyRestartInProgress || this.tabbyStopInProgress) {
            this.toast.info('Tabby server action is in progress. Try model install after it completes.');
            return;
        }

        const modelId = String(this.tabbyCustomModelId || this.tabbySelectedCatalogModel || '').trim();
        if (!modelId) {
            this.toast.error('Select a model (or enter custom model id) first.');
            return;
        }
        if (!this.isValidTabbyModelId(modelId)) {
            this.toast.error('Invalid model id format. Use letters, numbers, dot, underscore, slash, or hyphen.');
            return;
        }

        const installed = await this.installTabbyModelById(modelId, true);
        if (installed) {
            this.tabbyCustomModelId = '';
        }
    }

    async installActiveTabbyModel(kind: TabbyModelKind, event?: Event): Promise<void> {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (this.tabbyModelInstallInProgress) {
            this.toast.info('Tabby model install is already in progress.');
            return;
        }
        if (this.tabbyInstallInProgress || this.tabbyStartInProgress || this.tabbyRestartInProgress || this.tabbyStopInProgress) {
            this.toast.info('Tabby server action is in progress. Try model install after it completes.');
            return;
        }

        const modelId = String(this.tabbyActiveModels[kind] || '').trim();
        if (!modelId) {
            this.toast.error(`Select a ${kind} model first.`);
            return;
        }
        if (!this.isValidTabbyModelId(modelId)) {
            this.toast.error('Invalid model id format. Use letters, numbers, dot, underscore, slash, or hyphen.');
            return;
        }
        if (this.isTabbyInstalledModel(modelId)) {
            this.toast.info(`Model already installed: ${modelId}`);
            return;
        }

        await this.installTabbyModelById(modelId, false);
    }

    private isValidTabbyModelId(modelId: string): boolean {
        return /^[A-Za-z0-9._/-]+$/.test(String(modelId || '').trim());
    }

    private async installTabbyModelById(modelId: string, showPostInstallHint: boolean): Promise<boolean> {
        this.tabbyModelInstallInProgress = true;
        this.toast.info(`Installing Tabby model: ${modelId} ...`, 5000);

        try {
            const command = this.getTabbyDownloadCommandForCurrentPlatform(modelId);
            const result = await this.executeShellCommand(command);
            if (result.code !== 0) {
                const shortOutput = this.getTailOutput(result.output, 12);
                const detail = shortOutput ? `\n\n${this.makeToastSafe(shortOutput)}` : '';
                this.toast.error(`Tabby model install failed for ${modelId}.${detail}`, 10000);
                this.logger.error('Tabby model download command failed', {
                    modelId,
                    code: result.code,
                    output: shortOutput
                });
                return false;
            }

            if (!this.tabbyModels.some(m => m.id === modelId)) {
                this.tabbyModels = [...this.tabbyModels, { id: modelId, ownedBy: 'tabby-local' }]
                    .sort((a, b) => a.id.localeCompare(b.id));
            }
            await this.refreshInstalledTabbyModels(undefined, true);

            this.toast.success(`Tabby model installed: ${modelId}`);
            if (showPostInstallHint) {
                this.toast.info('Use Active server models below to update ~/.tabby/config.toml, then click Restart Tabby.');
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.toast.error(`Failed to install Tabby model: ${message.substring(0, 200)}`);
            this.logger.error('Failed to install Tabby model', { error: message, modelId });
            return false;
        } finally {
            this.tabbyModelInstallInProgress = false;
        }
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
                throw new Error(this.describeUpstreamError(resp.status, text));
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
     * Refresh Tabby models from OpenAI-compatible /models endpoint.
     * Tries /v1beta/models first (Tabby >=0.32), then /v1/models and /models.
     */
    async refreshTabbyModels(silent: boolean = false, allowAutoStart = true): Promise<void> {
        const providerConfig = this.configs['tabby'];
        if (!providerConfig || !providerConfig.baseURL) {
            if (!silent) {
                this.toast.error('Please set Tabby Base URL first');
            }
            return;
        }

        const baseURL = String(providerConfig.baseURL).replace(/\/+$/, '');
        const rootBase = baseURL.replace(/\/(v1beta|v1)$/, '');
        const endpointCandidates = [
            `${rootBase}/v1beta/models`,
            `${rootBase}/v1/models`,
            `${rootBase}/models`
        ];
        const endpoints = Array.from(new Set(endpointCandidates));
        this.tabbyModelsLoading = true;
        this.logger.info('Refreshing Tabby models...', { baseURL, endpoints, silent });

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (providerConfig.apiKey) {
                headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
            }

            let lastStatus: number | undefined;
            let lastBody = '';
            let data: any;
            let sawModelEndpointNotFound = false;
            let sawHtmlNotFound = false;

            for (const endpoint of endpoints) {
                try {
                    const resp = await fetch(endpoint, {
                        method: 'GET',
                        headers
                    });
                    if (resp.ok) {
                        data = await resp.json();
                        break;
                    }
                    lastStatus = resp.status;
                    lastBody = await resp.text();
                    if (resp.status === 404) {
                        sawModelEndpointNotFound = true;
                        const contentType = (resp.headers.get('content-type') || '').toLowerCase();
                        if (contentType.includes('text/html') || /<!doctype html|<html/i.test(lastBody)) {
                            sawHtmlNotFound = true;
                        }
                    }
                } catch (err) {
                    lastBody = err instanceof Error ? err.message : String(err);
                }
            }

            if (!data) {
                if (!lastStatus && allowAutoStart) {
                    const started = await this.startTabbyServer(undefined, true);
                    if (started) {
                        if (!silent) {
                            this.toast.info('Tabby was not running. Started local Tabby server, retrying model refresh...');
                        }
                        await this.refreshTabbyModels(silent, false);
                        return;
                    }
                }

                if (lastStatus === 401 || lastStatus === 403) {
                    throw new Error('Unauthorized. Set a valid Tabby auth token (API Key) and retry.');
                }

                // Some Tabby deployments expose chat/completions but do not expose model listing.
                // In that case, keep manual model entry and guide the user instead of failing hard.
                if (sawModelEndpointNotFound && await this.checkTabbyReachability(true)) {
                    const currentModel = String(this.configs['tabby']?.model || '').trim();
                    if (!currentModel) {
                        this.configs['tabby'].model = 'default';
                    }
                    this.tabbyModels = [];
                    this.logger.warn('Tabby model listing endpoint not available; using manual model entry', {
                        baseURL,
                        endpoints,
                        sawHtmlNotFound,
                        status: lastStatus
                    });
                    if (!silent) {
                        this.toast.info('Tabby server is reachable, but this instance does not expose model listing. Use the Model field manually (for example: default).', 9000);
                    }
                    return;
                }

                const detail = lastStatus
                    ? `Status ${lastStatus}: ${lastBody.substring(0, 200)}`
                    : `Cannot reach Tabby at ${baseURL}. Start Tabby server and retry. ${lastBody.substring(0, 120)}`;
                throw new Error(detail || `Cannot reach Tabby at ${baseURL}`);
            }

            const models: { id: string; ownedBy?: string }[] = [];
            const pushModel = (id: unknown, ownedBy: string = 'tabby') => {
                if (typeof id !== 'string') return;
                const trimmed = id.trim();
                if (!trimmed) return;
                models.push({ id: trimmed, ownedBy });
            };

            // OpenAI-compatible shape: { data: [{ id, owned_by }] }
            const openAiModels = Array.isArray(data?.data) ? data.data : [];
            openAiModels.forEach((m: any) => {
                pushModel(m?.id, m?.owned_by || 'tabby');
            });

            // Tabby-native shape
            pushModel(data?.chat?.local?.model_id);
            pushModel(data?.completion?.local?.model_id);
            pushModel(data?.embedding?.local?.model_id, 'tabby-embedding');

            // Fallback: infer from health endpoint when /models is sparse.
            if (models.length === 0) {
                try {
                    const healthURL = `${baseURL.replace(/\/(v1beta|v1)$/, '')}/v1/health`;
                    const healthResp = await fetch(healthURL, { method: 'GET', headers });
                    if (healthResp.ok) {
                        const health = await healthResp.json();
                        pushModel(health?.chat_model);
                        pushModel(health?.model);
                        pushModel(health?.models?.chat?.local?.model_id);
                        pushModel(health?.models?.completion?.local?.model_id);
                        pushModel(health?.models?.embedding?.local?.model_id, 'tabby-embedding');
                    }
                } catch {
                    // best-effort fallback only
                }
            }

            const seen = new Set<string>();
            const uniqueModels: { id: string; ownedBy?: string }[] = [];
            models.forEach(m => {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    uniqueModels.push(m);
                }
            });
            uniqueModels.sort((a, b) => a.id.localeCompare(b.id));
            this.tabbyModels = uniqueModels;

            if (!providerConfig.model && uniqueModels.length > 0) {
                this.configs['tabby'].model = uniqueModels[0].id;
            }

            this.logger.info('Tabby models list', { models: uniqueModels });

            if (!silent) {
                this.toast.success(`Loaded ${uniqueModels.length} Tabby models`);
            }
            this.logger.info('Tabby models refreshed', { count: uniqueModels.length, silent });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                this.toast.error(`Failed to refresh Tabby models: ${message.substring(0, 200)}`);
            }
            this.logger.error('Tabby models refresh failed', { error: message });
        } finally {
            this.tabbyModelsLoading = false;
        }
    }

    /**
     * Preload Tabby models on init if a base URL is configured.
     */
    private preloadTabbyModels(): void {
        if (this.tabbyModels.length > 0) {
            return;
        }
        const providerConfig = this.configs['tabby'];
        if (!providerConfig?.baseURL || !providerConfig?.apiKey) {
            return;
        }
        this.refreshTabbyModels(true, false).catch(err => {
            this.logger.warn('Tabby models preload failed', { error: err?.message || err });
        });
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
                throw new Error(this.describeUpstreamError(resp.status, text));
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
            this.ensureOllamaModelSelected();
        } catch (error) {
            this.logger.error('Failed to load Ollama models', error);
            this.toast.error('Failed to load Ollama models');
        } finally {
            this.ollamaModelLoading = false;
        }
    }

    private ensureOllamaModelSelected(): void {
        const config = this.configs['ollama'];
        if (!config || this.ollamaModels.length === 0) {
            return;
        }

        const current = (config.model || '').trim();
        const isLegacyDefault = !current || current === 'llama3.1';
        if (isLegacyDefault && !this.isOllamaModelKnown(current)) {
            const nextModel = this.ollamaModels[0].name;
            config.model = nextModel;
            this.config.setProviderConfig('ollama', config);
            this.logger.info('Auto-selected Ollama model', { model: nextModel });
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
