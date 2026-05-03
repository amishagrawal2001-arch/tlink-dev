import { Component, Output, EventEmitter, Input, ViewChild, ElementRef, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { AiAssistantService } from '../../services/core/ai-assistant.service';

@Component({
    selector: 'app-chat-input',
    templateUrl: './chat-input.component.html',
    styleUrls: ['./chat-input.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatInputComponent implements OnInit, OnDestroy {
    @Input() disabled = false;
    @Input() placeholder = 'Enter your question or describe the command to run...';
    /**
     * Set true while a chat stream is in flight. Swaps the Send button
     * for a "Stop" button that emits `stop`. Wired by chat-interface
     * which holds the AbortController.
     */
    @Input() streaming = false;
    @Output() send = new EventEmitter<string>();
    @Output() stop = new EventEmitter<void>();

    @ViewChild('textInput', { static: false }) textInput!: ElementRef<HTMLTextAreaElement>;

    /** localStorage key for the input draft. Restored on init, cleared
     *  on send. Survives accidental tab close / app crash. */
    private static readonly DRAFT_STORAGE_KEY = 'tlink-ai-chat-draft';

    inputValue = '';
    private inputSubject = new Subject<string>();
    private draftSubject = new Subject<string>();
    private destroy$ = new Subject<void>();
    isComposing = false; // 用于处理中文输入法
    enterToSend: boolean = true; // Enter键发送

    // 智能建议相关
    suggestions: string[] = [];
    showSuggestions = false;

    constructor(
        private config: ConfigProviderService,
        private aiService: AiAssistantService
    ) {}

    ngOnInit(): void {
        // 读取 Enter 发送设置
        this.enterToSend = this.config.get<boolean>('ui.enterToSend', true) ?? true;

        // Restore the draft from a prior session — accidental tab
        // close / app crash shouldn't lose what the user was typing.
        try {
            const draft = localStorage.getItem(ChatInputComponent.DRAFT_STORAGE_KEY);
            if (draft) {
                this.inputValue = draft;
                // Defer autoResize until the textarea is in the DOM.
                setTimeout(() => this.autoResize(), 0);
            }
        } catch {
            // localStorage unavailable — non-fatal, drafts just won't persist.
        }

        // Suggestion pipeline (debounced).
        this.inputSubject.pipe(
            debounceTime(300),
            takeUntil(this.destroy$)
        ).subscribe(value => {
            this.onInputChange(value);
        });

        // Draft persistence pipeline — separate debounce so we save
        // more often than we suggest. 500ms is fast enough that
        // most accidental closes preserve work.
        this.draftSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(value => {
            try {
                if (value) {
                    localStorage.setItem(ChatInputComponent.DRAFT_STORAGE_KEY, value);
                } else {
                    localStorage.removeItem(ChatInputComponent.DRAFT_STORAGE_KEY);
                }
            } catch {
                // ignore quota / private mode failures
            }
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 处理输入变化
     * 实现智能建议功能
     */
    async onInputChange(value: string): Promise<void> {
        if (value.length < 2) {
            this.suggestions = [];
            this.showSuggestions = false;
            return;
        }

        // 调用已实现的智能建议服务
        this.suggestions = await this.aiService.getSuggestedCommands(value);
        this.showSuggestions = this.suggestions.length > 0;
    }

    /**
     * 选择建议
     */
    selectSuggestion(suggestion: string): void {
        this.inputValue = suggestion;
        this.showSuggestions = false;
        this.focus();
    }

    /**
     * 关闭建议
     */
    dismissSuggestions(): void {
        this.showSuggestions = false;
    }

    /**
     * 处理键盘事件
     */
    onKeydown(event: KeyboardEvent): void {
        // Enter 发送（根据配置决定）
        if (event.key === 'Enter' && !event.shiftKey && !this.isComposing) {
            if (this.enterToSend) {
                event.preventDefault();
                this.submit();
            }
            // 如果 enterToSend 为 false，Enter 会插入换行符
        }
    }

    /**
     * 处理输入事件
     */
    onInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        this.inputValue = target.value;
        this.inputSubject.next(this.inputValue);
        this.draftSubject.next(this.inputValue);
        this.autoResize();
    }

    /**
     * 处理composition开始（输入法）
     */
    onCompositionStart(): void {
        this.isComposing = true;
    }

    /**
     * 处理composition结束（输入法）
     */
    onCompositionEnd(): void {
        this.isComposing = false;
        this.autoResize();
    }

    /**
     * 提交消息
     */
    submit(): void {
        const message = this.inputValue.trim();
        if (message && !this.disabled) {
            this.send.emit(message);
            this.inputValue = '';
            // Successful send clears the persisted draft.
            try { localStorage.removeItem(ChatInputComponent.DRAFT_STORAGE_KEY); } catch { /* ignore */ }
            setTimeout(() => this.autoResize(), 0);
            this.textInput?.nativeElement.focus();
        }
    }

    /**
     * Cancel the in-flight stream. Wired to the Stop button that
     * replaces Send while `streaming === true`. The chat-interface
     * (parent) holds the AbortController and propagates the abort
     * down through ChatRequest.signal.
     */
    onStop(): void {
        this.stop.emit();
    }

    /**
     * 清空输入
     */
    clear(): void {
        this.inputValue = '';
        this.autoResize();
        this.textInput?.nativeElement.focus();
    }

    /**
     * 自动调整高度
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
     * 获取字符限制
     */
    getCharLimit(): number {
        return 4000; // 4K字符限制
    }

    /**
     * 检查是否接近限制
     */
    isNearLimit(): boolean {
        return this.getCharCount() > this.getCharLimit() * 0.8;
    }

    /**
     * 检查是否超过限制
     */
    isOverLimit(): boolean {
        return this.getCharCount() > this.getCharLimit();
    }

    /**
     * 聚焦输入框
     */
    focus(): void {
        this.textInput?.nativeElement.focus();
    }
}
