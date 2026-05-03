import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult, HealthStatus } from '../../types/provider.types';
import { ChatRequest, ChatResponse, StreamEvent, MessageRole, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { parseSseStream, OpenAiToolCallAccumulator } from './streaming';

/**
 * vLLM 本地 AI 提供商
 * 兼容 OpenAI API 格式，默认端口 8000
 */
@Injectable()
export class VllmProviderService extends BaseAiProvider {
    readonly name = 'vllm';
    readonly displayName = 'vLLM (Local)';
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
    /**
     * Lazily-built axios instance. Re-created when `config` changes
     * (apiKey, baseURL, timeout). The shared transport keeps vLLM
     * consistent with the other OpenAI-shape providers — same retry
     * surface, same circuit breaker, same logging hooks.
     */
    private client: AxiosInstance | null = null;

    constructor(logger: LoggerService) {
        super(logger);
    }

    configure(config: any): void {
        super.configure(config);
        // Force client rebuild on next request — config may have new
        // baseURL/apiKey/timeout.
        this.client = null;
    }

    private getClient(): AxiosInstance {
        if (this.client) return this.client;
        this.client = axios.create({
            baseURL: this.getApiBaseURL(),
            timeout: this.getTimeout(),
            headers: this.getAuthHeaders(),
        });
        return this.client;
    }

    /**
     * Extract a provider-side error message out of an axios error so
     * the existing tool-fallback heuristic (`isToolUnsupportedError`)
     * has the same string shape it had under raw fetch.
     */
    private extractAxiosErrorText(error: any): { status: number | undefined; text: string } {
        const status = error?.response?.status as number | undefined;
        const data = error?.response?.data;
        if (typeof data === 'string') return { status, text: data };
        if (data && typeof data === 'object') {
            return { status, text: data?.error?.message || data?.message || JSON.stringify(data) };
        }
        return { status, text: error?.message || String(error) };
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
            const result = await this.withRetry(() =>
                this.getClient().post('/chat/completions', this.buildChatPayload(request, false))
            );
            this.logResponse(result.data);
            return this.transformChatResponse(result.data);
        } catch (error: any) {
            // Tool-fallback heuristic: some vLLM-served models 400 when
            // they're sent a `tools` field they don't understand. Detect
            // that specific error string and retry once without tools so
            // the user gets a successful response instead of a hard fail.
            const { status, text } = this.extractAxiosErrorText(error);
            if (status === 400 && request.tools?.length && this.isToolUnsupportedError(text)) {
                const modelName = this.getModelName(request);
                this.modelsWithoutToolSupport.add(modelName);
                this.logger.warn('vLLM model does not support tools, retrying without tools', {
                    model: modelName,
                    errorText: text.substring(0, 200)
                });
                return this.chat({ ...request, tools: undefined });
            }
            this.logError(error, { request });
            throw new Error(`vLLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Shared OpenAI-shape response → ChatResponse mapping. Used by chat()
     * and sendTestRequest().
     */
    private transformChatResponse(data: any): ChatResponse {
        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: data.choices?.[0]?.message?.content || '',
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
     * 流式聊天功能 - 支持工具调用事件
     *
     * Now talks to vLLM via the shared axios + parseSseStream +
     * OpenAiToolCallAccumulator stack — same transport / SSE handling
     * / tool-call state machine as the other OpenAI-shape providers
     * (OpenAI, Groq, OpenAI-compatible). Preserves the
     * "model-doesn't-support-tools → retry without tools" fallback
     * specific to vLLM.
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            const abortController = this.createLinkedAbortController(request.signal);
            let retriedWithoutTools = false;

            this.logRequest(request);

            const runStream = async (streamRequest: ChatRequest) => {
                try {
                    const response = await this.getClient().post(
                        '/chat/completions',
                        this.buildChatPayload(streamRequest, true),
                        { signal: abortController.signal as any, responseType: 'stream' as any }
                    );

                    const stream = response.data;
                    const accumulator = new OpenAiToolCallAccumulator();
                    let fullContent = '';
                    // vLLM follows the OpenAI shape — usage in the
                    // final chunk when stream_options.include_usage is on.
                    let lastUsage: StreamEvent['usage'] | undefined;

                    // axios-in-browser delivers a buffered string; axios-in-Node
                    // delivers an async-iterable. parseSseStream takes either.
                    const sseSource: AsyncIterable<unknown> | string =
                        typeof stream === 'string'
                            ? stream
                            : (stream && typeof (stream as any)[Symbol.asyncIterator] === 'function')
                                ? stream
                                : '';

                    for await (const { data } of parseSseStream(sseSource, { signal: abortController.signal })) {
                        try {
                            const parsed = JSON.parse(data);
                            const choice = parsed.choices?.[0];

                            this.logger.debug('Stream event', { type: 'delta', hasToolCalls: !!choice?.delta?.tool_calls });

                            if (parsed.usage) {
                                lastUsage = {
                                    promptTokens: parsed.usage.prompt_tokens ?? 0,
                                    completionTokens: parsed.usage.completion_tokens ?? 0,
                                    totalTokens: parsed.usage.total_tokens ?? 0,
                                };
                            }

                            if (choice?.delta?.tool_calls?.length > 0) {
                                for (const ev of accumulator.feed(choice.delta.tool_calls)) {
                                    subscriber.next(ev);
                                    this.logger.debug('Stream event', { type: ev.type, name: ev.toolCall?.name });
                                }
                            } else if (choice?.delta?.content) {
                                const delta = choice.delta.content;
                                fullContent += delta;
                                subscriber.next({ type: 'text_delta', textDelta: delta });
                            }
                        } catch {
                            // Keep-alive frame or unparseable line — skip.
                        }
                    }

                    for (const ev of accumulator.flush()) {
                        subscriber.next(ev);
                        this.logger.debug('Stream event', { type: ev.type, name: ev.toolCall?.name });
                    }

                    subscriber.next({
                        type: 'message_end',
                        message: {
                            id: this.generateId(),
                            role: MessageRole.ASSISTANT,
                            content: fullContent,
                            timestamp: new Date()
                        },
                        ...(lastUsage ? { usage: lastUsage } : {})
                    });
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();
                } catch (error: any) {
                    if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
                        return; // user-initiated cancel, no error event
                    }
                    const { status, text } = this.extractAxiosErrorText(error);
                    if (!retriedWithoutTools && status === 400 && streamRequest.tools?.length && this.isToolUnsupportedError(text)) {
                        retriedWithoutTools = true;
                        const modelName = this.getModelName(streamRequest);
                        this.modelsWithoutToolSupport.add(modelName);
                        this.logger.warn('vLLM model does not support tools, retrying stream without tools', {
                            model: modelName,
                            errorText: text.substring(0, 200)
                        });
                        await runStream({ ...streamRequest, tools: undefined });
                        return;
                    }
                    const errorMessage = `vLLM stream failed: ${error instanceof Error ? error.message : String(error)}`;
                    this.logError(error, { request });
                    subscriber.next({ type: 'error', error: errorMessage });
                    subscriber.error(new Error(errorMessage));
                }
            };

            runStream(request);

            // 返回取消函数
            return () => abortController.abort();
        });
    }

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        const result = await this.getClient().post('/chat/completions', this.buildChatPayload({
            ...request,
            maxTokens: request.maxTokens ?? 1,
            temperature: request.temperature ?? 0
        }, false));
        return this.transformChatResponse(result.data);
    }

    /** See BaseAiProvider.probeUpstream — vLLM mirrors the OpenAI
     *  `GET /v1/models` shape on its OpenAI-compatible bridge. */
    protected async probeUpstream(): Promise<HealthStatus | null> {
        try {
            const res = await this.getClient().get('/models', { timeout: 5000 });
            return res.status >= 200 && res.status < 300
                ? HealthStatus.HEALTHY
                : HealthStatus.DEGRADED;
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401 || status === 403) return HealthStatus.UNHEALTHY;
            if (status === 429) return HealthStatus.DEGRADED;
            return null;
        }
    }

    /**
     * 验证配置
     */
    validateConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.config?.model) {
            warnings.push('No model specified; using default model meta-llama/Llama-3.1-8B.');
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
