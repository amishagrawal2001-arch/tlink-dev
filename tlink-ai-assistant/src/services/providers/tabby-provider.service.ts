import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * Tabby AI Provider
 * Self-hosted AI coding assistant from TabbyML
 * OpenAI-compatible API format
 */
@Injectable()
export class TabbyProviderService extends BaseAiProvider {
    readonly name = 'tabby';
    readonly displayName = 'Tabby (Self-hosted)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION,
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

    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    private normalizeBaseURL(url: string): string {
        if (!url) {
            return '';
        }
        let base = url.trim().replace(/\/+$/, '');
        base = base.replace(/(?:\/v1beta|\/v1)+$/, '');
        return base;
    }

    private async postChatCompletions(payload: any, axiosOptions: any = {}): Promise<any> {
        if (!this.client) {
            throw new Error('Tabby client not initialized');
        }

        const endpoints = ['/v1beta/chat/completions', '/v1/chat/completions', '/chat/completions'];
        let lastError: any;

        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            try {
                return await this.client.post(endpoint, payload, axiosOptions);
            } catch (error: any) {
                const status = error?.response?.status;
                const isLast = i === endpoints.length - 1;

                if (status === 404 && !isLast) {
                    this.logger.warn('Tabby endpoint returned 404, trying fallback endpoint', { endpoint });
                    lastError = error;
                    continue;
                }

                throw error;
            }
        }

