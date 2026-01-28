import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * Groq AI Provider
 * Uses OpenAI-compatible API format
 */
@Injectable()
export class GroqProviderService extends BaseAiProvider {
    readonly name = 'groq';
    readonly displayName = 'Groq';
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

    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('Groq API key not provided');
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

            this.logger.info('Groq client initialized', {
                baseURL: this.getBaseURL(),
                model: this.getModelName()
            });
        } catch (error) {
            this.logger.error('Failed to initialize Groq client', error);
            throw error;
        }
    }

    private ensureClient(): void {
        if (!this.config?.apiKey) {
            this.logger.error('Groq API key not provided; cannot initialize client');
            throw new Error('Groq API key is missing. Please set it in AI settings before using Groq.');
        }

        if (!this.client) {
            this.initializeClient();
        }

        if (!this.client) {
            throw new Error('Groq client not initialized');
        }
    }

    /**
     * Resolve the model name to use. If none is provided, fall back to default and log it.
     */
    private getModelName(): string {
        const raw = (this.config?.model || '').trim();
        if (raw) {
            return raw;
        }
        const fallback = 'llama-3.1-8b-instant';
        this.logger.warn('Groq model not specified, falling back to default', { fallback });
        return fallback;
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        this.ensureClient();

        this.logRequest(request);

        try {
            const model = this.getModelName();
            const response = await this.withRetry(async () => {
                const payload: any = {
                    model,
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 0.7,
                    stream: request.stream || false,
                    ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
                };
                if (Number.isFinite(request.maxTokens) && (request.maxTokens as number) > 0) {
                    payload.max_tokens = request.maxTokens;
                }
                const result = await this.client!.post('/chat/completions', payload);

                this.logResponse(result.data);
                this.logger.debug('Groq chat request sent', { model });
                return result.data;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`Groq chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Streaming chat - supports tool calling events
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber) => {
            try {
                this.ensureClient();
            } catch (error: any) {
                const errMsg = error?.message || 'Groq client not initialized';
                subscriber.next({ type: 'error', error: errMsg });
                subscriber.error(new Error(errMsg));
                return;
            }

            const abortController = new AbortController();
            const isBrowser = typeof window !== 'undefined' && typeof (window as any).document !== 'undefined';

            const runStream = async () => {
                try {
                    const model = this.getModelName();
                    // In browsers (including Electron renderer), XMLHttpRequest does not support responseType="stream".
                    // Fallback to a non-streaming call and emit the full content once.
                    if (isBrowser) {
                        const payload: any = {
                            model,
                            messages: this.transformMessages(request.messages),
                            temperature: request.temperature || 0.7,
                            stream: false,
                            ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
                        };
                        if (Number.isFinite(request.maxTokens) && (request.maxTokens as number) > 0) {
                            payload.max_tokens = request.maxTokens;
                        }
                        const result = await this.client!.post('/chat/completions', payload);

                        const choice = result.data?.choices?.[0];
                        const content = choice?.message?.content || '';

                        if (content) {
                            subscriber.next({ type: 'text_delta', textDelta: content });
                        }

                        subscriber.next({
                            type: 'message_end',
                            message: {
                                id: this.generateId(),
                                role: MessageRole.ASSISTANT,
                                content,
                                timestamp: new Date()
                            }
                        });

                        subscriber.complete();
                        this.logger.debug('Groq chat (non-stream) request sent', { model });
                        return;
                    }

                    const response = await this.client!.post('/chat/completions', {
                        model,
                        messages: this.transformMessages(request.messages),
                        max_tokens: request.maxTokens || 1000,
                        temperature: request.temperature || 0.7,
                        stream: true,
                        ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {})
                    }, {
                        responseType: 'stream'
                    });

                    const stream = response.data;
                    let currentToolCallId = '';
                    let currentToolCallName = '';
                    let currentToolInput = '';
                    let currentToolIndex = -1;
                    let fullContent = '';

                    for await (const chunk of stream) {
                        if (abortController.signal.aborted) break;

                        const lines = chunk.toString().split('\n').filter(Boolean);

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') continue;

                                try {
                                    const parsed = JSON.parse(data);
                                    const choice = parsed.choices?.[0];

                                    this.logger.debug('Stream event', { type: 'delta', hasToolCalls: !!choice?.delta?.tool_calls });

                                    // Handle tool calling blocks
                                    if (choice?.delta?.tool_calls?.length > 0) {
                                        for (const toolCall of choice.delta.tool_calls) {
                                            const index = toolCall.index || 0;

                                            // New tool call starts
                                            if (currentToolIndex !== index) {
                                                if (currentToolIndex >= 0) {
                                                    // Send previous tool call end event
                                                    let parsedInput = {};
                                                    try {
                                                        parsedInput = JSON.parse(currentToolInput || '{}');
                                                    } catch (e) {
                                                        // Use raw input
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

                                                // Send tool call start event
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
                                                // Continue accumulating parameters
                                                if (toolCall.function?.arguments) {
                                                    currentToolInput += toolCall.function.arguments;
                                                }
                                            }
                                        }
                                    }
                                    // Handle text delta
                                    else if (choice?.delta?.content) {
                                        const textDelta = choice.delta.content;
                                        fullContent += textDelta;
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta
                                        });
                                    }
                                } catch (e) {
                                    // Ignore parsing errors
                                }
                            }
                        }
                    }

                    // Send last tool call end event
                    if (currentToolIndex >= 0) {
                        let parsedInput = {};
                        try {
                            parsedInput = JSON.parse(currentToolInput || '{}');
                        } catch (e) {
                            // Use raw input
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
                    const errorMessage = `Groq stream failed: ${error instanceof Error ? error.message : String(error)}`;
                    this.logger.error('Stream error', error);
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
        this.ensureClient();

        const model = this.getModelName();

        const response = await this.client!.post('/chat/completions', {
            model,
            messages: this.transformMessages(request.messages),
            max_tokens: request.maxTokens || 1,
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response.data);
    }

    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Groq API key is required']
            };
        }

        const supportedModels = ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    /**
     * Transform messages format - OpenAI-compatible API format
     * Supports tool role and assistant tool_calls
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
            // Handle tool result messages - OpenAI uses role: 'tool' + tool_call_id
            if (msg.role === 'tool' || msg.toolResults) {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    // Multiple tool results: each as separate message
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

            // Handle Assistant messages - may contain tool_calls
            if (msg.role === 'assistant') {
                const assistantMsg: any = {
                    role: 'assistant',
                    content: msg.content || null
                };

                // If there are tool calls, add tool_calls array
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

            // Other messages remain unchanged
            result.push({
                role: msg.role,
                content: msg.content
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
