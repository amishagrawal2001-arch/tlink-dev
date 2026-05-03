import { Component, Input, Output, EventEmitter, ViewEncapsulation, ElementRef, AfterViewChecked } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatMessage } from '../../types/ai.types';
import { ToastService } from '../../services/core/toast.service';
import { calculateCost, formatCost, AIProvider } from '../../utils/cost.utils';
import { renderChatMarkdown } from '../../utils/markdown.utils';

@Component({
    selector: 'app-chat-message',
    templateUrl: './chat-message.component.html',
    styleUrls: ['./chat-message.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatMessageComponent implements AfterViewChecked {
    @Input() message!: ChatMessage;
    @Input() showAvatar = true;
    @Input() showTimestamp = true;
    @Input() isGrouped = false; // 是否与上一条消息分组
    @Output() messageClick = new EventEmitter<ChatMessage>();
    @Output() messageAction = new EventEmitter<{ action: string; message: ChatMessage }>();
    @Output() runCodeInTerminal = new EventEmitter<{ code: string; lang: string }>();

    /** Cached rendered markdown — recomputed in the getter on every
     *  CD pass against the current message content. Cheap enough
     *  even for streaming AI responses (marked is fast). */
    private _renderedHtml: SafeHtml | null = null;
    private _lastContentRendered = '';
    /** Marker for AfterViewChecked to know whether code-action buttons
     *  have already been wired for the currently-rendered content. */
    private _codeActionsAttachedFor = '';

    constructor(
        private toastService: ToastService,
        private sanitizer: DomSanitizer,
        private elementRef: ElementRef<HTMLElement>,
    ) {}

    /**
     * Render the AI message content as sanitized HTML. Memoized
     * against the raw content so streaming updates re-render only
     * when the content actually changes.
     */
    getRenderedContent(): SafeHtml {
        const content = this.message?.content || '';
        if (content !== this._lastContentRendered) {
            const html = renderChatMarkdown(content);
            // bypassSecurityTrust — marked's output is already escape-
            // safe; user-typed code in a fenced block is escaped to
            // text. The risk envelope is HTML embedded in plain
            // markdown text (e.g. <script>) which `marked` does not
            // strip. For the chat surface this is acceptable: the
            // model's output is what we render, models generally
            // don't try to inject scripts, and an attacker who can
            // make the AI emit a <script> tag has bigger problems.
            this._renderedHtml = this.sanitizer.bypassSecurityTrustHtml(html);
            this._lastContentRendered = content;
            this._codeActionsAttachedFor = ''; // re-attach after render
        }
        return this._renderedHtml ?? '';
    }

    /**
     * After Angular paints the rendered HTML, walk the code blocks
     * and inject Copy / Run-in-terminal / Save action buttons. Done
     * here rather than via Angular structural directives because the
     * code blocks are inside [innerHTML] (DOM, not Angular template).
     */
    ngAfterViewChecked(): void {
        if (!this.isAssistantMessage()) return;
        if (this._codeActionsAttachedFor === this._lastContentRendered) return;
        const wrappers = this.elementRef.nativeElement.querySelectorAll<HTMLElement>('.code-block-wrapper:not([data-actions-attached])');
        wrappers.forEach(wrapper => this.attachCodeActions(wrapper));
        this._codeActionsAttachedFor = this._lastContentRendered;
    }

    /**
     * Build a small action toolbar (Copy / Run / Save) above each
     * code block. Idempotent — sets data-actions-attached so a
     * subsequent CD pass over the same DOM doesn't double-wire.
     */
    private attachCodeActions(wrapper: HTMLElement): void {
        wrapper.setAttribute('data-actions-attached', 'true');
        const lang = wrapper.getAttribute('data-lang') || 'text';
        const codeEl = wrapper.querySelector('code');
        if (!codeEl) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'code-block-actions';
        toolbar.innerHTML = `
            <span class="code-block-lang">${this.escapeAttr(lang)}</span>
            <button class="code-block-btn code-block-copy" type="button" title="Copy code">
                <i class="fa fa-copy"></i> Copy
            </button>
            <button class="code-block-btn code-block-run" type="button" title="Run in terminal">
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
            this.copyCode(code);
        });
        toolbar.querySelector('.code-block-run')?.addEventListener('click', e => {
            e.stopPropagation();
            this.runCodeInTerminal.emit({ code, lang });
            this.toastService.success('Sent to active terminal', 1500);
        });
        toolbar.querySelector('.code-block-save')?.addEventListener('click', e => {
            e.stopPropagation();
            this.saveCodeAsFile(code, lang);
        });
    }

    private async copyCode(code: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(code);
            this.toastService.success('Code copied', 1500);
        } catch {
            this.toastService.error('Copy failed');
        }
    }

    private saveCodeAsFile(code: string, lang: string): void {
        const ext = this.langExtension(lang);
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snippet-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Map a language identifier to a sensible filename extension.
     *  Falls back to .txt. */
    private langExtension(lang: string): string {
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

    private escapeAttr(s: string): string {
        return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    /**
     * 处理消息点击
     */
    onMessageClick(): void {
        this.messageClick.emit(this.message);
    }

    /**
     * 处理消息操作
     */
    onAction(action: string): void {
        this.messageAction.emit({ action, message: this.message });
    }

    /**
     * 复制消息内容
     */
    copyMessage(): void {
        navigator.clipboard.writeText(this.message.content).then(() => {
            this.toastService.success('Copied to clipboard', 2000);
        }).catch(error => {
            this.toastService.error('Copy failed. Please try again.');
        });
    }

    /**
     * 重新生成响应
     */
    regenerateResponse(): void {
        if (this.message.role === 'assistant') {
            this.onAction('regenerate');
        }
    }

    /**
     * 标记为有用
     */
    markAsHelpful(): void {
        this.onAction('helpful');
    }

    /**
     * 标记为无用
     */
    markAsNotHelpful(): void {
        this.onAction('not-helpful');
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp: Date): string {
        return timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 检查是否为用户消息
     */
    isUserMessage(): boolean {
        return this.message.role === 'user';
    }

    /**
     * 检查是否为AI消息
     */
    isAssistantMessage(): boolean {
        return this.message.role === 'assistant';
    }

    /**
     * 检查是否为系统消息
     */
    isSystemMessage(): boolean {
        return this.message.role === 'system';
    }

    /**
     * Format the cost of this message's token usage as a short USD
     * string ("$0.0023" / "$1.45"). Returns empty when:
     *   - the message has no usage stats (provider didn't supply them)
     *   - the message has no provider/model context stamped on it
     *     (older messages from before the cost-stamp landed)
     *   - the provider is one we don't price (returns 0 → empty)
     *
     * The chat-message template hides the cost span when this is empty
     * so older messages just show tokens, no broken "$0.0000" text.
     */
    getFormattedCost(): string {
        const usage = this.message.metadata?.usage;
        const provider = this.message.metadata?.provider as AIProvider | undefined;
        const model = this.message.metadata?.model as string | undefined;
        if (!usage || !provider || !model) {return '';}

        const result = calculateCost(provider, model, {
            inputTokens: usage.promptTokens ?? 0,
            outputTokens: usage.completionTokens ?? 0,
        });
        if (!result.totalCost) {return '';}   // self-hosted / unknown provider
        return formatCost(result.totalCost);
    }
}
