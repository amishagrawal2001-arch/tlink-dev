import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, StreamEvent, MessageRole, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * vLLM 本地 AI 提供商
 * 兼容 OpenAI API 格式，默认端口 8000
 */
@Injectable()
export class VllmProviderService extends BaseAiProvider {
    readonly name = 'vllm';
    readonly displayName = 'vLLM (本地)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.STREAMING,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION
    ];
    readonly authConfig = {
        type: 'bearer' as const,
        credentials: { apiKey: '' }
    };
    private modelsWithoutToolSupport = new Set<string>();

    constructor(logger: LoggerService) {
        super(logger);
    }

    /**
     * Normalize base URL to ensure it targets /v1 exactly once.
     */
    private normalizeBaseURL(baseURL: string): string {
        if (!baseURL || !baseURL.trim()) {
            return '';
        }
        let normalized = baseURL.trim().replace(/\/+$/, '');
        normalized = normalized
            .replace(/\/v1\/chat\/completions.*$/i, '')
            .replace(/\/v1\/models.*$/i, '')
            .replace(/\/v1\/?$/i, '')
            .replace(/\/+$/, '');
        if (!normalized) {
            return '';
        }
        return `${normalized}/v1`;
    }

    private getApiBaseURL(): string {
        return this.normalizeBaseURL(this.getBaseURL());
    }

    private getModelName(request?: ChatRequest): string {
        return request?.model || this.config?.model || this.getDefaultModel();
    }

    private transformMessagesForRequest(request: ChatRequest): any[] {
        const messages = this.transformMessages(request.messages);
        const toolsEnabled = request.enableTools !== false && request.tools && request.tools.length > 0;
        if (toolsEnabled) {
            return messages;
        }

        const stripped = messages
            .filter(message => message.role !== 'tool')
            .map(message => {
                if (message.role !== 'assistant') {
                    return message;
                }
                if (!message.tool_calls) {
                    return message;
                }
                if (typeof message.content === 'string' && message.content.trim()) {
                    return { role: 'assistant', content: message.content };
                }
                return null;
            })
            .filter(Boolean);

        return stripped;
    }

    private buildChatPayload(request: ChatRequest, stream: boolean): any {
        const modelName = this.getModelName(request);
        const maxTokens = Number.isFinite(request.maxTokens) && (request.maxTokens as number) > 0
            ? (request.maxTokens as number)
            : 1000;
        const shouldIncludeTools = request.tools && request.tools.length > 0 && !this.modelsWithoutToolSupport.has(modelName);

        return {
            model: modelName,
            messages: this.transformMessagesForRequest(request),
            max_tokens: maxTokens,
            temperature: request.temperature ?? 0.7,
            stream,
            ...(shouldIncludeTools ? { tools: request.tools } : {})
        };
    }

    private async readErrorText(response: Response): Promise<string> {
        const raw = await response.text().catch(() => '');
        if (!raw) {
            return '';
        }
        try {
            const parsed = JSON.parse(raw);
            return parsed?.error?.message || parsed?.message || raw;
        } catch {
            return raw;
        }
    }

    private isToolUnsupportedError(message: string): boolean {
        const text = (message || '').toLowerCase();
        if (!text.includes('tool')) {
            return false;
        }
        return (
            text.includes('not support') ||
            text.includes('unsupported') ||
            text.includes('unknown field') ||
            text.includes('unrecognized')
        );
    }

    /**
     * 获取认证头
     */
    protected getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (this.config?.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        return headers;
    }

    /**
     * 非流式聊天
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        this.logRequest(request);

        try {
            const baseURL = this.getApiBaseURL();
            const response = await fetch(`${baseURL}/chat/completions`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(this.buildChatPayload(request, false))
            });

            if (!response.ok) {
                const errorText = await this.readErrorText(response);
                if (response.status === 400 && request.tools?.length && this.isToolUnsupportedError(errorText)) {
                    const modelName = this.getModelName(request);
                    this.modelsWithoutToolSupport.add(modelName);
                    this.logger.warn('vLLM model does not support tools, retrying without tools', {
                        model: modelName,
                        errorText: errorText.substring(0, 200)
                    });
                    return this.chat({ ...request, tools: undefined });
                }
                throw new Error(`vLLM API error: ${response.status}${errorText ? ` - ${errorText}` : ''}`);
            }

            const data = await response.json();
            this.logResponse(data);

            return {
                message: {
                    id: this.generateId(),
                    role: MessageRole.ASSISTANT,
                    content: data.choices[0]?.message?.content || '',
                    timestamp: new Date()
                },
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined
            };
        } catch (error) {
            this.logError(error, { request });
            throw new Error(`vLLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            const abortController = new AbortController();
            let retriedWithoutTools = false;

            this.logRequest(request);

            const runStream = async (streamRequest: ChatRequest) => {
                try {
                    const baseURL = this.getApiBaseURL();
                    const response = await fetch(`${baseURL}/chat/completions`, {
                        method: 'POST',
                        headers: this.getAuthHeaders(),
                        body: JSON.stringify(this.buildChatPayload(streamRequest, true)),
                        signal: abortController.signal
                    });

                    if (!response.ok) {
                        const errorText = await this.readErrorText(response);
                        if (!retriedWithoutTools && response.status === 400 && streamRequest.tools?.length && this.isToolUnsupportedError(errorText)) {
                            retriedWithoutTools = true;
                            const modelName = this.getModelName(streamRequest);
                            this.modelsWithoutToolSupport.add(modelName);
                            this.logger.warn('vLLM model does not support tools, retrying stream without tools', {
                                model: modelName,
                                errorText: errorText.substring(0, 200)
                            });
                            await runStream({ ...streamRequest, tools: undefined });
                            return;
                        }
                        throw new Error(`vLLM API error: ${response.status}${errorText ? ` - ${errorText}` : ''}`);
                    }

                    const reader = response.body?.getReader();
                    const decoder = new TextDecoder();

                    if (!reader) {
                        throw new Error('No response body');
                    }

                    // 工具调用状态跟踪
                    let currentToolCallId = '';
                    let currentToolCallName = '';
                    let currentToolInput = '';
                    let currentToolIndex = -1;
                    let fullContent = '';

                    while (true) {
                        if (abortController.signal.aborted) break;

                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

                        for (const line of lines) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const choice = parsed.choices?.[0];

                                this.logger.debug('Stream event', { type: 'delta', hasToolCalls: !!choice?.delta?.tool_calls });

                                // 处理工具调用块
                                if (choice?.delta?.tool_calls?.length > 0) {
                                    for (const toolCall of choice.delta.tool_calls) {
                                        const index = toolCall.index || 0;

                                        // 新工具调用开始
                                        if (currentToolIndex !== index) {
                                            if (currentToolIndex >= 0) {
                                                // 发送前一个工具调用的结束事件
                                                let parsedInput = {};
                                                try {
                                                    parsedInput = JSON.parse(currentToolInput || '{}');
                                                } catch (e) {
                                                    // 使用原始输入
                                                }
                                                subscriber.next({
                                                    type: 'tool_use_end',
                                                    toolCall: {
                                                        id: currentToolCallId,
                                                        name: currentToolCallName,
                                                        input: parsedInput
                                                    }
                                                });
                                                this.logger.debug('Stream event', { type: 'tool_use_end', name: currentToolCallName });
                                            }

                                            currentToolIndex = index;
                                            currentToolCallId = toolCall.id || `tool_${Date.now()}_${index}`;
                                            currentToolCallName = toolCall.function?.name || '';
                                            currentToolInput = toolCall.function?.arguments || '';

                                            // 发送工具调用开始事件
                                            subscriber.next({
                                                type: 'tool_use_start',
                                                toolCall: {
                                                    id: currentToolCallId,
                                                    name: currentToolCallName,
                                                    input: {}
                                                }
                                            });
                                            this.logger.debug('Stream event', { type: 'tool_use_start', name: currentToolCallName });
                                        } else {
                                            // 继续累积参数
                                            if (toolCall.function?.arguments) {
                                                currentToolInput += toolCall.function.arguments;
                                            }
                                        }
                                    }
                                }
                                // 处理文本增量
                                else if (choice?.delta?.content) {
                                    const delta = choice.delta.content;
                                    fullContent += delta;
                                    subscriber.next({
                                        type: 'text_delta',
                                        textDelta: delta
                                    });
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }

                    // 发送最后一个工具调用的结束事件
                    if (currentToolIndex >= 0) {
                        let parsedInput = {};
                        try {
                            parsedInput = JSON.parse(currentToolInput || '{}');
                        } catch (e) {
                            // 使用原始输入
                        }
                        subscriber.next({
                            type: 'tool_use_end',
                            toolCall: {
                                id: currentToolCallId,
                                name: currentToolCallName,
                                input: parsedInput
                            }
                        });
                        this.logger.debug('Stream event', { type: 'tool_use_end', name: currentToolCallName });
                    }

                    subscriber.next({
                        type: 'message_end',
                        message: {
                            id: this.generateId(),
                            role: MessageRole.ASSISTANT,
                            content: fullContent,
                            timestamp: new Date()
                        }
                    });
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();
                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `vLLM stream failed: ${error instanceof Error ? error.message : String(error)}`;
                        this.logError(error, { request });
                        subscriber.next({ type: 'error', error: errorMessage });
                        subscriber.error(new Error(errorMessage));
                    }
                }
            };

            runStream(request);

            // 返回取消函数
            return () => abortController.abort();
        });
    }

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        const baseURL = this.getApiBaseURL();
        const response = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(this.buildChatPayload({
                ...request,
                maxTokens: request.maxTokens ?? 1,
                temperature: request.temperature ?? 0
            }, false))
        });

        if (!response.ok) {
            const errorText = await this.readErrorText(response);
            throw new Error(`vLLM API error: ${response.status}${errorText ? ` - ${errorText}` : ''}`);
        }

        const data = await response.json();
        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: data.choices[0]?.message?.content || '',
                timestamp: new Date()
            },
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    }

    /**
     * 验证配置
     */
    validateConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.config?.model) {
            warnings.push('未指定模型，将使用默认模型 meta-llama/Llama-3.1-8B');
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * 生成命令
     */
    async generateCommand(request: CommandRequest): Promise<CommandResponse> {
        const prompt = this.buildCommandPrompt(request);

        const chatRequest: ChatRequest = {
            messages: [
                {
                    id: this.generateId(),
                    role: MessageRole.USER,
                    content: prompt,
                    timestamp: new Date()
                }
            ],
            maxTokens: 500,
            temperature: 0.3
        };

        const response = await this.chat(chatRequest);
        return this.parseCommandResponse(response.message.content);
    }

    /**
     * 解释命令
     */
    async explainCommand(request: ExplainRequest): Promise<ExplainResponse> {
        const prompt = this.buildExplainPrompt(request);

        const chatRequest: ChatRequest = {
            messages: [
                {
                    id: this.generateId(),
                    role: MessageRole.USER,
                    content: prompt,
                    timestamp: new Date()
                }
            ],
            maxTokens: 1000,
            temperature: 0.5
        };

        const response = await this.chat(chatRequest);
        return this.parseExplainResponse(response.message.content);
    }

    /**
     * 分析结果
     */
    async analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse> {
        const prompt = this.buildAnalysisPrompt(request);

        const chatRequest: ChatRequest = {
            messages: [
                {
                    id: this.generateId(),
                    role: MessageRole.USER,
                    content: prompt,
                    timestamp: new Date()
                }
            ],
            maxTokens: 1000,
            temperature: 0.7
        };

        const response = await this.chat(chatRequest);
        return this.parseAnalysisResponse(response.message.content);
    }

    /**
     * 转换消息格式 - OpenAI 兼容格式
     * 支持 tool 角色和 assistant 的 tool_calls
     */
    protected transformMessages(messages: any[]): any[] {
        const systemMessages: any[] = [];
        const result: any[] = [];
        const pushMessage = (message: any) => {
            if (message?.role === 'system') {
                systemMessages.push(message);
            } else {
                result.push(message);
            }
        };

        for (const msg of messages) {
            if (msg.role === 'system') {
                pushMessage({
                    role: 'system',
                    content: String(msg.content ?? '')
                });
                continue;
            }
            // 处理工具结果消息
            if (msg.role === 'tool' || msg.toolResults) {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    for (const tr of msg.toolResults) {
                        if (tr.tool_use_id) {
                            pushMessage({
                                role: 'tool',
                                tool_call_id: tr.tool_use_id,
                                content: String(tr.content || '')
                            });
                        }
                    }
                } else if (msg.tool_use_id) {
                    pushMessage({
                        role: 'tool',
                        tool_call_id: msg.tool_use_id,
                        content: String(msg.content || '')
                    });
                }
                continue;
            }

            // 处理 Assistant 消息
            if (msg.role === 'assistant') {
                const content = String(msg.content || '');
                const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

                if (hasToolCalls) {
                    const toolCalls = msg.toolCalls.map((tc: any) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.input || {})
                        }
                    }));
                    if (content.trim()) {
                        pushMessage({ role: 'assistant', content });
                    }
                    pushMessage({ role: 'assistant', tool_calls: toolCalls });
                } else {
                    pushMessage({ role: 'assistant', content });
                }
                continue;
            }

            // 用户消息
            pushMessage({
                role: msg.role,
                content: String(msg.content ?? '')
            });
        }

        return [...systemMessages, ...result];
    }
}
