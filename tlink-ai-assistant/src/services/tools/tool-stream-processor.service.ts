import { Injectable } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { 
    AnyUIStreamEvent, 
    UITextEvent, 
    UIToolStartEvent, 
    UIToolCompleteEvent,
    UIToolErrorEvent,
    UIRoundDividerEvent,
    UIAgentDoneEvent,
    AgentDoneReason
} from './types/ui-stream-event.types';
import { AgentStreamEvent, ChatRequest, AgentLoopConfig } from '../../types/ai.types';
import { AiAssistantService } from '../core/ai-assistant.service';
import { ToolOutputFormatterService } from './tool-output-formatter.service';
import { LoggerService } from '../core/logger.service';

/**
 * Tool call state
 */
interface ToolCallState {
    id: string;
    name: string;
    displayName: string;
    startTime: number;
    category: string;
}

/**
 * Tool stream processor service
 * 
 * Responsibilities:
 * 1. Subscribe to AiAssistantService's AgentStreamEvent
 * 2. Convert to UI-friendly UIStreamEvent
 * 3. Handle tool output formatting and filtering
 * 4. Manage tool call state
 * 
 * Usage:
 * ```typescript
 * // Frontend components only need to use it like this
 * this.toolStreamProcessor.startAgentStream(request, config)
 *     .subscribe(event => this.renderUIEvent(event, aiMessage));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ToolStreamProcessorService {

    // ========================================================================
    // State management
    // ========================================================================

    /** Currently active tool calls */
    private activeToolCalls = new Map<string, ToolCallState>();

    /** Current subscription */
    private currentSubscription: Subscription | null = null;

    /** UI event stream */
    private uiEventSubject: Subject<AnyUIStreamEvent> | null = null;

    /** Whether completed */
    private isComplete = false;

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor(
        private aiService: AiAssistantService,
        private formatter: ToolOutputFormatterService,
        private logger: LoggerService
    ) {}

    // ========================================================================
    // Public methods
    // ========================================================================

    /**
     * Start Agent conversation stream
     * Returns formatted UI event stream that frontend can directly consume
     * 
     * @param request Chat request
     * @param config Agent loop configuration
     * @returns UI event stream Observable
     */
    startAgentStream(
        request: ChatRequest,
        config: AgentLoopConfig = {}
    ): Observable<AnyUIStreamEvent> {
        // Reset state
        this.reset();

        // Create new Subject
        this.uiEventSubject = new Subject<AnyUIStreamEvent>();

        // Subscribe to AI service's raw stream
        this.currentSubscription = this.aiService.chatStreamWithAgentLoop(request, config)
            .subscribe({
                next: (event: AgentStreamEvent) => this.processAgentEvent(event),
                error: (error) => this.handleError(error),
                complete: () => this.handleComplete()
            });

        return this.uiEventSubject.asObservable();
    }

    /**
     * 取消当前流
     */
    cancel(): void {
        if (this.currentSubscription) {
            this.currentSubscription.unsubscribe();
            this.currentSubscription = null;
        }

        // 发送取消事件
        this.emitAgentDone('user_cancel', 0);
        
        if (this.uiEventSubject) {
            this.uiEventSubject.complete();
            this.uiEventSubject = null;
        }
    }

    /**
     * 获取当前活跃的工具调用数量
     */
    getActiveToolCount(): number {
        return this.activeToolCalls.size;
    }

    /**
     * 检查是否正在处理中
     */
    isActive(): boolean {
        return this.uiEventSubject !== null && !this.isComplete;
    }

    // ========================================================================
    // 私有方法
    // ========================================================================

    /**
     * 重置状态
     */
    private reset(): void {
        this.activeToolCalls.clear();
        this.isComplete = false;

        if (this.currentSubscription) {
            this.currentSubscription.unsubscribe();
            this.currentSubscription = null;
        }

        if (this.uiEventSubject) {
            this.uiEventSubject.complete();
        }
        this.uiEventSubject = null;
    }

    /**
     * 处理 Agent 原始事件 -> 转换为 UI 事件
     */
    private processAgentEvent(event: AgentStreamEvent): void {
        if (!this.uiEventSubject) return;

        const timestamp = Date.now();

        try {
            switch (event.type) {
                case 'text_delta':
                    this.processTextDelta(event, timestamp);
                    break;
                    
                case 'tool_use_start':
                    this.processToolStart(event, timestamp);
                    break;
                    
                case 'tool_executing':
                    // 可选：发送工具执行中状态更新
                    break;
                    
                case 'tool_executed':
                    this.processToolComplete(event, timestamp);
                    break;
                    
                case 'tool_error':
                    this.processToolError(event, timestamp);
                    break;
                    
                case 'round_start':
                    this.processRoundStart(event, timestamp);
                    break;
                    
                case 'round_end':
                    // 轮次结束，可选处理
                    break;
                    
                case 'agent_complete':
                    this.processAgentComplete(event, timestamp);
                    break;
                    
                case 'error':
                    this.emitError(event.error || 'Unknown error');
                    break;
            }
        } catch (error) {
            this.logger.error('Error processing agent event', error);
            this.emitError(`处理事件时出错: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 处理文本增量
     */
    private processTextDelta(event: AgentStreamEvent, timestamp: number): void {
        if (!event.textDelta || !this.uiEventSubject) return;

        // 过滤掉可能的 XML 工具调用文本
        let text = event.textDelta;
        if (this.containsToolCallXml(text)) {
            this.logger.warn('Filtered XML tool call from text delta');
            return;
        }
        // 过滤掉伪工具命令（模型输出的 shell 风格工具指令）
        const normalized = text.trim().toLowerCase();
        if (
            normalized.startsWith('apply_patch') ||
            normalized.startsWith('command: apply_patch') ||
            normalized.startsWith('tool: apply_patch') ||
            normalized.startsWith('read_file') ||
            normalized.startsWith('list_files')
        ) {
            this.logger.warn('Filtered pseudo tool command from text delta');
            return;
        }

        const uiEvent: UITextEvent = {
            type: 'text',
            timestamp,
            content: text,
            isComplete: false
        };

        this.uiEventSubject.next(uiEvent);
    }

    /**
     * 检测是否包含 XML 格式的工具调用
     */
    private containsToolCallXml(text: string): boolean {
        const xmlPatterns = [
            /<invoke\s/i,
            /<\/invoke>/i,
            /<function_calls>/i,
            /<\/function_calls>/i,
            /<tool_use>/i,
            /<\/tool_use>/i,
            /<parameter\s/i,
        ];

        return xmlPatterns.some(pattern => pattern.test(text));
    }

    /**
     * 处理工具开始
     */
    private processToolStart(event: AgentStreamEvent, timestamp: number): void {
        if (!event.toolCall || !this.uiEventSubject) return;

        const { id, name } = event.toolCall;
        const displayName = this.formatter.getToolDisplayName(name);
        const category = this.formatter.getToolCategory(name);
        const icon = this.formatter.getToolIcon(name);

        // 记录工具状态
        this.activeToolCalls.set(id, {
            id,
            name,
            displayName,
            startTime: timestamp,
            category
        });

        const uiEvent: UIToolStartEvent = {
            type: 'tool_start',
            timestamp,
            toolId: id,
            toolName: name,
            toolDisplayName: displayName,
            toolIcon: icon,
            toolCategory: category
        };

        this.uiEventSubject.next(uiEvent);
    }

    /**
     * 处理工具完成
     */
    private processToolComplete(event: AgentStreamEvent, timestamp: number): void {
        if (!event.toolCall || !event.toolResult || !this.uiEventSubject) return;

        const { id, name } = event.toolCall;
        const { content, is_error, duration } = event.toolResult;

        // 获取工具状态
        const toolState = this.activeToolCalls.get(id);
        const actualDuration = duration || (toolState ? timestamp - toolState.startTime : 0);

        // 格式化输出（核心：过滤危险内容）
        const formattedOutput = this.formatter.formatOutput(name, content || '', !!is_error);

        const uiEvent: UIToolCompleteEvent = {
            type: 'tool_complete',
            timestamp,
            toolId: id,
            toolName: name,
            duration: actualDuration,
            success: !is_error,
            output: formattedOutput
        };

        this.uiEventSubject.next(uiEvent);

        // 清理状态
        this.activeToolCalls.delete(id);
    }

    /**
     * 处理工具错误
     */
    private processToolError(event: AgentStreamEvent, timestamp: number): void {
        if (!event.toolCall || !this.uiEventSubject) return;

        const { id, name } = event.toolCall;
        const errorMessage = event.toolResult?.content || event.error || 'Unknown error';

        const uiEvent: UIToolErrorEvent = {
            type: 'tool_error',
            timestamp,
            toolId: id,
            toolName: name,
            errorMessage: this.sanitizeErrorMessage(errorMessage),
            errorType: this.classifyError(errorMessage)
        };

        this.uiEventSubject.next(uiEvent);

        // 清理状态
        this.activeToolCalls.delete(id);
    }

    /**
     * 处理轮次开始
     */
    private processRoundStart(event: AgentStreamEvent, timestamp: number): void {
        if (!this.uiEventSubject) return;

        // 只在第 2 轮及以后显示分隔线
        if (event.round && event.round > 1) {
            const uiEvent: UIRoundDividerEvent = {
                type: 'round_divider',
                timestamp,
                roundNumber: event.round
            };

            this.uiEventSubject.next(uiEvent);
        }
    }

    /**
     * 处理 Agent 完成
     */
    private processAgentComplete(event: AgentStreamEvent, timestamp: number): void {
        this.emitAgentDone(
            event.reason as AgentDoneReason || 'no_tools',
            event.totalRounds || 0,
            event.terminationMessage
        );
    }

    /**
     * 发送 Agent 完成事件
     */
    private emitAgentDone(reason: AgentDoneReason, totalRounds: number, summary?: string): void {
        if (!this.uiEventSubject) return;

        const reasonInfo = this.getReasonInfo(reason);
        
        const uiEvent: UIAgentDoneEvent = {
            type: 'agent_done',
            timestamp: Date.now(),
            reason,
            reasonText: reasonInfo.text,
            reasonIcon: reasonInfo.icon,
            totalRounds,
            summary
        };

        this.uiEventSubject.next(uiEvent);
    }

    /**
     * 获取完成原因信息
     */
    private getReasonInfo(reason: AgentDoneReason): { text: string; icon: string } {
        const reasonMap: Record<AgentDoneReason, { text: string; icon: string }> = {
            'task_complete': { text: 'Task completed', icon: '✅' },
            'no_tools': { text: 'Execution completed', icon: '✅' },
            'summarizing': { text: 'Summary completed', icon: '✅' },
            'repeated_tool': { text: 'Repeated operation detected', icon: '⚠️' },
            'high_failure_rate': { text: 'Multiple failures', icon: '⚠️' },
            'timeout': { text: 'Execution timeout', icon: '⏱️' },
            'max_rounds': { text: 'Maximum rounds reached', icon: '⚠️' },
            'user_cancel': { text: 'User cancelled', icon: '🛑' },
            'no_progress': { text: 'No progress made', icon: '⚠️' },
        };

        return reasonMap[reason] || { text: 'Completed', icon: '📌' };
    }

    /**
     * 发送错误事件
     */
    private emitError(error: string): void {
        if (!this.uiEventSubject) return;

        this.uiEventSubject.next({
            type: 'error',
            timestamp: Date.now(),
            error: this.sanitizeErrorMessage(error)
        });
    }

    /**
     * 处理流错误
     */
    private handleError(error: any): void {
        this.logger.error('ToolStreamProcessor error', error);
        
        const message = error instanceof Error ? error.message : String(error);
        this.emitError(message);
        
        if (this.uiEventSubject) {
            this.uiEventSubject.error(error);
            this.uiEventSubject = null;
        }
    }

    /**
     * 处理流完成
     */
    private handleComplete(): void {
        this.isComplete = true;
        
        if (this.uiEventSubject) {
            this.uiEventSubject.complete();
            this.uiEventSubject = null;
        }
    }

    /**
     * 清理错误消息（移除敏感信息）
     */
    private sanitizeErrorMessage(message: string): string {
        if (!message) return 'Unknown error';

        return message
            // 移除 API key
            .replace(/sk-[a-zA-Z0-9]+/g, 'sk-***')
            .replace(/api[_-]?key[=:]\s*["']?[a-zA-Z0-9]+["']?/gi, 'api_key=***')
            // 移除密码
            .replace(/password[=:]\s*["']?[^"'\s]+["']?/gi, 'password=***')
            // 移除 Token
            .replace(/token[=:]\s*["']?[a-zA-Z0-9_.-]+["']?/gi, 'token=***')
            .trim();
    }

    /**
     * 分类错误类型
     */
    private classifyError(message: string): UIToolErrorEvent['errorType'] {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('timeout') || lowerMessage.includes('超时')) {
            return 'timeout';
        }
        if (lowerMessage.includes('rejected') || lowerMessage.includes('拒绝') || 
            lowerMessage.includes('cancel') || lowerMessage.includes('取消')) {
            return 'rejected';
        }
        if (lowerMessage.includes('failed') || lowerMessage.includes('失败') || 
            lowerMessage.includes('error') || lowerMessage.includes('错误')) {
            return 'execution';
        }
        
        return 'unknown';
    }
}
