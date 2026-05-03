import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ViewEncapsulation, HostListener } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChatMessage, MessageRole, StreamEvent, AgentStreamEvent } from '../../types/ai.types';
import { AiProviderManagerService } from '../../services/core/ai-provider-manager.service';
import { UsageAggregatorService, UsageAggregate } from '../../services/core/usage-aggregator.service';
import { formatCost } from '../../utils/cost.utils';
import { renderChatMarkdown } from '../../utils/markdown.utils';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TerminalManagerService } from '../../services/terminal/terminal-manager.service';
import { AiAssistantService } from '../../services/core/ai-assistant.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { LoggerService } from '../../services/core/logger.service';
import { ChatHistoryService } from '../../services/chat/chat-history.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '../../i18n';
import { ToolStreamProcessorService } from '../../services/tools/tool-stream-processor.service';
import { AnyUIStreamEvent } from '../../services/tools/types/ui-stream-event.types';

@Component({
    selector: 'app-chat-interface',
    templateUrl: './chat-interface.component.html',
    styleUrls: ['./chat-interface.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatInterfaceComponent implements OnInit, OnDestroy, AfterViewChecked {
    @ViewChild('chatContainer') chatContainerRef!: ElementRef;

    messages: ChatMessage[] = [];
    isLoading = false;

    /**
     * AbortController bound to whatever chat stream is currently in
     * flight. The `Stop` button on chat-input emits a (stop) event
     * which calls `cancelActiveStream()` below; that propagates the
     * abort down through `ChatRequest.signal` so every provider's
     * createLinkedAbortController tears down its HTTP request promptly.
     * Reset to null when no stream is active.
     */
    private activeAbortController: AbortController | null = null;
    currentProvider: string = '';
    currentSessionId: string = '';
    showScrollTop = false;
    showScrollBottom = false;

    // UI 设置（从配置加载）
    showTimestamps: boolean = true;
    showAvatars: boolean = true;
    soundEnabled: boolean = false;
    compactMode: boolean = false;
    fontSize: number = 14;

    // 翻译对象
    t: any;

    private destroy$ = new Subject<void>();
    private shouldScrollToBottom = false;
    private notificationSound: HTMLAudioElement | null = null;

    constructor(
        private aiService: AiAssistantService,
        private config: ConfigProviderService,
        private logger: LoggerService,
        private modal: NgbModal,
        private chatHistory: ChatHistoryService,
        private translate: TranslateService,
        private toolStreamProcessor: ToolStreamProcessorService,
        private providerManager: AiProviderManagerService,
        private usageAggregator: UsageAggregatorService,
        private sanitizer: DomSanitizer,
        private terminalManager: TerminalManagerService,
        private elementRef: ElementRef<HTMLElement>,
    ) {
        this.t = this.translate.t;
    }

    /**
     * Cumulative usage for the current chat session — sums across every
     * AI message that carries usage stats. Recomputed on every CD pass
     * (cheap; messages.length is bounded). Drives the small token / cost
     * badge in the chat header so users can see "this conversation has
     * cost me $0.03 across 8 messages" at a glance.
     */
    getSessionUsage(): UsageAggregate {
        return this.usageAggregator.aggregate(this.messages);
    }

    /** Pretty-print session cost — empty when below the meaningful
     *  threshold so a fresh session doesn't show "$0.0000". */
    getSessionCostFormatted(): string {
        const agg = this.getSessionUsage();
        if (agg.totalCost <= 0) {return '';}
        return formatCost(agg.totalCost);
    }

    /**
     * Abort any in-flight chat stream. Wired to chat-input's (stop)
     * event. The active provider's createLinkedAbortController
     * forwards the abort to its HTTP request, which tears down
     * promptly + emits no further StreamEvents to the subscriber.
     * Safe to call when no stream is active (no-op).
     */
    cancelActiveStream(): void {
        if (this.activeAbortController && !this.activeAbortController.signal.aborted) {
            this.activeAbortController.abort();
            this.logger.info('Chat stream cancelled by user');
        }
        this.isLoading = false;
        this.activeAbortController = null;
        this.saveChatHistory();
    }

    /**
     * Memoized rendered-HTML cache, keyed by message id. Recomputed
     * when the underlying message.content changes (streaming AI
     * responses). Cheap (marked is fast) but caching avoids
     * re-parsing the same string on every CD pass.
     */
    private renderedHtmlCache = new Map<string, { content: string; html: SafeHtml }>();
    /** Tracker for ngAfterViewChecked: which messages have already
     *  had code-action toolbars wired up. */
    private codeActionsAttachedFor = new Map<string, string>();

    /**
     * Render an AI message's content as sanitized markdown HTML.
     * Used by the [innerHTML] binding on the AI message div in the
     * template. Memoized per-message so streaming re-renders only on
     * actual content change.
     */
    getMarkdownHtml(message: ChatMessage): SafeHtml {
        return this.renderMarkdownCached(message.id, message.content || '');
    }

    /**
     * Render an arbitrary block's text content as markdown — used
     * for agent-loop uiBlocks of type='text' which carry partial
     * messages. Cache key is `${messageId}-text-${blockIndex}` if
     * the caller provides a unique id, otherwise `${messageId}-text`.
     */
    getMarkdownHtmlForBlock(messageId: string, content: string): SafeHtml {
        return this.renderMarkdownCached(messageId + '-text', content);
    }

    private renderMarkdownCached(cacheKey: string, content: string): SafeHtml {
        const cached = this.renderedHtmlCache.get(cacheKey);
        if (cached && cached.content === content) {
            return cached.html;
        }
        const html = renderChatMarkdown(content);
        const safe = this.sanitizer.bypassSecurityTrustHtml(html);
        this.renderedHtmlCache.set(cacheKey, { content, html: safe });
        // New render → re-attach code-action toolbars on next CD pass.
        this.codeActionsAttachedFor.delete(cacheKey);
        return safe;
    }

    /**
     * After Angular paints, walk freshly-rendered AI messages and
     * inject the Copy / Run / Save toolbar onto each .code-block-
     * wrapper. Idempotent — keyed by (messageId, content) so a
     * subsequent CD pass over the same DOM doesn't double-wire.
     * Called from the existing ngAfterViewChecked hook below.
     */
    private attachCodeActionsToMessages(): void {
        const root = this.elementRef.nativeElement;
        for (const message of this.messages) {
            if (message.role !== MessageRole.ASSISTANT) continue;
            const lastAttached = this.codeActionsAttachedFor.get(message.id);
            if (lastAttached === message.content) continue;
            const messageEl = root.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`);
            if (!messageEl) continue;
            const wrappers = messageEl.querySelectorAll<HTMLElement>('.code-block-wrapper:not([data-actions-attached])');
            wrappers.forEach(w => this.attachCodeActions(w));
            this.codeActionsAttachedFor.set(message.id, message.content || '');
        }
    }

    private attachCodeActions(wrapper: HTMLElement): void {
        wrapper.setAttribute('data-actions-attached', 'true');
        const lang = wrapper.getAttribute('data-lang') || 'text';
        const codeEl = wrapper.querySelector('code');
        if (!codeEl) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'code-block-actions';
        toolbar.innerHTML = `
            <span class="code-block-lang">${lang.replace(/[<>"]/g, '')}</span>
            <button class="code-block-btn code-block-copy" type="button" title="Copy code">
                <i class="fa fa-copy"></i> Copy
            </button>
            <button class="code-block-btn code-block-run" type="button" title="Run in active terminal">
                <i class="fa fa-terminal"></i> Run
            </button>
            <button class="code-block-btn code-block-save" type="button" title="Save as file">
                <i class="fa fa-download"></i> Save
            </button>
        `;
        wrapper.insertBefore(toolbar, wrapper.firstChild);

        const code = codeEl.textContent || '';
        toolbar.querySelector('.code-block-copy')?.addEventListener('click', e => {
            e.stopPropagation();
            this.copyCodeToClipboard(code);
        });
        toolbar.querySelector('.code-block-run')?.addEventListener('click', e => {
            e.stopPropagation();
            this.runCodeInActiveTerminal(code);
        });
        toolbar.querySelector('.code-block-save')?.addEventListener('click', e => {
            e.stopPropagation();
            this.saveCodeAsFile(code, lang);
        });
    }

    private async copyCodeToClipboard(code: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(code);
            this.logger.info('Code block copied to clipboard');
        } catch (e) {
            this.logger.warn('Code block copy failed', { error: e });
        }
    }

    private runCodeInActiveTerminal(code: string): void {
        try {
            // Don't auto-execute (execute=false) — paste the code into
            // the terminal so the user can review + hit Enter manually.
            // Multi-line snippets with $() / heredocs / shebangs would
            // be dangerous to auto-run unattended.
            const ok = this.terminalManager.sendCommand(code, false);
            if (!ok) {
                this.logger.warn('No active terminal — code not sent');
            }
        } catch (e) {
            this.logger.error('runCodeInActiveTerminal failed', e);
        }
    }

    private saveCodeAsFile(code: string, lang: string): void {
        const ext = this.langToExtension(lang);
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snippet-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private langToExtension(lang: string): string {
        const map: Record<string, string> = {
            javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh',
            shell: 'sh', sh: 'sh', zsh: 'sh', html: 'html', css: 'css',
            scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yml',
            xml: 'xml', sql: 'sql', go: 'go', rust: 'rs', ruby: 'rb',
            java: 'java', kotlin: 'kt', swift: 'swift', php: 'php',
            cpp: 'cpp', c: 'c', csharp: 'cs', markdown: 'md', md: 'md',
        };
        return map[lang.toLowerCase()] || 'txt';
    }

    /**
     * In-session message search. Triggered by Cmd/Ctrl+F (when
     * focused inside the chat panel). Renders a sticky search bar
     * at the top of the messages container with a query input + a
     * count + Next / Prev navigation. Matches highlight in-place via
     * a CSS class on the message-item.
     */
    showSearchBar = false;
    searchQuery = '';
    searchMatches: string[] = []; // message ids in document order
    searchActiveIndex = 0;

    toggleSearchBar(): void {
        this.showSearchBar = !this.showSearchBar;
        if (!this.showSearchBar) {
            this.searchQuery = '';
            this.searchMatches = [];
            this.searchActiveIndex = 0;
        } else {
            // Focus the search input after Angular renders it.
            setTimeout(() => {
                const inp = this.elementRef.nativeElement.querySelector<HTMLInputElement>('.search-bar input');
                inp?.focus();
            }, 0);
        }
    }

    /** Recompute matches as the user types. */
    onSearchInput(): void {
        const q = this.searchQuery.trim().toLowerCase();
        if (!q) {
            this.searchMatches = [];
            this.searchActiveIndex = 0;
            return;
        }
        this.searchMatches = this.messages
            .filter(m => (m.content || '').toLowerCase().includes(q))
            .map(m => m.id);
        this.searchActiveIndex = 0;
        this.scrollToActiveMatch();
    }

    isSearchMatch(messageId: string): boolean {
        return this.searchMatches.includes(messageId);
    }

    isActiveSearchMatch(messageId: string): boolean {
        return this.searchMatches[this.searchActiveIndex] === messageId;
    }

    nextSearchMatch(): void {
        if (!this.searchMatches.length) {return;}
        this.searchActiveIndex = (this.searchActiveIndex + 1) % this.searchMatches.length;
        this.scrollToActiveMatch();
    }

    prevSearchMatch(): void {
        if (!this.searchMatches.length) {return;}
        this.searchActiveIndex = (this.searchActiveIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
        this.scrollToActiveMatch();
    }

    private scrollToActiveMatch(): void {
        const id = this.searchMatches[this.searchActiveIndex];
        if (!id) {return;}
        setTimeout(() => {
            const el = this.elementRef.nativeElement.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 0);
    }

    onSearchKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) {this.prevSearchMatch();}
            else {this.nextSearchMatch();}
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.toggleSearchBar();
        }
    }

    /**
     * Edit-and-resubmit state. The user clicks the pencil icon on a
     * user message; that message's id is set as `editingMessageId`
     * and the original text moves into `editingDraft`. Saving re-
     * sends from that point: every message AFTER the edited one is
     * dropped, the edited content becomes the user message, and the
     * stream begins again.
     */
    editingMessageId: string | null = null;
    editingDraft = '';

    startEditMessage(message: ChatMessage): void {
        if (this.isLoading) {return;}
        if (message.role !== MessageRole.USER) {return;}
        this.editingMessageId = message.id;
        this.editingDraft = message.content || '';
    }

    cancelEditMessage(): void {
        this.editingMessageId = null;
        this.editingDraft = '';
    }

    saveAndResendEditedMessage(): void {
        if (!this.editingMessageId) {return;}
        const idx = this.messages.findIndex(m => m.id === this.editingMessageId);
        if (idx < 0) {return;}
        const newContent = this.editingDraft.trim();
        if (!newContent) {return;}
        // Drop everything from this user message onward — onSendMessage
        // will re-push the (edited) user message + a fresh AI response.
        this.messages = this.messages.slice(0, idx);
        const draft = newContent;
        this.editingMessageId = null;
        this.editingDraft = '';
        this.onSendMessage(draft);
    }

    onEditDraftKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            this.saveAndResendEditedMessage();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelEditMessage();
        }
    }

    /**
     * Retry-on-failure state. When a stream errors out, we mark the
     * trailing AI message as errored and surface a "Retry" button
     * inside the bubble. Clicking it pops the failed AI message and
     * re-sends the prior user message.
     */
    retryLastMessage(): void {
        if (this.isLoading) {return;}
        const lastUserIdx = [...this.messages].reverse().findIndex(m => m.role === MessageRole.USER);
        if (lastUserIdx < 0) {return;}
        const lastUser = this.messages[this.messages.length - 1 - lastUserIdx];
        if (!lastUser) {return;}
        // Drop everything from the last user message onward — same
        // shape as /regen.
        this.messages = this.messages.slice(0, this.messages.length - 1 - lastUserIdx);
        this.onSendMessage(lastUser.content);
    }

    /**
     * Conversation summary feature. Long threads (>30 messages) are
     * hard to pick back up; this lets the user generate a TL;DR via
     * the active provider and pin it at the top of the panel as a
     * collapsible header. Stashed on the session bundle so it
     * persists across reloads.
     *
     * Trigger: a "Summarize this chat" chip surfaces in the header
     * when messages.length > 30 AND no summary exists yet. Click
     * generates one (separate stream that doesn't pollute the
     * conversation history). User can collapse / regenerate.
     */
    conversationSummary: string | null = null;
    summaryGenerating = false;
    summaryCollapsed = false;
    /** When to surface the "Summarize" affordance. */
    private readonly SUMMARY_THRESHOLD = 30;

    showSummarizeAffordance(): boolean {
        return !this.conversationSummary && this.messages.length >= this.SUMMARY_THRESHOLD;
    }

    async generateSummary(): Promise<void> {
        if (this.summaryGenerating) {return;}
        if (this.messages.length < 3) {return;}
        this.summaryGenerating = true;
        try {
            const transcript = this.messages
                .filter(m => m.role !== MessageRole.SYSTEM)
                .map(m => `${m.role === MessageRole.USER ? 'User' : 'Assistant'}: ${(m.content || '').slice(0, 1000)}`)
                .join('\n\n');
            const prompt: ChatMessage = {
                id: this.generateId(),
                role: MessageRole.USER,
                content: `Summarize the following conversation in 3-5 short bullet points covering the key topics, decisions, and any unresolved questions. Be concise.\n\n--- Conversation ---\n${transcript}`,
                timestamp: new Date(),
            };
            // Run as a one-shot chat (NOT chatStream) — we don't need
            // to render the summary token-by-token; just want the
            // final text. Bypasses the agent loop / message history
            // entirely.
            const response = await this.aiService.chat({
                messages: [prompt],
                maxTokens: 400,
                temperature: 0.3,
            });
            this.conversationSummary = response?.message?.content || '(empty summary)';
            this.summaryCollapsed = false;
        } catch (e) {
            this.logger.error('Summary generation failed', e);
            this.conversationSummary = `Summary failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
        } finally {
            this.summaryGenerating = false;
        }
    }

    toggleSummaryCollapsed(): void {
        this.summaryCollapsed = !this.summaryCollapsed;
    }

    dismissSummary(): void {
        this.conversationSummary = null;
        this.summaryCollapsed = false;
    }

    /**
     * Whether the keyboard-shortcuts overlay is open. Triggered by
     * pressing `?` (when not focused in an input) or via the help
     * button in the chat header.
     */
    showShortcutsOverlay = false;

    /** Toggle the shortcuts overlay. Bound to a header button + the
     *  `?` keyboard listener below. */
    toggleShortcutsOverlay(): void {
        this.showShortcutsOverlay = !this.showShortcutsOverlay;
    }

    /**
     * Route a slash-command verb (emitted by chat-input's
     * (slashCommand) event) to its handler. New verbs added here +
     * also added to chat-input's `slashCommands` list — the picker
     * is the source of truth for what's available.
     */
    handleSlashCommand(verb: string): void {
        switch (verb) {
            case 'clear':
                this.clearChat();
                break;
            case 'export':
                this.exportChat();
                break;
            case 'model':
                this.switchProvider();
                break;
            case 'cost': {
                const agg = this.getSessionUsage();
                const costStr = this.getSessionCostFormatted();
                const note = costStr
                    ? `**Session usage**: ${agg.totalTokens} tokens (${agg.promptTokens} in · ${agg.completionTokens} out) · ${costStr}`
                    : `**Session usage**: ${agg.totalTokens} tokens (${agg.promptTokens} in · ${agg.completionTokens} out)`;
                this.messages.push({
                    id: this.generateId(),
                    role: MessageRole.SYSTEM,
                    content: note,
                    timestamp: new Date(),
                });
                this.shouldScrollToBottom = true;
                break;
            }
            case 'help':
                this.showShortcutsOverlay = true;
                break;
            case 'regen': {
                // Find the last user message and re-send it. We pop
                // both the trailing assistant + the trailing user so
                // onSendMessage's normal path re-adds them; otherwise
                // we'd see a duplicate user bubble.
                const lastUserIdx = [...this.messages].reverse().findIndex(m => m.role === MessageRole.USER);
                if (lastUserIdx < 0) {break;}
                const lastUser = this.messages[this.messages.length - 1 - lastUserIdx];
                if (lastUser) {
                    // Drop everything after (and including) the last
                    // user message. onSendMessage will re-push.
                    this.messages = this.messages.slice(0, this.messages.length - 1 - lastUserIdx);
                    this.onSendMessage(lastUser.content);
                }
                break;
            }
            default:
                this.logger.warn(`Unknown slash command: /${verb}`);
        }
    }

    /**
     * Global keyboard shortcuts. `?` opens the overlay (when the user
     * isn't typing in an input). Cmd/Ctrl+F opens search anywhere,
     * even from the input. `Escape` closes any open overlay. Stop-
     * stream + send are handled inside chat-input.
     */
    @HostListener('document:keydown', ['$event'])
    onGlobalKeydown(event: KeyboardEvent): void {
        // Don't hijack typing in inputs / textareas / contenteditable.
        const target = event.target as HTMLElement | null;
        const inEditable = target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        );

        // Cmd/Ctrl+F → in-session search. Works inside the input too,
        // since "find in chat" is a different workflow from typing.
        if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
            // Only intercept when the chat panel is in the active
            // viewport — let the browser's native page-find run
            // elsewhere. We check by seeing if our root contains the
            // active element.
            if (this.elementRef.nativeElement.contains(document.activeElement)) {
                event.preventDefault();
                this.toggleSearchBar();
                return;
            }
        }

        if (event.key === 'Escape') {
            if (this.showShortcutsOverlay) {
                this.showShortcutsOverlay = false;
                event.preventDefault();
                return;
            }
            if (this.showSearchBar) {
                this.toggleSearchBar();
                event.preventDefault();
                return;
            }
        }

        if (event.key === '?' && !inEditable && !event.ctrlKey && !event.metaKey) {
            this.toggleShortcutsOverlay();
            event.preventDefault();
        }
    }

    /**
     * Stamp the active provider's name + model onto a message's
     * metadata so chat-message can later compute cost via cost.utils
     * `getModelPricing(provider, model)`. Called at usage-capture
     * time (message_end and agent_done) so old messages stay
     * historically accurate even if the user later switches provider.
     */
    private stampProviderContext(message: ChatMessage): void {
        try {
            const active = this.providerManager.getActiveProvider();
            if (active) {
                message.metadata = {
                    ...message.metadata,
                    provider: active.name,
                    model: (active.getConfig?.()?.model) || undefined,
                };
            }
        } catch {
            // Provider-context stamp is purely informational; never
            // gate the streaming path on its success.
        }
    }

    ngOnInit(): void {
        // 监听语言变化
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
            // 如果有欢迎消息，重新发送以更新语言
            if (this.messages.length > 0 && this.messages[0].role === MessageRole.ASSISTANT) {
                this.sendWelcomeMessage();
            }
        });

        // 生成或加载会话 ID
        this.currentSessionId = this.generateSessionId();

        // 加载 UI 设置
        this.loadUISettings();

        // 加载当前提供商信息
        this.loadCurrentProvider();

        // 加载聊天历史
        this.loadChatHistory();

        // 发送欢迎消息（仅在没有历史记录时）
        if (this.messages.length === 0) {
            this.sendWelcomeMessage();
        }

        // 延迟检查滚动状态（等待 DOM 渲染）
        setTimeout(() => this.checkScrollState(), 100);
    }

    /**
     * 加载 UI 设置
     */
    private loadUISettings(): void {
        this.showTimestamps = this.config.get<boolean>('ui.showTimestamps', true) ?? true;
        this.showAvatars = this.config.get<boolean>('ui.showAvatars', true) ?? true;
        this.soundEnabled = this.config.get<boolean>('ui.soundEnabled', false) ?? false;
        this.compactMode = this.config.get<boolean>('ui.compactMode', false) ?? false;
        this.fontSize = this.config.get<number>('ui.fontSize', 14) ?? 14;

        // 应用设置
        this.applyStoredSettings();
    }

    /**
     * 应用存储的 UI 设置
     */
    private applyStoredSettings(): void {
        // 应用字体大小
        document.documentElement.style.setProperty('--chat-font-size', `${this.fontSize}px`);

        // 应用紧凑模式
        const container = document.querySelector('.ai-chat-container');
        if (container) {
            if (this.compactMode) {
                container.classList.add('compact-mode');
            } else {
                container.classList.remove('compact-mode');
            }
        }
    }

    ngOnDestroy(): void {
        // 保存当前会话
        this.saveChatHistory();
        this.destroy$.next();
        this.destroy$.complete();
    }

    ngAfterViewChecked(): void {
        if (this.shouldScrollToBottom) {
            this.performScrollToBottom();
            this.shouldScrollToBottom = false;
        }
        // Wire Copy/Run/Save toolbars onto any newly-rendered code
        // blocks. Idempotent + cheap — early-outs when the cache
        // matches, so steady-state CD passes do nothing here.
        this.attachCodeActionsToMessages();
    }

    /**
     * 加载当前提供商信息
     */
    private loadCurrentProvider(): void {
        const defaultProvider = this.config.getDefaultProvider();
        if (defaultProvider) {
            const providerConfig = this.config.getProviderConfig(defaultProvider);
            this.currentProvider = providerConfig?.displayName || defaultProvider;
        } else {
            // 尝试获取第一个已配置的提供商
            const allConfigs = this.config.getAllProviderConfigs();
            const configuredProviders = Object.keys(allConfigs).filter(k => allConfigs[k]?.apiKey);
            if (configuredProviders.length > 0) {
                const firstProvider = configuredProviders[0];
                const providerConfig = allConfigs[firstProvider];
                this.currentProvider = providerConfig?.displayName || firstProvider;
                this.config.setDefaultProvider(firstProvider);
            } else {
                this.currentProvider = 'Not configured';
            }
        }
    }

    /**
     * 加载聊天历史
     */
    private loadChatHistory(): void {
        try {
            // 尝试加载最近的会话
            const recentSessions = this.chatHistory.getRecentSessions(1);
            if (recentSessions.length > 0) {
                const lastSession = recentSessions[0];
                this.currentSessionId = lastSession.sessionId;
                this.messages = lastSession.messages.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
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
     * 发送欢迎消息
     */
    private sendWelcomeMessage(): void {
        const welcomeMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: `${this.t.chatInterface.welcomeMessage}\n\n${this.t.chatInterface.tipCommand}\n\n${this.t.chatInterface.tipShortcut}`,
            timestamp: new Date()
        };
        this.messages.push(welcomeMessage);
    }

    /**
     * 处理发送消息（使用 Agent 循环模式）
     * 使用 ToolStreamProcessorService 处理所有工具事件
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

        // 清空输入框
        content = '';

        // 显示加载状态
        this.isLoading = true;

        // 创建一个临时的 AI 消息用于流式更新
        const aiMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: '',
            uiBlocks: [],
            timestamp: new Date()
        };
        this.messages.push(aiMessage);

        try {
            // Bind a fresh AbortController so the Stop button works
            // for agent-loop streams too.
            this.activeAbortController = new AbortController();
            // 使用 ToolStreamProcessorService 处理流式事件
            this.toolStreamProcessor.startAgentStream({
                messages: this.messages.slice(0, -1),
                maxTokens: 2000,
                temperature: 0.7,
                signal: this.activeAbortController.signal,
            }, {
                maxRounds: 5
            }).pipe(
                takeUntil(this.destroy$)
            ).subscribe({
                next: (event: AnyUIStreamEvent) => this.renderUIEvent(event, aiMessage),
                error: (error) => this.handleStreamError(error, aiMessage),
                complete: () => this.handleStreamComplete(aiMessage)
            });

        } catch (error) {
            this.logger.error('Failed to send message with agent', error);
            aiMessage.content = `${this.t.chatInterface.errorPrefix}: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${this.t.chatInterface.tipShortcut}`;
            this.isLoading = false;
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    /**
     * 渲染 UI 事件 - 纯渲染逻辑
     */
    private renderUIEvent(event: AnyUIStreamEvent, message: ChatMessage): void {
        if (!message.uiBlocks) {
            message.uiBlocks = [];
        }

        switch (event.type) {
            case 'text':
                message.content += event.content;
                break;

            case 'tool_start':
                message.uiBlocks.push({
                    type: 'tool',
                    id: event.toolId,
                    name: event.toolDisplayName,
                    icon: event.toolIcon,
                    status: 'executing'
                });
                break;

            case 'tool_complete':
                const block = message.uiBlocks.find(b => b.id === event.toolId);
                if (block) {
                    block.status = event.success ? 'success' : 'error';
                    block.duration = event.duration;
                    block.output = event.output;
                }
                break;

            case 'tool_error':
                const errorBlock = message.uiBlocks.find(b => b.id === event.toolId);
                if (errorBlock) {
                    errorBlock.status = 'error';
                    errorBlock.errorMessage = event.errorMessage;
                }
                break;

            case 'round_divider':
                message.uiBlocks.push({
                    type: 'divider',
                    round: event.roundNumber
                });
                break;

            case 'agent_done':
                message.uiBlocks.push({
                    type: 'status',
                    icon: event.reasonIcon,
                    text: event.reasonText,
                    rounds: event.totalRounds
                });
                // Mirror the chatStream-direct path: agent loops
                // accumulate usage across rounds and emit a cumulative
                // total here. Stash on metadata so chat-message can
                // render the same token footer it shows on simpler
                // (single-shot) chats.
                if ((event as any).usage) {
                    message.metadata = {
                        ...message.metadata,
                        usage: (event as any).usage,
                    };
                    this.stampProviderContext(message);
                }
                break;

            case 'error':
                message.content += `\n\n❌ ${this.t.chatInterface.errorPrefix}: ${event.error}`;
                break;
        }

        this.shouldScrollToBottom = true;
    }

    /**
     * 处理流错误
     */
    private handleStreamError(error: any, message: ChatMessage): void {
        this.logger.error('Agent stream error', error);
        message.content += `\n\n❌ ${this.t.chatInterface.errorPrefix}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        // Mark this message as errored so the template can render a
        // "Retry" button inside the bubble. The retry handler pops
        // the failed AI + last user message and re-sends.
        message.metadata = {
            ...message.metadata,
            streamError: error instanceof Error ? error.message : String(error),
        };
        this.isLoading = false;
        this.shouldScrollToBottom = true;
        this.saveChatHistory();
    }

    /**
     * 处理流完成
     */
    private handleStreamComplete(message: ChatMessage): void {
        this.isLoading = false;
        this.saveChatHistory();
        this.shouldScrollToBottom = true;
    }

    /**
     * 处理发送消息（原有方法，保留兼容性）
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

        // 清空输入框
        content = '';

        // 显示加载状态
        this.isLoading = true;

        // 创建一个临时的 AI 消息用于流式更新
        const aiMessage: ChatMessage = {
            id: this.generateId(),
            role: MessageRole.ASSISTANT,
            content: '',  // 初始为空
            uiBlocks: [],
            timestamp: new Date()
        };
        this.messages.push(aiMessage);

        // 工具调用状态跟踪
        let pendingToolCalls: Map<string, { name: string; startTime: number }> = new Map();

        try {
            // Bind a fresh AbortController so the Stop button can
            // tear this stream down. cancelActiveStream() below
            // calls .abort() on this.
            this.activeAbortController = new AbortController();
            // 使用流式 API
            this.aiService.chatStream({
                messages: this.messages.slice(0, -1),  // 排除刚添加的空 AI 消息
                maxTokens: 1000,
                temperature: 0.7,
                signal: this.activeAbortController.signal,
            }).pipe(
                takeUntil(this.destroy$)
            ).subscribe({
                next: (event) => {
                    // 文本增量 - 逐字显示
                    if (event.type === 'text_delta' && event.textDelta) {
                        aiMessage.content += event.textDelta;
                        this.shouldScrollToBottom = true;
                    }
                    // 工具调用开始 - 显示提示
                    else if (event.type === 'tool_use_start') {
                        const toolName = event.toolCall?.name ? ` (${event.toolCall.name})` : '';
                        aiMessage.content += `\n\n🔧 ${this.t.chatInterface.executingTool}${toolName}...`;

                        // 记录待执行的工具
                        if (event.toolCall?.id) {
                            pendingToolCalls.set(event.toolCall.id, {
                                name: event.toolCall.name || 'unknown',
                                startTime: Date.now()
                            });
                        }
                        this.shouldScrollToBottom = true;
                    }
                    // 工具调用完成 - 更新状态
                    else if (event.type === 'tool_use_end') {
                        if (event.toolCall) {
                            const toolInfo = pendingToolCalls.get(event.toolCall.id);
                            const duration = toolInfo ? Date.now() - toolInfo.startTime : 0;
                            const toolName = toolInfo?.name || event.toolCall.name || 'unknown';

                            // 替换等待提示为完成状态
                            aiMessage.content = aiMessage.content.replace(
                                /🔧 .*?\.{3}/g,
                                `✅ ${toolName} completed`
                            );

                            pendingToolCalls.delete(event.toolCall.id);
                        }
                        this.shouldScrollToBottom = true;
                    }
                    // 工具结果 - 追加到消息
                    else if (event.type === 'tool_result' && event.result) {
                        const isError = event.result.is_error;
                        const icon = isError ? '❌' : '📋';
                        const header = isError ? '**Tool execution failed**' : '**Tool output**';

                        // 截断过长的结果
                        const maxPreviewLength = 800;
                        let resultPreview = event.result.content;
                        const isTruncated = resultPreview.length > maxPreviewLength;
                        if (isTruncated) {
                            resultPreview = resultPreview.substring(0, maxPreviewLength) + '\n...(truncated)';
                        }

                        // 格式化工具结果
                        const formattedResult = `\n\n${icon} ${header}:\n\`\`\`\n${resultPreview}\n\`\`\``;
                        aiMessage.content += formattedResult;
                        this.shouldScrollToBottom = true;
                    }
                    // 工具错误
                    else if (event.type === 'tool_error' && event.error) {
                        aiMessage.content = aiMessage.content.replace(
                            /🔧 .*?\.{3}/g,
                            `❌ Tool execution failed: ${event.error}`
                        );
                        this.shouldScrollToBottom = true;
                    }
                    // 消息结束
                    else if (event.type === 'message_end') {
                        // Capture usage stats if the provider supplied them
                        // (OpenAI/Groq with stream_options.include_usage,
                        // Anthropic via message_delta.usage, etc.). Stored
                        // on metadata so chat-message.component can render
                        // a small "237 tokens" footer on the bubble.
                        if ((event as any).usage) {
                            aiMessage.metadata = {
                                ...aiMessage.metadata,
                                usage: (event as any).usage,
                            };
                            this.stampProviderContext(aiMessage);
                        }
                        this.logger.info('Stream completed', { usage: (event as any).usage });
                        this.playNotificationSound();
                        this.shouldScrollToBottom = true;
                    }
                },
                error: (error) => {
                    this.logger.error('Stream error', error);
                    aiMessage.content += `\n\n${this.t.chatInterface.errorPrefix}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    // Mark errored so the bubble template can render
                    // a Retry button — same pattern as the agent
                    // loop's handleStreamError.
                    aiMessage.metadata = {
                        ...aiMessage.metadata,
                        streamError: error instanceof Error ? error.message : String(error),
                    };
                    this.isLoading = false;
                    this.shouldScrollToBottom = true;
                    this.saveChatHistory();
                },
                complete: () => {
                    this.isLoading = false;
                    this.saveChatHistory();
                    this.shouldScrollToBottom = true;
                }
            });

        } catch (error) {
            this.logger.error('Failed to send message', error);

            // 添加错误消息
            const errorMessage: ChatMessage = {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: `${this.t.chatInterface.errorPrefix}: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${this.t.chatInterface.tipShortcut}`,
                timestamp: new Date()
            };
            this.messages.push(errorMessage);
            this.isLoading = false;
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    /**
     * 清空聊天记录
     */
    clearChat(): void {
        if (confirm(this.t.chatInterface.clearChatConfirm)) {
            // 删除当前会话
            if (this.currentSessionId) {
                this.chatHistory.deleteSession(this.currentSessionId);
            }
            // 创建新会话
            this.currentSessionId = this.generateSessionId();
            this.messages = [];
            this.sendWelcomeMessage();

            // 确保重置加载状态
            this.isLoading = false;

            // 延迟滚动和恢复焦点，确保DOM已更新
            setTimeout(() => {
                this.scrollToBottom();
                // 尝试恢复输入框焦点
                const inputElement = document.querySelector('.chat-textarea') as HTMLTextAreaElement;
                if (inputElement) {
                    inputElement.focus();
                }
            }, 100);

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
            alert(this.t.providers.testError);
            return;
        }

        // 构建提供商列表
        const providerList = configuredProviders.map((p, i) =>
            `${i + 1}. ${p.displayName}`
        ).join('\n');

        const choice = prompt(
            `${this.t.chatInterface.providerBadge}: ${this.currentProvider}\n\n${this.t.chatInterface.switchProvider}:\n${providerList}\n\n${this.t.chatInterface.inputPlaceholder}`,
            '1'
        );

        if (choice) {
            const index = parseInt(choice, 10) - 1;
            if (index >= 0 && index < configuredProviders.length) {
                const selectedProvider = configuredProviders[index];
                this.config.setDefaultProvider(selectedProvider.name);
                this.currentProvider = selectedProvider.displayName;
                this.logger.info('Provider switched', { provider: selectedProvider.name });

                // 添加系统消息
                const systemMessage: ChatMessage = {
                    id: this.generateId(),
                    role: MessageRole.SYSTEM,
                    content: `${this.t.chatInterface.providerBadge}: ${this.currentProvider}`,
                    timestamp: new Date()
                };
                this.messages.push(systemMessage);
            } else {
                alert(this.t.chatInterface.errorPrefix);
            }
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
        const chatContainer = this.chatContainerRef?.nativeElement || document.querySelector('.ai-chat-container');
        if (chatContainer) {
            chatContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * 实际执行滚动到底部
     */
    private performScrollToBottom(): void {
        const chatContainer = this.chatContainerRef?.nativeElement || document.querySelector('.ai-chat-container');
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
        const chatContainer = this.chatContainerRef?.nativeElement || document.querySelector('.ai-chat-container');
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
     * 播放提示音
     */
    private playNotificationSound(): void {
        if (!this.soundEnabled) return;

        try {
            // 使用系统提示音
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            // 忽略音频播放错误
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
}
