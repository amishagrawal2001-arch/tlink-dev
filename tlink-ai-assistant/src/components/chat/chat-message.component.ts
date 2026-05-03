import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { ChatMessage } from '../../types/ai.types';
import { ToastService } from '../../services/core/toast.service';
import { calculateCost, formatCost, AIProvider } from '../../utils/cost.utils';

@Component({
    selector: 'app-chat-message',
    templateUrl: './chat-message.component.html',
    styleUrls: ['./chat-message.component.scss'],
    encapsulation: ViewEncapsulation.None
})
export class ChatMessageComponent {
    @Input() message!: ChatMessage;
    @Input() showAvatar = true;
    @Input() showTimestamp = true;
    @Input() isGrouped = false; // 是否与上一条消息分组
    @Output() messageClick = new EventEmitter<ChatMessage>();
    @Output() messageAction = new EventEmitter<{ action: string; message: ChatMessage }>();

    constructor(private toastService: ToastService) {}

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