        throw lastError || new Error('Tabby chat endpoint unavailable');
    }

    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('Tabby API key not provided');
            return;
        }

        try {
            const normalizedBaseURL = this.normalizeBaseURL(this.getBaseURL());
            if (!normalizedBaseURL) {
                this.logger.warn('Tabby server URL is empty after normalization');
                return;
            }

            this.client = axios.create({
                baseURL: normalizedBaseURL,
                timeout: this.getTimeout(),
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            this.logger.info('Tabby client initialized', {
                baseURL: normalizedBaseURL,
                model: this.config.model || 'default'
            });
        } catch (error) {
            this.logger.error('Failed to initialize Tabby client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('Tabby client not initialized');
        }

        this.logRequest(request);

        try {
            // Tabby doesn't properly support stream:false, so we use streaming and collect the result
            const response = await this.withRetry(async () => {
                const result = await this.postChatCompletions({
                    model: this.config?.model || 'default',
                    messages: this.transformMessages(request.messages),
                    max_tokens: request.maxTokens || this.config?.maxTokens,
                    temperature: request.temperature ?? this.config?.temperature ?? 0.7,
                    stream: true
                }, {
                    responseType: 'text'
                });

                // Parse streaming response and collect content
                let fullContent = '';
                const text = result.data?.toString() || String(result.data || '');
                const lines = text.split('\n').filter(Boolean);

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;

                        try {
                            const parsed = JSON.parse(data);
                            const choice = parsed.choices?.[0];
                            if (choice?.delta?.content) {
                                fullContent += choice.delta.content;
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }

                // Return in OpenAI format
                return {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: fullContent
                        }
                    }],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0
                    }
                };
            });

            this.logResponse(response);
            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`Tabby chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Streaming chat functionality
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber) => {
            if (!this.client) {
                const error = new Error('Tabby client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            const abortController = this.createLinkedAbortController(request.signal);

            const runStream = async () => {
                try {
                    const useStreamingResponse = typeof window === 'undefined';
                    const responseType: any = useStreamingResponse ? 'stream' : 'text';

                    const response = await this.postChatCompletions({
                        model: this.config?.model || 'default',
                        messages: this.transformMessages(request.messages),
                        max_tokens: request.maxTokens || this.config?.maxTokens,
                        temperature: request.temperature ?? this.config?.temperature ?? 0.7,
                        stream: true
                    }, {
                        responseType,
                        signal: abortController.signal
                    });

                    const stream = response.data;
                    let fullContent = '';
                    // Tool-call accumulators — OpenAI-compatible SSE streams
                    // tool invocations via `delta.tool_calls[n]` chunks whose
                    // `function.arguments` must be concatenated until the
                    // tool call at that index finishes. Without this block,
                    // any tool call from Tabby is silently dropped.
                    let currentToolCallId = '';
                    let currentToolCallName = '';
                    let currentToolInput = '';
                    let currentToolIndex = -1;

                    const flushPendingToolCall = () => {
                        if (currentToolIndex < 0) return;
                        let parsedInput: any = {};
                        try {
                            parsedInput = JSON.parse(currentToolInput || '{}');
                        } catch (e) {
                            this.logger.warn('Tabby tool-call arguments not valid JSON, passing raw', {
                                name: currentToolCallName,
                                raw: currentToolInput
                            });
                            parsedInput = { _raw: currentToolInput };
                        }
                        subscriber.next({
                            type: 'tool_use_end',
                            toolCall: {
                                id: currentToolCallId,
                                name: currentToolCallName,
                                input: parsedInput
                            }
                        });
                    };

                    const processChunk = (chunk: any) => {
                        const text = chunk?.toString ? chunk.toString() : String(chunk || '');
                        const lines = text.split('\n').filter(Boolean);

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') continue;

                                try {
                                    const parsed = JSON.parse(data);
                                    const choice = parsed.choices?.[0];

                                    this.logger.debug('Stream event', {
                                        type: 'delta',
                                        hasContent: !!choice?.delta?.content,
                                        hasToolCalls: !!choice?.delta?.tool_calls
                                    });

                                    if (choice?.delta?.tool_calls?.length > 0) {
                                        for (const toolCall of choice.delta.tool_calls) {
                                            const index = toolCall.index || 0;

                                            if (currentToolIndex !== index) {
                                                flushPendingToolCall();

                                                currentToolIndex = index;
                                                currentToolCallId = toolCall.id || `tool_${Date.now()}_${index}`;
                                                currentToolCallName = toolCall.function?.name || '';
                                                currentToolInput = toolCall.function?.arguments || '';

                                                subscriber.next({
                                                    type: 'tool_use_start',
                                                    toolCall: {
                                                        id: currentToolCallId,
                                                        name: currentToolCallName,
                                                        input: {}
                                                    }
                                                });
                                            } else if (toolCall.function?.arguments) {
                                                currentToolInput += toolCall.function.arguments;
                                            }
                                        }
                                    } else if (choice?.delta?.content) {
                                        const textDelta = choice.delta.content;
                                        fullContent += textDelta;
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta
                                        });
                                    }
                                } catch (e) {
                                    // Ignore parse errors
                                }
                            }
                        }
                    };

                    // Browser environment cannot use responseType=stream, use one-time text parsing
                    if (typeof stream === 'string') {
                        processChunk(stream);
                    } else if (stream?.[Symbol.asyncIterator]) {
                        for await (const chunk of stream) {
                            if (abortController.signal.aborted) break;
                            processChunk(chunk);
                        }
                    } else {
                        // Fallback: cannot stream, throw error
                        throw new Error('Streaming not supported in this environment');
                    }

                    // Flush any trailing tool call before message_end.
                    flushPendingToolCall();

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
                    const status = (error as any)?.response?.status;
                    const body = (error as any)?.response?.data;
                    const upstreamMessage = body?.error?.message || JSON.stringify(body || {});
                    const baseMessage = `Tabby stream failed: ${error instanceof Error ? error.message : String(error)}`;
                    const errorMessage = `${baseMessage}${upstreamMessage ? ` | ${upstreamMessage}` : ''}`;
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
            throw new Error('Tabby client not initialized');
        }

        const response = await this.postChatCompletions({
            model: this.config?.model || 'default',
            messages: this.transformMessages(request.messages),
            max_tokens: request.maxTokens || 1,
            temperature: request.temperature ?? 0
        });

        return this.transformChatResponse(response.data);
    }

    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Tabby API key (auth token) is required']
            };
        }

        if (!this.config?.baseURL) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Tabby server URL is required']
            };
        }

        return result;
    }

    /**
     * Transform message format - OpenAI-compatible format for Tabby.
     *
     * Tabby's /v1beta/chat/completions validates every message against an
     * OpenAI-style schema. If an assistant message carried tool_calls but we
     * send only {role, content}, or if a tool-result message is missing its
     * tool_call_id, the server 422s with "missing field tool_call_id".
     *
     * This mirrors the OpenAI provider's transform: expand tool-result
     * messages (one per result, each with tool_call_id) and emit assistant
     * messages with their tool_calls array intact.
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
            // Tool-result messages -> role:'tool' with tool_call_id
            if (msg.role === 'tool' || msg.toolResults) {
                if (msg.toolResults && msg.toolResults.length > 0) {
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

            // Assistant messages - preserve tool_calls array
            if (msg.role === 'assistant') {
                const assistantMsg: any = {
                    role: 'assistant',
                    content: String(msg.content ?? '')
                };

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

            // User / system messages - plain {role, content}
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
