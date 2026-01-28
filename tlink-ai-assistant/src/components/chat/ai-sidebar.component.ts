import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, AfterViewInit, ViewEncapsulation, HostBinding, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ChatMessage, MessageRole, StreamEvent, AgentStreamEvent } from '../../types/ai.types';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ChatHistoryService } from '../../services/chat/chat-history.service';
import { AiSidebarService } from '../../services/chat/ai-sidebar.service';
import { ThemeService, ThemeType } from '../../services/core/theme.service';
import { ContextManager } from '../../services/context/manager';
import { ToolStreamProcessorService } from '../../services/tools/tool-stream-processor.service';
import { AnyUIStreamEvent } from '../../services/tools/types/ui-stream-event.types';
import { PlatformDetectionService, OSType } from '../../services/platform/platform-detection.service';
import { SelectorService, SelectorOption } from 'tlink-core';
import { ProviderConfig, ProviderConfigUtils } from '../../types/provider.types';

/**
 * AI Sidebar Component - Replaces ChatInterfaceComponent
 * Uses inline templates and styles, supports Tlink themes
 */
@Component({
    selector: 'app-ai-sidebar',
    templateUrl: './ai-sidebar.component.html',
    styleUrls: ['./ai-sidebar.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class AiSidebarComponent implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit {
    // HostBinding ensures styles are applied correctly
    @HostBinding('style.display') displayStyle = 'flex';
    @HostBinding('style.flex-direction') flexDirection = 'column';
    @HostBinding('style.height') heightStyle = '100%';
    @HostBinding('style.width') widthStyle = '100%';
    @HostBinding('style.overflow') overflowStyle = 'hidden';

    @ViewChild('chatContainer') chatContainerRef!: ElementRef;
    @ViewChild('textInput') textInput!: ElementRef<HTMLTextAreaElement>;

    // Service reference (injected by AiSidebarService)
    public sidebarService!: AiSidebarService;

    // Platform detection
    isMacOS: boolean = false;

    // Component state
    messages: ChatMessage[] = [];
    isLoading = false;
    currentProvider: string = '';
    currentModel: string = '';
    currentSessionId: string = '';
    showScrollTop = false;
    showScrollBottom = false;
    inputValue = '';
    isComposing = false;
    charLimit = 4000;
    modelOptions: { name: string; label: string }[] = [];
    selectedModelProvider: string = '';
    private isSwitchingProvider: boolean = false;
    intentOptions: { value: string; label: string }[] = [
        { value: 'auto', label: 'Auto' },
        { value: 'code', label: 'Code / long form' },
        { value: 'translate', label: 'Translate' },
        { value: 'summarize', label: 'Summarize' },
        { value: 'vision', label: 'Vision' },
        { value: 'audio', label: 'Audio' },
        { value: 'default', label: 'General' }
    ];
    selectedIntent: string = 'auto';

    // Agent mode configuration
    /** Maximum number of historical messages to keep in Agent mode (excluding system messages) */
    private readonly MAX_AGENT_HISTORY = 10;

    // Token usage state
    currentTokens: number = 0;
    maxTokens: number = 200000;
    tokenUsagePercent: number = 0;

    private destroy$ = new Subject<void>();
    private shouldScrollToBottom = false;
    private destroyed = false;

    constructor(
        private aiService: AiAssistantService,
        private config: ConfigProviderService,
        private logger: LoggerService,
        private chatHistory: ChatHistoryService,
        private themeService: ThemeService,
        private contextManager: ContextManager,
        private toolStreamProcessor: ToolStreamProcessorService,
        private platformDetection: PlatformDetectionService,
        private selector: SelectorService,
        private cdr: ChangeDetectorRef
    ) {
        // Detect platform
        this.isMacOS = this.platformDetection.detectOS() === OSType.MACOS;
    }

    ngOnInit(): void {
        // Listen to theme changes
        this.themeService.theme$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(theme => {
            this.logger.debug('Sidebar theme changed', { theme });
        });

        // Generate or load session ID
        this.currentSessionId = this.generateSessionId();

        // Load current provider information
        this.loadCurrentProvider();

        // Listen to provider changes (reload on any config change)
        // Note: We check periodically or reload when switching providers
        // The loadCurrentProvider is called when switching providers via switchProvider()
        // But we need to avoid resetting the UI when the user is actively switching
        this.config.onConfigChange()
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                // Only refresh if not currently switching (to prevent UI flicker/reset)
                // The onModelChange handler will call loadCurrentProvider/buildModelOptions explicitly
                if (!this.isSwitchingProvider) {
                    this.loadCurrentProvider();
                    this.buildModelOptions();
                }
            });

        // Load chat history
        this.loadChatHistory();

        // Send welcome message (only when no history exists)
        if (this.messages.length === 0) {
            this.sendWelcomeMessage();
        }

        // Subscribe to preset messages (hotkey functionality)
        this.sidebarService.presetMessage$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(({ message, autoSend }) => {
            this.inputValue = message;

            if (autoSend) {
                // Delay slightly to ensure UI updates
                setTimeout(() => this.submit(), 100);
            } else {
                // Focus input box
                this.textInput?.nativeElement?.focus();
            }
        });

        // Delay checking scroll state (wait for DOM rendering)
        setTimeout(() => this.checkScrollState(), 100);

        // Build model switcher options
        this.buildModelOptions();
    }

    ngOnDestroy(): void {
        // Save current session
        this.saveChatHistory();
        this.destroy$.next();
        this.destroy$.complete();
        this.destroyed = true;
    }

    ngAfterViewInit(): void {
        // Force set scroll styles - bypass CSS priority issues
        this.forceScrollStyles();
    }

    /**
     * Force set scroll container styles
     * Use JavaScript to set directly for highest priority
     */
    private forceScrollStyles(): void {
        setTimeout(() => {
            const container = this.chatContainerRef?.nativeElement;
            if (container) {
                // Set inline styles directly - highest priority
                container.style.flex = '1 1 auto';
                container.style.height = '0';
                container.style.minHeight = '0';
                container.style.overflowY = 'auto';
                container.style.overflowX = 'hidden';
                container.style.display = 'block';
                this.logger.debug('[AI Sidebar] Scroll styles applied via JS');
            }
        }, 100);  // Delay to ensure DOM is rendered
    }

    ngAfterViewChecked(): void {
        if (this.shouldScrollToBottom) {
            this.performScrollToBottom();
            this.shouldScrollToBottom = false;
        }
    }

    /**
     * Load current provider information
     */
    private loadCurrentProvider(): void {
        const status = this.aiService.getProviderStatus();
        const activeProviderInfo = status?.active;
        const activeProviderName = activeProviderInfo?.name || this.getActiveProviderName();

        if (activeProviderInfo && activeProviderName) {
            this.currentProvider = activeProviderInfo.displayName || activeProviderName;
            // Prefer config model if present, otherwise use defaults/supported list
            this.currentModel = activeProviderInfo.defaults?.model
                || activeProviderInfo.supportedModels?.[0]
                || this.config.getProviderConfig(activeProviderName)?.model
                || this.config.getAllProviderConfigs()?.[activeProviderName]?.model
                || '';
            this.selectedModelProvider = activeProviderName;
            this.logActiveProviderState('loadCurrentProvider');
            this.markUiDirty();
            return;
        }

        if (activeProviderName) {
            const allConfigs = this.config.getAllProviderConfigs();
            const providerConfig = allConfigs[activeProviderName] || this.config.getProviderConfig(activeProviderName);
            let resolvedConfig = providerConfig;
            if (providerConfig) {
                try {
                    resolvedConfig = ProviderConfigUtils.fillDefaults({
                        ...providerConfig,
                        name: providerConfig.name || activeProviderName
                    }, activeProviderName);
                } catch {
                    resolvedConfig = providerConfig;
                }
            }
            this.currentProvider = resolvedConfig?.displayName || activeProviderName;
            this.currentModel = resolvedConfig?.model || '';
            this.selectedModelProvider = activeProviderName;
            this.logActiveProviderState('loadCurrentProvider');
            this.markUiDirty();
            return;
        }

        // Fallback: pick first enabled config
        const allConfigs = this.config.getAllProviderConfigs();
        const configuredProviders = Object.keys(allConfigs).filter(k => allConfigs[k]?.enabled);
        if (configuredProviders.length > 0) {
            const firstProvider = configuredProviders[0];
            const providerConfig = allConfigs[firstProvider];
            this.currentProvider = providerConfig?.displayName || firstProvider;
            this.currentModel = providerConfig?.model || '';
            this.config.setDefaultProvider(firstProvider);
            this.selectedModelProvider = firstProvider;
        } else {
            this.currentProvider = 'Not Configured';
            this.currentModel = '';
            this.selectedModelProvider = '';
        }

        this.logActiveProviderState('loadCurrentProvider');
        this.markUiDirty();
    }

    /**
     * Build options for the quick model switcher (only enabled & configured providers)
     */
    private buildModelOptions(): void {
        const normalize = (name: string | undefined | null): string =>
            (name === 'tlink-proxy') ? 'tlink-agentic' : (name || '');
        const allConfigs = this.config.getAllProviderConfigs();
        const activeProvider = normalize(this.getActiveProviderName());
        const defaultProvider = normalize(this.config.getDefaultProvider());
        const optionsMap = new Map<string, { name: string; label: string }>();

        // Always include the current active provider first
        if (activeProvider) {
            const label = (this.currentProvider && normalize(this.currentProvider) === activeProvider)
                ? this.currentProvider
                : activeProvider;
            optionsMap.set(activeProvider, {
                name: activeProvider,
                label: `${label}${this.currentModel ? ' • ' + this.currentModel : ''}`
            });
        }

        // Include all enabled provider configs (fill defaults)
        for (const [name, cfg] of Object.entries(allConfigs || {})) {
            if (!cfg || cfg.enabled === false) {
                continue;
            }

            // Skip Groq when no API key is configured to avoid unusable entries
            if (name === 'groq') {
                const apiKey = (cfg as any)?.apiKey;
                if (!apiKey || String(apiKey).trim() === '') {
                    this.logger.warn('Skipping Groq in model list because API key is missing');
                    continue;
                }
            }

            try {
                const canonicalName = normalize(name);
                const filled = ProviderConfigUtils.fillDefaults({
                    ...cfg,
                    name: cfg.name || canonicalName
                }, canonicalName);
                if (filled.name === 'tlink-agentic' || filled.name === 'tlink-proxy') {
                    filled.displayName = 'Tlink Agentic';
                }
                if (filled.name === 'tlink-agent') {
                    filled.displayName = 'Tlink Agent';
                }
                const key = normalize(filled.name);
                optionsMap.set(key, {
                    name: key,
                    label: `${filled.displayName || filled.name}${filled.model ? ' • ' + filled.model : ''}`
                });
            } catch {
                // ignore invalid config
            }
        }

        this.modelOptions = Array.from(optionsMap.values());

        // Ensure the active/default provider is present in the dropdown even if not in saved configs
        const activeName = activeProvider || defaultProvider;
        if (activeName && !this.modelOptions.some(option => option.name === activeName)) {
            try {
                const canonicalName = normalize(activeName);
                const fallbackConfig = ProviderConfigUtils.fillDefaults({
                    name: canonicalName,
                    displayName: canonicalName.charAt(0).toUpperCase() + canonicalName.slice(1)
                }, canonicalName);
                if (fallbackConfig.name === 'tlink-agentic' || fallbackConfig.name === 'tlink-proxy') {
                    fallbackConfig.displayName = 'Tlink Agentic';
                }
                if (fallbackConfig.name === 'tlink-agent') {
                    fallbackConfig.displayName = 'Tlink Agent';
                }
                this.modelOptions.unshift({
                    name: canonicalName,
                    label: `${fallbackConfig.displayName}${fallbackConfig.model ? ' • ' + fallbackConfig.model : ''}`
                });
            } catch {
                // If provider is unknown, add a minimal fallback label
                this.modelOptions.unshift({
                    name: activeName,
                    label: activeName
                });
            }
        }

        // Keep selection in sync
        const preferredProvider = activeProvider || this.selectedModelProvider || defaultProvider;
        if (preferredProvider && this.modelOptions.some(o => o.name === preferredProvider)) {
            this.selectedModelProvider = preferredProvider;
        } else if (this.selectedModelProvider && this.modelOptions.some(o => o.name === this.selectedModelProvider)) {
            // Keep existing selection if still valid
        } else if (defaultProvider && this.modelOptions.some(o => o.name === defaultProvider)) {
            this.selectedModelProvider = defaultProvider;
        } else if (this.modelOptions.length > 0) {
            this.selectedModelProvider = this.modelOptions[0].name;
        } else if (this.modelOptions.length === 0) {
            this.selectedModelProvider = '';
        }

        this.logActiveProviderState('buildModelOptions');
        this.markUiDirty();
    }

    /**
     * Get the active provider for the model dropdown.
     * Prefer the provider manager's active name, then default provider.
     */
    getActiveProviderForSelect(): string {
        const activeName = this.getActiveProviderName();
        if (activeName && this.modelOptions.some(o => o.name === activeName)) {
            return activeName;
        }
        if (this.selectedModelProvider && this.modelOptions.some(o => o.name === this.selectedModelProvider)) {
            return this.selectedModelProvider;
        }
        const defaultProvider = this.config.getDefaultProvider();
        if (defaultProvider && this.modelOptions.some(o => o.name === defaultProvider)) {
            return defaultProvider;
        }
        return this.modelOptions[0]?.name || '';
    }

    /**
     * Return the currently active provider name (manager first, then default)
     */
    private getActiveProviderName(): string {
        return this.aiService.getProviderStatus()?.active?.name || this.config.getDefaultProvider() || '';
    }

    /**
     * Quick debug log to verify provider/model sync in the UI
     */
    private logActiveProviderState(source: string): void {
        const status = this.aiService.getProviderStatus();
        const label = (name: string | undefined | null): string => {
            if (!name) return 'none';
            if (name === 'tlink-agentic' || name === 'tlink-proxy') {
                return 'Tlink Agentic';
            }
            if (name === 'tlink-agent') {
                return 'Tlink Agent';
            }
            const cfg = this.config.getProviderConfig(name);
            if (cfg?.displayName) return cfg.displayName;
            // Fallback mapping for known providers when displayName is not set
            const fallbackMap: Record<string, string> = {
                'openai': 'OpenAI',
                'openai-compatible': 'OpenAI Compatible',
                'anthropic': 'Anthropic',
                'ollama': 'Ollama',
                'groq': 'Groq',
                'glm': 'GLM',
                'minimax': 'Deepseek',
                'vllm': 'vLLM'
            };
            return fallbackMap[name] || name;
        };

        this.logger.info('[AI Sidebar] Provider state', {
            source,
            managerActive: status?.active?.name || 'none',
            managerActiveLabel: label(status?.active?.name),
            defaultProvider: this.config.getDefaultProvider() || 'none',
            defaultProviderLabel: label(this.config.getDefaultProvider() || ''),
            uiSelected: this.selectedModelProvider || 'none',
            uiSelectedLabel: label(this.selectedModelProvider),
            currentProvider: this.currentProvider || 'none',
            currentProviderLabel: label(this.currentProvider),
            currentModel: this.currentModel || 'none',
            options: this.modelOptions.map(o => `${o.label} (${o.name})`)
        });
    }

    /**
     * Ensure template updates even if state changed outside Angular zone
     */
    private markUiDirty(): void {
        if (this.destroyed) {
            return;
        }
        try {
            this.cdr.detectChanges();
        } catch {
            // Ignore change detection errors during teardown
        }
    }

    /**
     * Quick-switch provider/model from the footer dropdown
     */
    onModelChange(providerName: string): void {
        if (!providerName) {
            return;
        }

        // Prevent config change subscription from interfering during switch
        this.isSwitchingProvider = true;
        
        try {
            // Always attempt the switch, even if it is already the default, so we refresh
            // the active client (e.g., when selecting a proxy-backed model such as Tlink-proxy-auto).
            this.logger.info('Attempting to switch provider', { from: this.config.getDefaultProvider(), to: providerName });
            const success = this.aiService.switchProvider(providerName);
            const providerStatus = this.aiService.getProviderStatus();
            const activeName = providerStatus?.active?.name || providerName;
            this.logger.info('Provider switch result', { success, providerName, activeProvider: providerStatus?.active?.name });
            if (success) {
                // Update UI immediately - set selectedModelProvider to the actual active provider
                this.selectedModelProvider = activeName;
                this.markUiDirty();
                
                // Load current provider info (this updates currentProvider and currentModel)
                this.loadCurrentProvider();
                
                // Build model options WITHOUT resetting selectedModelProvider if it's valid
                this.buildModelOptions();
                
                // CRITICAL: Force selectedModelProvider to the switched provider after all operations
                // This ensures the dropdown stays on the correct selection
                setTimeout(() => {
                    this.selectedModelProvider = activeName;
                    this.markUiDirty();
                    // Double-check after a second async tick to catch any late updates
                    setTimeout(() => {
                        if (this.config.getDefaultProvider() === activeName) {
                            this.selectedModelProvider = activeName;
                            this.markUiDirty();
                        }
                    }, 50);
                }, 0);
                const systemMessage: ChatMessage = {
                    id: this.generateId(),
                    role: MessageRole.SYSTEM,
                    content: `Switched to ${this.getProviderDisplayText()}`,
                    timestamp: new Date()
                };
                this.messages.push(systemMessage);

                this.logActiveProviderState('onModelChange-success');
                this.markUiDirty();
            } else {
                // If switch failed, log error and revert selection to current provider
                this.logger.error('Failed to switch provider from model dropdown', { 
                    attempted: providerName,
                    current: this.config.getDefaultProvider(),
                    allProviders: providerStatus?.all?.map(p => p.name) || []
                });
                // Revert selection to current provider to prevent UI desync
                const currentProvider = this.config.getDefaultProvider();
                if (currentProvider) {
                    this.selectedModelProvider = currentProvider;
                }
                const errorMsg = `Failed to switch to ${providerName}. The provider may not be properly configured or registered. Available providers: ${(providerStatus?.all?.map(p => p.name) || []).join(', ')}`;
                this.logger.error('Provider switch error details', { errorMsg, providerName, currentProvider });
                alert(errorMsg);
            }
        } finally {
            // Re-enable config change subscription after a brief delay
            setTimeout(() => {
                this.isSwitchingProvider = false;
                this.logActiveProviderState('onModelChange-finalize');
                this.markUiDirty();
            }, 100);
        }
    }

    /**
     * Intent hint change handler (optional routing hint for Tlink Agentic)
     */
    onIntentChange(intentValue: string): void {
        this.selectedIntent = intentValue || 'auto';
        this.markUiDirty();
    }

    private getIntentHint(): string | undefined {
        return this.selectedIntent && this.selectedIntent !== 'auto' ? this.selectedIntent : undefined;
    }

    private getMaxTokensForIntent(): number | undefined {
        const intent = this.getIntentHint();
        switch (intent) {
            case 'code':
            case 'code/long':
                return 1500;
            case 'translate':
            case 'summarize':
            case 'translate/summarize':
                return 600;
            case 'vision':
                return 800;
            case 'audio':
                return 400;
            default:
                return 800;
        }
    }

    /**
     * Get display text for provider and model
     */
    getProviderDisplayText(): string {
        if (this.currentModel) {
            return `${this.currentProvider} (${this.currentModel})`;
        }
        return this.currentProvider;
    }

    /**
     * Load chat history
     */
    private loadChatHistory(): void {
        try {
            // Try to load the most recent session
            const recentSessions = this.chatHistory.getRecentSessions(1);
            if (recentSessions.length > 0) {
                const lastSession = recentSessions[0];
                this.currentSessionId = lastSession.sessionId;
                this.messages = lastSession.messages.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                // Ensure we resume scrolled to the latest message
                this.shouldScrollToBottom = true;
                this.markUiDirty();
                this.logger.info('Loaded chat history', {
                    sessionId: this.currentSessionId,
                    messageCount: this.messages.length
                });
            }
        } catch (error) {
            this.logger.error('Failed to load chat history', error);
            this.messages = [];
        }
    }

    /**
     * Send welcome message
     */
    private sendWelcomeMessage(): void {
        const welcomeMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: `Hello! I am your AI Assistant.\n\nI can help you with:\n• Converting natural language to terminal commands\n• Explaining complex commands\n• Analyzing command execution results\n• Providing error fixing suggestions\n\nCurrent provider: ${this.currentProvider}\n\nPlease enter your question or describe the command you want to execute.`,
            timestamp: new Date()
        };
        this.messages.push(welcomeMessage);
    }

    /**
     * Build message list for Agent mode
     * Use ContextManager to get effective history, automatically filter compressed messages
     */
    private buildAgentMessages(userMessage: ChatMessage): ChatMessage[] {
        // 1. Get system messages
        const systemMessages = this.messages.filter(m => m.role === MessageRole.SYSTEM);

        // 2. Use ContextManager to get effective history (automatically filter compressed messages)
        const effectiveHistory = this.contextManager.getEffectiveHistory(this.currentSessionId);

        // 3. Convert and limit count
        const historyMessages = effectiveHistory
            .filter(m => m.role !== 'system')
            .slice(-this.MAX_AGENT_HISTORY)
            .map(m => this.convertToAgentMessage(m));

        // 4. Clean tool card HTML and XML format tool calls from history messages
        const cleanedHistory = historyMessages.map(m => {
            if (m.role === MessageRole.ASSISTANT &&
                (m.content.includes('tool-call-card') || m.content.includes('<invoke') || m.content.includes('<parameter'))) {
                return {
                    ...m,
                    content: this.cleanToolCardHtml(m.content)
                };
            }
            return m;
        });

        return [...systemMessages, ...cleanedHistory, userMessage];
    }

    /**
     * Convert ApiMessage to ChatMessage
     */
    private convertToAgentMessage(apiMessage: any): ChatMessage {
        let content = apiMessage.content;

        // If it's a summary message, add marker
        if (apiMessage.isSummary) {
            content = `[History Summary] ${content}`;
        }

        // If it's a truncation marker, keep as is
        if (apiMessage.isTruncationMarker) {
            content = apiMessage.content;
        }

        return {
            id: apiMessage.id || this.generateId(),
            role: apiMessage.role as MessageRole,
            content,
            timestamp: new Date(apiMessage.ts || Date.now())
        };
    }

    /**
     * Clean tool card HTML, preserve readable execution results
     * Also remove XML format tool calls that AI might output (prevent imitation)
     */
    private cleanToolCardHtml(content: string): string {
        // Remove tool card divs, preserve output content
        let cleaned = content
            // === New: Remove XML format tool calls (prevent AI imitation) ===
            .replace(/<invoke\s+name="[^"]*"[^>]*>[\s\S]*?<\/invoke>/gi, '[Tool Invoked]')
            .replace(/<invoke\s+name="[^"]*"[^>]*>[\s\S]*/gi, '[Tool Invoked]')  // Unclosed tag
            .replace(/<parameter\s+name="[^"]*">[^<]*<\/parameter>/gi, '')
            .replace(/<parameter\s+name="[^"]*">[^<]*/gi, '')  // Unclosed parameter
            // Remove tool card containers
            .replace(/<div class="tool-call-card[^"]*">/g, '')
            .replace(/<\/div>/g, '')
            // Remove tool headers
            .replace(/<div class="tool-header">[\s\S]*?<\/div>/g, '')
            // Remove tool status
            .replace(/<span class="tool-status[^"]*">[^<]*<\/span>/g, '')
            // Remove tool icons and names
            .replace(/<span class="tool-icon">[^<]*<\/span>/g, '')
            .replace(/<span class="tool-name">[^<]*<\/span>/g, '')
            // Remove duration
            .replace(/<span class="tool-duration">[^<]*<\/span>/g, '')
            // Preserve output content
            .replace(/<div class="tool-output">/g, '\n[Tool Output]:\n')
            .replace(/<div class="tool-output-header">[^<]*<\/div>/g, '')
            .replace(/<pre>/g, '')
            .replace(/<\/pre>/g, '')
            // Remove error message styles
            .replace(/<div class="tool-output tool-error-message">/g, '\n[Error]:\n')
            // Clean up extra blank lines
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return cleaned;
    }

    /**
     * Handle sending message - using Agent loop mode
     * Use ToolStreamProcessorService to handle all tool events
     */
    async onSendMessageWithAgent(content: string): Promise<void> {
        if (!content.trim() || this.isLoading) {
            return;
        }

        // 添加用户消息
        const userMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.USER,
            content: content.trim(),
            timestamp: new Date()
        };
        this.messages.push(userMessage);

        // 滚动到底部
        setTimeout(() => this.scrollToBottom(), 0);

        // 显示加载状态
        this.isLoading = true;

        // 创建 AI 消息占位符用于流式更新
        const aiMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: '',
            uiBlocks: [],
            timestamp: new Date()
        };
        this.messages.push(aiMessage);

        try {
            // 构建用于 Agent 的消息列表（限制历史消息数量）
            const messagesForAgent = this.buildAgentMessages(userMessage);

            // 使用 ToolStreamProcessorService 处理流式事件
            this.toolStreamProcessor.startAgentStream({
                messages: messagesForAgent,
                maxTokens: this.getMaxTokensForIntent(),
                temperature: 0.7,
                intent: this.getIntentHint()
            }, {
                maxRounds: this.config.get('agentMaxRounds', 15) ?? 15
            }).pipe(
                takeUntil(this.destroy$)
            ).subscribe({
                next: (event: AnyUIStreamEvent) => this.renderUIEvent(event, aiMessage),
                error: (error) => this.handleStreamError(error, aiMessage),
                complete: () => this.handleStreamComplete(aiMessage)
            });

        } catch (error) {
            this.logger.error('Failed to send message with agent', error);
            aiMessage.content = `Sorry, I encountered some issues: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again later.`;
            this.isLoading = false;
            this.updateTokenUsage();
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    /**
     * 渲染 UI 事件 - 纯渲染逻辑，无业务处理
     * 核心：所有内容已过滤/转义，可直接使用
     */
    private renderUIEvent(event: AnyUIStreamEvent, message: ChatMessage): void {
        if (!message.uiBlocks) {
            message.uiBlocks = [];
        }

        switch (event.type) {
            case 'text':
                // 将文本作为 uiBlock 添加，确保能正确显示
                // 如果前一个块是文本块，追加到它的内容
                const lastBlock = message.uiBlocks[message.uiBlocks.length - 1];
                if (lastBlock && lastBlock.type === 'text') {
                    lastBlock.content += event.content;
                } else {
                    // 创建新的文本块
                    message.uiBlocks.push({
                        type: 'text',
                        content: event.content
                    });
                }
                break;

            case 'tool_start':
                // 添加工具块（执行中状态）
                message.uiBlocks.push({
                    type: 'tool',
                    id: event.toolId,
                    name: event.toolDisplayName,
                    icon: event.toolIcon,
                    status: 'executing'
                });
                break;

            case 'tool_complete':
                // 更新工具块为完成状态
                const block = message.uiBlocks.find(b => b.id === event.toolId);
                if (block) {
                    block.status = event.success ? 'success' : 'error';
                    block.duration = event.duration;
                    block.output = event.output;  // 已格式化，直接使用
                }
                break;

            case 'tool_error':
                // 更新工具块为错误状态
                const errorBlock = message.uiBlocks.find(b => b.id === event.toolId);
                if (errorBlock) {
                    errorBlock.status = 'error';
                    errorBlock.errorMessage = event.errorMessage;
                }
                break;

            case 'round_divider':
                // 添加分隔线块
                message.uiBlocks.push({
                    type: 'divider',
                    round: event.roundNumber
                });
                break;

            case 'agent_done':
                // 添加状态块
                message.uiBlocks.push({
                    type: 'status',
                    icon: event.reasonIcon,
                    text: event.reasonText,
                    rounds: event.totalRounds
                });
                break;

            case 'error':
                message.content += `\n\n❌ Error: ${event.error}`;
                break;
        }

        this.shouldScrollToBottom = true;
    }

    /**
     * 处理流错误
     */
    private handleStreamError(error: any, message: ChatMessage): void {
        this.logger.error('Agent stream error', error);
        message.content += `\n\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.isLoading = false;
        this.shouldScrollToBottom = true;
        this.updateTokenUsage();
        this.saveChatHistory();
    }

    /**
     * 处理流完成
     */
    private handleStreamComplete(message: ChatMessage): void {
        this.isLoading = false;
        this.updateTokenUsage();
        this.saveChatHistory();
        this.shouldScrollToBottom = true;
    }

    /**
     * 处理发送消息 - 原有方法（保留兼容性）
     */
    async onSendMessage(content: string): Promise<void> {
        if (!content.trim() || this.isLoading) {
            return;
        }

        // 添加用户消息
        const userMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.USER,
            content: content.trim(),
            timestamp: new Date()
        };
        this.messages.push(userMessage);

        // 滚动到底部
        setTimeout(() => this.scrollToBottom(), 0);

        // 显示加载状态
        this.isLoading = true;

        // 创建 AI 消息占位符（非流式）
        const aiMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: '',
            timestamp: new Date()
        };
        this.messages.push(aiMessage);

        try {
            const intentHint = this.getIntentHint();
            const request: any = {
                messages: this.messages.slice(0, -1), // 排除占位的 AI 消息
                temperature: 0.7,
                intent: intentHint,
                enableTools: false,
                stream: false
            };

            // Let provider defaults decide token budget; leave undefined unless you prefer intent-specific caps
            const maxTokens = this.getMaxTokensForIntent();
            if (maxTokens && Number.isFinite(maxTokens)) {
                request.maxTokens = maxTokens;
            }

            // 使用非流式 API，避免 SSE 解析导致的截断
            const response = await this.aiService.chat(request);
            aiMessage.content = response?.message?.content || '(No response)';
            aiMessage.timestamp = new Date();
            this.logger.info('Chat response received (non-stream)', { intent: intentHint });

            this.isLoading = false;
            this.updateTokenUsage();
            this.saveChatHistory();
            this.shouldScrollToBottom = true;
        } catch (error) {
            this.logger.error('Failed to send message', error);

            // 添加错误消息
            aiMessage.content = `Sorry, I encountered some issues: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again later.`;
            this.isLoading = false;
            this.updateTokenUsage();
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    /**
     * 更新 Token 使用情况
     */
    private updateTokenUsage(): void {
        // 获取最大上下文限制
        this.maxTokens = this.config.getActiveProviderContextWindow() || 200000;

        // 计算当前消息的 Token 使用量（简单估算：每4个字符≈1 Token）
        this.currentTokens = this.messages.reduce((sum, msg) => {
            const content = typeof msg.content === 'string' ? msg.content : '';
            return sum + Math.ceil(content.length / 4);
        }, 0);

        // 计算使用百分比
        this.tokenUsagePercent = Math.min(
            Math.round((this.currentTokens / this.maxTokens) * 100),
            100
        );
    }

    /**
     * 清空聊天记录
     */
    clearChat(): void {
        if (confirm('Are you sure you want to clear the chat history?')) {
            // 删除当前会话
            if (this.currentSessionId) {
                this.chatHistory.deleteSession(this.currentSessionId);
            }
            // 创建新会话
            this.currentSessionId = this.generateSessionId();
            this.messages = [];
            this.sendWelcomeMessage();
            this.logger.info('Chat cleared, new session created', { sessionId: this.currentSessionId });
        }
    }

    /**
     * 导出聊天记录
     */
    exportChat(): void {
        const chatData = {
            provider: this.currentProvider,
            exportTime: new Date().toISOString(),
            messages: this.messages
        };

        const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    /**
     * 切换提供商
     */
    async switchProvider(): Promise<void> {
        // 从配置服务获取已配置的提供商
        const allConfigs = this.config.getAllProviderConfigs();
        const configuredProviders = Object.keys(allConfigs)
            .filter(key => allConfigs[key] && allConfigs[key].enabled !== false)
            .map(key => ({
                name: key,
                displayName: allConfigs[key].displayName || key
            }));

        if (configuredProviders.length === 0) {
            alert('No AI providers available. Please configure one in settings first.');
            return;
        }

        // Build provider options for selector
        const providerOptions: SelectorOption<string>[] = configuredProviders.map((p, i) => ({
            name: `${i + 1}. ${p.displayName}`,
            result: p.name,
            description: `Current provider: ${this.currentProvider}`
        }));

        this.selector.show('Select AI Provider', providerOptions)
            .then((selectedProviderName: string) => {
                if (selectedProviderName) {
                    const selectedProvider = configuredProviders.find(p => p.name === selectedProviderName);
                    if (selectedProvider) {
                        // Actually switch the provider in the service (this updates the active provider)
                        const success = this.aiService.switchProvider(selectedProvider.name);
                        if (success) {
                            // Reload provider info to get model name
                            this.loadCurrentProvider();
                            this.logger.info('Provider switched', { provider: selectedProvider.name });

                            // Add system message
                            const systemMessage: ChatMessage = {
                                id: this.generateId(),
                                role: MessageRole.SYSTEM,
                                content: `Switched to ${this.getProviderDisplayText()}`,
                                timestamp: new Date()
                            };
                            this.messages.push(systemMessage);
                        } else {
                            this.logger.error('Failed to switch provider', { provider: selectedProvider.name });
                            alert(`Failed to switch to ${selectedProvider.displayName}. Please try again.`);
                        }
                    }
                }
            })
            .catch(() => {
                // User cancelled, do nothing
            });
    }

    /**
     * 隐藏侧边栏
     */
    hideSidebar(): void {
        if (this.sidebarService) {
            this.sidebarService.hide();
        }
    }

    /**
     * 滚动到底部（公开方法）
     */
    scrollToBottom(): void {
        this.shouldScrollToBottom = true;
    }

    /**
     * 滚动到顶部
     */
    scrollToTop(): void {
        const chatContainer = this.chatContainerRef?.nativeElement;
        if (chatContainer) {
            chatContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * 实际执行滚动到底部
     */
    private performScrollToBottom(): void {
        const chatContainer = this.chatContainerRef?.nativeElement;
        if (chatContainer) {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        }
    }

    /**
     * 处理滚动事件
     */
    onScroll(event: Event): void {
        const target = event.target as HTMLElement;
        if (!target) return;
        this.updateScrollButtons(target);
    }

    /**
     * 检查滚动状态（初始化时调用）
     */
    private checkScrollState(): void {
        const chatContainer = this.chatContainerRef?.nativeElement;
        if (chatContainer) {
            this.updateScrollButtons(chatContainer);
        }
    }

    /**
     * 更新滚动按钮显示状态
     */
    private updateScrollButtons(container: HTMLElement): void {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // 判断是否显示滚动按钮
        this.showScrollTop = scrollTop > 50;
        this.showScrollBottom = scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight - 50;
    }

    /**
     * 保存聊天历史
     */
    private saveChatHistory(): void {
        try {
            if (this.messages.length > 0 && this.currentSessionId) {
                this.chatHistory.saveSession(this.currentSessionId, this.messages);
                this.logger.info('Chat history saved', {
                    sessionId: this.currentSessionId,
                    messageCount: this.messages.length
                });
            }
        } catch (error) {
            this.logger.error('Failed to save chat history', error);
        }
    }

    /**
     * 生成会话 ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取消息时间格式
     */
    formatTimestamp(timestamp: Date): string {
        return timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 格式化消息内容（支持 Markdown 渲染）
     */
    formatMessage(content: string): string {
        if (!content) return '';

        try {
            // 使用 marked 库渲染 Markdown
            const { marked } = require('marked');

            // 配置 marked 选项
            marked.setOptions({
                breaks: true,       // 支持换行
                gfm: true,          // 支持 GitHub Flavored Markdown
                headerIds: false,   // 不生成标题 ID
                mangle: false       // 不转义邮箱
            });

            return marked.parse(content);
        } catch (e) {
            // 如果 marked 失败，使用基本格式化
            return content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code>$1</code>');
        }
    }

    /**
     * 检查是否为今天的消息
     */
    isToday(date: Date): boolean {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    /**
     * 检查是否为同一天的消息
     */
    isSameDay(date1: Date, date2: Date): boolean {
        return date1.toDateString() === date2.toDateString();
    }

    /**
     * 处理键盘事件
     */
    onKeydown(event: KeyboardEvent): void {
        // Enter 发送（不包含Shift）
        if (event.key === 'Enter' && !event.shiftKey && !this.isComposing) {
            event.preventDefault();
            this.submit();
        }
    }

    /**
     * 处理输入事件
     */
    onInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        this.inputValue = target.value;
        this.autoResize();
    }

    /**
     * Detect if question is simple (doesn't need tools)
     * Default to direct chat unless explicitly requiring terminal/file operations
     */
    private isSimpleQuestion(message: string): boolean {
        if (!message || message.length < 2) return false;
        
        const lowerMessage = message.toLowerCase().trim();
        
        // Simple greetings
        const greetings = [
            /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)$/i,
            /^(你好|嗨|哈喽|早上好|下午好|晚上好)$/,
            /^(how are you|how's it going|what's up)$/i,
            /^(你好吗|最近怎么样|还好吗)$/
        ];
        
        if (greetings.some(pattern => pattern.test(lowerMessage))) {
            return true;
        }
        
        // Explicit terminal/file operation keywords - these NEED agent loop
        const explicitActionKeywords = /(run|execute|command|terminal|shell|write to terminal|read terminal|list files|show files|create file|delete file|read file|write file|current directory|working directory|pwd|ls|cd|mkdir|rm|cat|grep|find|chmod|chown)/i.test(lowerMessage);
        
        // If explicitly asking for terminal/file operations, use agent loop
        if (explicitActionKeywords) {
            return false;  // Use agent loop
        }
        
        // Knowledge/information requests - these DON'T need tools
        const knowledgeRequestPatterns = [
            /^(what|who|when|where|why|how)\s+/i,  // What is..., Who is...
            /^(what's|who's|when's|where's|why's|how's)\s+/i,  // What's...
            /^(can you|could you|would you)\s+(explain|tell|describe|help|provide|give|show)/i,  // Can you explain/help/provide...
            /^(please|pls|plz)\s+(provide|give|show|explain|tell|help)/i,  // Please provide/give/show...
            /^(provide|give|show|explain|tell|help)\s+(me|us)/i,  // Provide me, Give me, Show me...
            /^(i need|i want|i'm looking for)\s+/i,  // I need, I want...
            /^(how can you|what can you|what do you)/i,  // How can you help, What can you do...
            /^(请|能|可以).*(解释|说明|介绍|帮助|告诉|提供|给|显示)/,  // 请解释/提供...
            /^(什么是|什么是|谁|何时|哪里|为什么|如何)/,  // 什么是...
            /^(thanks|thank you|thx|appreciate)/i,  // Thanks
            /^(谢谢|感谢|多谢)/,  // 谢谢
        ];
        
        // If matches knowledge request patterns, use direct chat
        if (knowledgeRequestPatterns.some(pattern => pattern.test(lowerMessage))) {
            return true;
        }
        
        // Questions with question marks that don't mention terminal/file operations
        if ((message.includes('?') || message.includes('？')) && !explicitActionKeywords) {
            // Check if it's asking for information/knowledge
            const isKnowledgeQuestion = /(what|who|when|where|why|how|can|could|would|should|is|are|do|does|did|will|would)/i.test(lowerMessage);
            if (isKnowledgeQuestion) {
                return true;  // Use direct chat
            }
        }
        
        // Short messages without explicit action keywords - assume simple question
        if (message.length < 50 && !explicitActionKeywords) {
            return true;  // Use direct chat by default
        }
        
        // Default: if no explicit terminal/file operations, use direct chat
        // This is safer - only use agent loop when explicitly needed
        return true;  // Default to direct chat
    }

    /**
     * 提交消息
     */
    submit(): void {
        const message = this.inputValue.trim();
        if (message && !this.isLoading) {
            // 检测是否是简单问题，如果是则使用直接聊天（不进入agent循环）
            if (this.isSimpleQuestion(message)) {
                this.logger.debug('Detected simple question, using direct chat', { message: message.substring(0, 50) });
                this.onSendMessage(message);
            } else {
                // 使用 Agent 循环模式发送消息（支持多轮工具调用）
                this.onSendMessageWithAgent(message);
            }
            this.inputValue = '';
            setTimeout(() => this.autoResize(), 0);
            this.textInput?.nativeElement.focus();
        }
    }

    /**
     * 自动调整输入框高度
     */
    private autoResize(): void {
        if (this.textInput?.nativeElement) {
            const textarea = this.textInput.nativeElement;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }
    }

    /**
     * 获取字符计数
     */
    getCharCount(): number {
        return this.inputValue.length;
    }

    /**
     * 检查是否接近限制
     */
    isNearLimit(): boolean {
        return this.getCharCount() > this.charLimit * 0.8;
    }

    /**
     * 检查是否超过限制
     */
    isOverLimit(): boolean {
        return this.getCharCount() > this.charLimit;
    }

    /**
     * 转义 HTML 特殊字符
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
