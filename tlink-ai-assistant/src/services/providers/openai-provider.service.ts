import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult, HealthStatus } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { parseSseStream, OpenAiToolCallAccumulator } from './streaming';

/**
 * OpenAI AI提供商
 * 基于OpenAI API格式
 */
@Injectable()
export class OpenAiProviderService extends BaseAiProvider {
    readonly name = 'openai';
    readonly displayName = 'OpenAI (GPT-4)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION,
        ProviderCapability.FUNCTION_CALL,
        ProviderCapability.STREAMING
    ];
    readonly authConfig = {
        type: 'bearer' as const,
        credentials: {
            apiKey: ''
        }
    };

    private client: AxiosInstance | null = null;

    constructor(logger: LoggerService) {
        super(logger);
    }

    /**
    * Some newer models expect `max_completion_tokens` instead of `max_tokens`.
    */
    private buildTokenParams(model: string | undefined, maxTokens?: number): Record<string, number> {
        if (!Number.isFinite(maxTokens) || (maxTokens as number) <= 0) {
            return {};
        }
        const tokens = maxTokens as number;
        const m = (model || '').toLowerCase();
        const useCompletionTokens = /^gpt-5/.test(m) || /^o[1-9]/.test(m);
        return useCompletionTokens ? { max_completion_tokens: tokens } : { max_tokens: tokens };
    }

    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('OpenAI API key not provided');
            return;
        }

        try {
            this.client = axios.create({
                baseURL: this.getBaseURL(),
                timeout: this.getTimeout(),
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            this.logger.info('OpenAI client initialized', {
                baseURL: this.getBaseURL(),
                model: this.config.model || 'gpt-4'
            });
        } catch (error) {
            this.logger.error('Failed to initialize OpenAI client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.client!.post('/chat/completions', {
                    model: this.config?.model || 'gpt-4',
                    messages: this.transformMessages(request.messages),
                    ...this.buildTokenParams(this.config?.model, request.maxTokens),
                    temperature: request.temperature || 0.7,
                    stream: request.stream || false,
                    ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
                });

                this.logResponse(result.data);
                return result.data;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`OpenAI chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber) => {
            if (!this.client) {
                const error = new Error('OpenAI client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            const abortController = this.createLinkedAbortController(request.signal);

            const runStream = async () => {
                try {
                    const useStreamingResponse = typeof window === 'undefined';
                    const responseType: any = useStreamingResponse ? 'stream' : 'text';

                    const response = await this.client!.post('/chat/completions', {
                        model: this.config?.model || 'gpt-4',
                        messages: this.transformMessages(request.messages),
                        ...this.buildTokenParams(this.config?.model, request.maxTokens),
                        temperature: request.temperature || 0.7,
                        stream: true,
                        ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
                    }, {
                        responseType
                    });

                    const stream = response.data;
                    const accumulator = new OpenAiToolCallAccumulator();
                    let fullContent = '';
                    // OpenAI emits usage in the LAST chunk before [DONE]
                    // when `stream_options.include_usage: true` is set.
                    // Capture it so we can surface it on message_end.
                    let lastUsage: StreamEvent['usage'] | undefined;

                    // Browser axios buffers the whole SSE response into a single
                    // string; Node yields an async-iterable. parseSseStream
                    // accepts both — caller doesn't have to branch.
                    const sseSource: AsyncIterable<unknown> | string =
                        typeof stream === 'string'
                            ? stream
                            : stream?.[Symbol.asyncIterator]
                                ? stream
                                : null as any;
                    if (sseSource === null) {
                        throw new Error('Streaming not supported in this environment');
                    }

                    for await (const { data } of parseSseStream(sseSource, { signal: abortController.signal })) {
                        try {
                            const parsed = JSON.parse(data);
                            const choice = parsed.choices?.[0];

                            this.logger.debug('Stream event', { type: 'delta', hasToolCalls: !!choice?.delta?.tool_calls });

                            // Capture usage if this chunk carries it (final
                            // chunk when stream_options.include_usage is on).
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
                                const textDelta = choice.delta.content;
                                fullContent += textDelta;
                                subscriber.next({ type: 'text_delta', textDelta });
                            }
                        } catch {
                            // Ignore lines we can't JSON.parse — usually keep-
                            // alive comments or partial frames the SSE buffer
                            // hasn't reassembled yet.
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

                } catch (error) {
                    const status = (error as any)?.response?.status;
                    const body = (error as any)?.response?.data;
                    const upstreamMessage = body?.error?.message || JSON.stringify(body || {});
                    const baseMessage = `OpenAI stream failed: ${error instanceof Error ? error.message : String(error)}`;
                    const rateLimitMessage = status === 429 ? 'OpenAI rate limit hit. Please wait a moment or lower concurrency.' : '';
                    const errorMessage = rateLimitMessage ? `${baseMessage} (${rateLimitMessage})` : `${baseMessage}${upstreamMessage ? ` | ${upstreamMessage}` : ''}`;
                    this.logger.error('Stream error', {
                        status,
                        upstream: upstreamMessage
                    });
                    subscriber.next({ type: 'error', error: errorMessage });
                    subscriber.error(new Error(errorMessage));
                }
            };

            runStream();

            return () => abortController.abort();
        });
    }

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

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        const response = await this.client.post('/chat/completions', {
            model: this.config?.model || 'gpt-4',
            messages: this.transformMessages(request.messages),
            ...this.buildTokenParams(this.config?.model, request.maxTokens || 1),
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response.data);
    }

    /**
     * Free liveness probe via `GET /models` — same auth as a chat call
     * but no tokens consumed. The endpoint is universal across OpenAI,
     * Groq, vLLM, and the openai-compatible bases, so we get health
     * status across all of them without burning budget.
     */
    protected async probeUpstream(): Promise<HealthStatus | null> {
        if (!this.client) return null; // not configured yet
        try {
            const res = await this.client.get('/models', { timeout: 5000 });
            return res.status >= 200 && res.status < 300
                ? HealthStatus.HEALTHY
                : HealthStatus.DEGRADED;
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401 || status === 403) return HealthStatus.UNHEALTHY;
            if (status === 429) return HealthStatus.DEGRADED;
            // Anything else → return null so the chat-probe fallback runs.
            return null;
        }
    }

    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'OpenAI API key is required']
            };
        }

        const supportedModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    /**
     * 转换消息格式 - OpenAI API 格式
     * 支持 tool 角色和 assistant 的 tool_calls
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
            // 处理工具结果消息 - OpenAI 使用 role: 'tool' + tool_call_id
            if (msg.role === 'tool' || msg.toolResults) {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    // 多个工具结果：每个单独一条消息
                    for (const tr of msg.toolResults) {
                        if (tr.tool_use_id) {
                            result.push({
                                role: 'tool',
                                tool_call_id: tr.tool_use_id,
                                content: String(tr.content || '')
                            });
                        }
                    }
                } else if (msg.tool_use_id) {
                    result.push({
                        role: 'tool',
                        tool_call_id: msg.tool_use_id,
                        content: String(msg.content || '')
                    });
                }
                continue;
            }

            // 处理 Assistant 消息 - 可能包含 tool_calls
            if (msg.role === 'assistant') {
                const assistantMsg: any = {
                    role: 'assistant',
                    content: String(msg.content ?? '')
                };

                // 如果有工具调用，添加 tool_calls 数组
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    assistantMsg.tool_calls = msg.toolCalls.map((tc: any) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.input || {})
                        }
                    }));
                }

                result.push(assistantMsg);
                continue;
            }

            // 其他消息保持原样
            result.push({
                role: msg.role,
                content: String(msg.content ?? '')
            });
        }

        return result;
    }

    private transformChatResponse(response: any): ChatResponse {
        const choice = response.choices?.[0];
        const content = choice?.message?.content || '';

        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content,
                timestamp: new Date()
            },
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens || 0,
                completionTokens: response.usage.completion_tokens || 0,
                totalTokens: response.usage.total_tokens || 0
            } : undefined
        };
    }
}
