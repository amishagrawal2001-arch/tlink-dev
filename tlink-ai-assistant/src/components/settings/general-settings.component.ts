import { Component, Output, EventEmitter, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ThemeService, ThemeType } from '../../services/core/theme.service';
import { ConfigService } from 'tlink-core';
import { TranslateService, SupportedLanguage } from '../../i18n';

@Component({
    selector: 'app-general-settings',
    templateUrl: './general-settings.component.html',
    styleUrls: ['./general-settings.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
    @Output() providerChanged = new EventEmitter<string>();

    availableProviders: any[] = [];
    selectedProvider: string = '';
    isEnabled: boolean = true;
    language: string = 'en-US';
    theme: string = 'auto';

    // Translation object
    t: any;

    // Local provider status cache — populated asynchronously via
    // refreshLocalProviderStatus() on init + interval, NOT during render.
    // The template's [style.color] / [ngClass] / {{ text }} bindings must
    // read this cache through a pure getter so Angular's dev-mode
    // checkNoChanges pass doesn't trip ExpressionChangedAfterItHasBeenChecked.
    private localProviderStatus: { [key: string]: { text: string; color: string; icon: string; time: number } } = {};
    private readonly statusCacheDuration = 30000; // 30 second cache
    private statusRefreshTimer: ReturnType<typeof setInterval> | null = null;
    private destroy$ = new Subject<void>();

    languages = [
        { value: 'en-US', label: 'English', flag: '🇺🇸' }
    ];

    themes = [
        { value: 'auto', label: 'Follow System' },
        { value: 'light', label: 'Light Theme' },
        { value: 'dark', label: 'Dark Theme' },
        { value: 'pixel', label: 'Pixel Retro' },
        { value: 'tech', label: 'Cyber Tech' },
        { value: 'parchment', label: 'Parchment' }
    ];

    // Provider template for displaying names
    private providerNames: { [key: string]: string } = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic Claude',
        'minimax': 'Deepseek',
        'glm': 'GLM (ChatGLM)',
        'openai-compatible': 'OpenAI Compatible',
        'tlink-agentic': 'Tlink Agentic',
        'tlink-agent': 'Tlink Agentic',
        // Legacy alias for backward compatibility
        'tlink-proxy': 'Tlink Agentic',
        'ollama': 'Ollama (Local)',
        'ollama-cloud': 'Ollama Cloud',
        'vllm': 'vLLM (Local)',
        'tabby': 'Tabby (Self-hosted)'
    };

    constructor(
        private aiService: AiAssistantService,
        private config: ConfigProviderService,
        private tlinkConfig: ConfigService,
        private logger: LoggerService,
        private translate: TranslateService,
        private themeService: ThemeService
    ) {
        this.t = this.translate.t;
    }

    ngOnInit(): void {
        // Listen to language changes
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
            // Update theme translations
            this.updateThemeLabels();
        });

        this.loadSettings();
        this.loadProviders();
        // Kick an initial status refresh right after providers are known,
        // then re-poll every 30s. The refresh mutates `localProviderStatus`
        // outside any template-binding evaluation, so it's CD-safe.
        this.refreshAllLocalProviderStatuses();
        this.statusRefreshTimer = setInterval(() => {
            this.refreshAllLocalProviderStatuses();
        }, this.statusCacheDuration);
        // Apply current theme
        this.applyTheme(this.theme);

        // Refresh providers when config changes (especially provider configs)
        this.config.onConfigChange().pipe(
            takeUntil(this.destroy$)
        ).subscribe((change) => {
            // Reload providers when provider configs change
            if (change.key?.startsWith('providers.') || change.key === 'defaultProvider' || change.key === '*') {
                this.loadProviders();
                // New / changed provider configs may point at different
                // endpoints, so re-probe the local ones immediately.
                this.refreshAllLocalProviderStatuses();
                // Update selected provider if it changed
                if (change.key === 'defaultProvider') {
                    this.selectedProvider = change.value || this.config.getDefaultProvider() || '';
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.statusRefreshTimer !== null) {
            clearInterval(this.statusRefreshTimer);
            this.statusRefreshTimer = null;
        }
    }

    /**
     * Update theme label translations
     */
    private updateThemeLabels(): void {
        this.themes = [
            { value: 'auto', label: this.t.general.themeAuto },
            { value: 'light', label: this.t.general.themeLight },
            { value: 'dark', label: this.t.general.themeDark },
            { value: 'pixel', label: this.t.general.themePixel || 'Pixel Retro' },
            { value: 'tech', label: this.t.general.themeTech || 'Cyber Tech' },
            { value: 'parchment', label: this.t.general.themeParchment || 'Parchment' }
        ];
    }

    /**
     * Load settings
     */
    private loadSettings(): void {
        this.selectedProvider = this.config.getDefaultProvider() || '';
        this.isEnabled = this.config.isEnabled() ?? true;
        // Force English as default language
        const savedLang: string = (this.config.get('language', 'en-US') || 'en-US') as string;
        this.language = savedLang === 'zh-CN' ? 'en-US' : (savedLang || 'en-US');
        // Update config if it was Chinese
        if (savedLang === 'zh-CN') {
            this.config.set('language', 'en-US');
            this.translate.setLanguage('en-US');
        }
        this.theme = this.config.get('theme', 'auto') || 'auto';
    }

    /**
     * Load available providers - supports cloud and local providers
     */
    private loadProviders(): void {
        const allConfigs = this.config.getAllProviderConfigs();

        // Local provider list (no API key required)
        const localProviders = ['ollama', 'vllm'];
        this.availableProviders = Object.keys(allConfigs)
            .filter(key => {
                const config = allConfigs[key];
                if (!config) return false;

                // Local providers: only need configuration
                if (localProviders.includes(key)) {
                    return config.enabled !== false;
                }

                // Cloud providers: require API Key
                return !!config.apiKey;
            })
            .map(key => ({
                name: key,
                displayName: allConfigs[key].displayName || this.providerNames[key] || key,
                description: this.getProviderDescription(key),
                enabled: allConfigs[key].enabled !== false,
                isLocal: localProviders.includes(key)
            }));

        this.logger.info('Loaded providers from config', { count: this.availableProviders.length });
    }

    /**
     * Get provider description
     */
    private getProviderDescription(key: string): string {
        const descriptions: { [key: string]: string } = {
            'openai': 'Cloud OpenAI GPT series models',
            'anthropic': 'Cloud Anthropic Claude series models',
            'minimax': 'Cloud Deepseek large models',
            'glm': 'Cloud Zhipu ChatGLM models',
            'openai-compatible': 'OpenAI API compatible third-party services',
            'ollama': 'Locally running Ollama service (port 11434)',
            'ollama-cloud': 'Ollama Cloud hosted models',
            'vllm': 'Locally running vLLM service (port 8000)',
            'tabby': 'Self-hosted Tabby server (default port 8080)',
            'tlink-agentic': 'Tlink Agentic gateway (agent tools enabled)',
            'tlink-agent': 'Tlink Agentic gateway (legacy alias)'
        };
        return descriptions[key] || `${this.providerNames[key] || key} provider`;
    }

    /**
     * Get cloud provider status (synchronous return)
     */
    getProviderStatus(providerName: string): { text: string; color: string; icon: string } {
        const providerConfig = this.config.getProviderConfig(providerName);
        if (providerConfig && providerConfig.apiKey) {
            return {
                text: providerConfig.enabled !== false ? 'Enabled' : 'Disabled',
                color: providerConfig.enabled !== false ? '#4caf50' : '#ff9800',
                icon: providerConfig.enabled !== false ? 'fa-check-circle' : 'fa-pause-circle'
            };
        }
        return { text: 'Not Configured', color: '#9e9e9e', icon: 'fa-question-circle' };
    }

    /**
     * Check local provider status (async)
     */
    private async checkLocalProviderStatus(providerName: string): Promise<boolean> {
        const defaults: { [key: string]: string } = {
            'ollama': 'http://localhost:11434/v1/models',
            'vllm': 'http://localhost:8000/v1/models'
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const cfg = this.config.getProviderConfig(providerName);
            const base = cfg?.baseURL || defaults[providerName];
            if (!base) {
                return false;
            }
            const trimmedBase = base.replace(/\/+$/, '');
            const url = providerName === 'ollama' && !/\/v1(\/|$)/.test(trimmedBase) && !trimmedBase.endsWith('/models')
                ? `${trimmedBase}/api/tags`
                : (trimmedBase.endsWith('/models') ? trimmedBase : `${trimmedBase}/models`);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Pure read of the local-provider status cache. Called from the template
     * every change-detection cycle; MUST NOT mutate `this` or start async
     * work, otherwise Angular's dev-mode checkNoChanges pass sees different
     * state on re-evaluation and throws ExpressionChangedAfterItHasBeenChecked.
     *
     * Returns "Checking…" when we haven't populated the cache yet. The
     * scheduled refresh in ngOnInit fills it within a second or two.
     */
    getLocalProviderStatus(providerName: string): { text: string; color: string; icon: string } {
        const cached = this.localProviderStatus[providerName];
        if (cached) {
            return { text: cached.text, color: cached.color, icon: cached.icon };
        }
        return { text: 'Checking...', color: '#ff9800', icon: 'fa-spinner fa-spin' };
    }

    /**
     * Fetches a single local provider's online status and updates the cache.
     * Side-effectful — only called from lifecycle hooks / timers / explicit
     * config-change events, never from a template binding.
     */
    private async refreshLocalProviderStatus(providerName: string): Promise<void> {
        const now = Date.now();
        try {
            const isOnline = await this.checkLocalProviderStatus(providerName);
            this.localProviderStatus[providerName] = isOnline
                ? { text: 'Online', color: '#4caf50', icon: 'fa-check-circle', time: now }
                : { text: 'Offline', color: '#f44336', icon: 'fa-times-circle', time: now };
            this.logger.debug('Local provider status updated', { provider: providerName, isOnline });
        } catch {
            this.localProviderStatus[providerName] = { text: 'Offline', color: '#f44336', icon: 'fa-times-circle', time: now };
        }
    }

    /**
     * Kick a refresh for every currently-known local provider. Used on init,
     * on config change, and on the interval timer.
     */
    private refreshAllLocalProviderStatuses(): void {
        for (const p of this.availableProviders) {
            if (p.isLocal) {
                void this.refreshLocalProviderStatus(p.name);
            }
        }
    }

    /**
     * Update default provider
     */
    updateDefaultProvider(providerName: string): void {
        if (!providerName) {
            this.logger.warn('Cannot set empty provider as default');
            return;
        }
        
        // Verify provider exists in available list
        const provider = this.availableProviders.find(p => p.name === providerName);
        if (!provider) {
            this.logger.warn('Provider not found in available list', { provider: providerName });
            // Still allow setting it in case it's a valid provider that just needs refresh
        }
        
        this.selectedProvider = providerName;
        this.config.setDefaultProvider(providerName);
        
        // Also switch the provider in AI service to ensure it's active
        if (this.aiService.switchProvider(providerName)) {
            this.logger.info('Provider switched in AI service', { provider: providerName });
        }
        
        this.providerChanged.emit(providerName);
        this.logger.info('Default provider updated', { provider: providerName });
        
        // Show feedback
        const providerDisplayName = provider?.displayName || this.providerNames[providerName] || providerName;
        // Note: Toast service might not be available, so we'll just log
        this.logger.info(`Default provider set to: ${providerDisplayName}`);
    }

    /**
     * Update enabled state
     */
    updateEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.config.setEnabled(enabled);
        this.logger.info('AI Assistant enabled state changed', { enabled });
    }

    /**
     * Update language
     */
    updateLanguage(language: string): void {
        // Force English only - prevent Chinese selection
        if (language === 'zh-CN') {
            language = 'en-US';
        }
        this.language = language;
        this.config.set('language', language);
        this.translate.setLanguage(language as SupportedLanguage);
        this.logger.info('Language updated', { language });
    }

    /**
     * Update theme
     */
    updateTheme(theme: string): void {
        this.theme = theme;
        this.config.set('theme', theme);
        this.themeService.applyTheme(theme as ThemeType);
        this.logger.info('Theme updated', { theme });
    }

    /**
     * Apply theme - using ThemeService
     */
    private applyTheme(theme: string): void {
        this.themeService.applyTheme(theme as ThemeType);
    }
}
