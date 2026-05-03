import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { AnthropicToolCallAccumulator } from './streaming';

/**
 * Anthropic Claude AI提供商
 * 基于Anthropic Claude API
 */
@Injectable()
export class AnthropicProviderService extends BaseAiProvider {
    readonly name = 'anthropic';
    readonly displayName = 'Anthropic Claude';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION,
        ProviderCapability.REASONING,
        ProviderCapability.STREAMING
    ];
    readonly authConfig = {
        type: 'bearer' as const,
        credentials: {
            apiKey: ''
        }
    };

    private client: Anthropic | null = null;

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
            this.logger.warn('Anthropic API key not provided');
            return;
        }

        try {
            const allowBrowser = typeof window !== 'undefined' && (window as any).process?.versions?.electron;
            const clientOptions: any = {
                apiKey: this.config.apiKey,
                baseURL: this.getBaseURL(),
            };
            if (allowBrowser) {
                clientOptions.dangerouslyAllowBrowser = true;
            }
            this.client = new Anthropic(clientOptions);

            this.logger.info('Anthropic client initialized', {
                baseURL: this.getBaseURL(),
                model: this.config.model || 'claude-3-sonnet'
            });
        } catch (error) {
            this.logger.error('Failed to initialize Anthropic client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('Anthropic client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.client!.messages.create({
                    model: this.config?.model || 'claude-3-sonnet',
                    max_tokens: request.maxTokens || 1000,
                    system: request.systemPrompt || this.getDefaultSystemPrompt(),
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 1.0,
                    stream: request.stream || false
                });

                this.logResponse(result);
                return result;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`Anthropic chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持工具调用事件
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.client) {
                const error = new Error('Anthropic client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            const accumulator = new AnthropicToolCallAccumulator();
            let fullContent = '';
            // Anthropic emits usage in TWO places: `message_start.message.usage`
            // carries the input-token count; `message_delta.usage` accumulates
            // the output-token count. We track both and surface a unified
            // `usage` object on message_end.
            let promptTokens = 0;
            let completionTokens = 0;
            let sawUsage = false;

            const abortController = this.createLinkedAbortController(request.signal);

            const runStream = async () => {
                try {
                    // Pass the abort signal to the Anthropic SDK so
                    // unsubscribing actually tears down the HTTP request.
                    // Without this, abort() only flipped a flag that the
                    // for-await loop checked AFTER the next chunk — the
                    // inflight request kept streaming tokens to nobody
                    // until the server closed the connection (a rate-limit
                    // cost we were eating for every user-cancelled turn).
                    const stream = await this.client!.messages.stream(
                        {
                            model: this.config?.model || 'claude-3-sonnet',
                            max_tokens: request.maxTokens || 1000,
                            system: request.systemPrompt || this.getDefaultSystemPrompt(),
                            messages: this.transformMessages(request.messages),
                            temperature: request.temperature || 1.0,
                        },
                        { signal: abortController.signal } as any
                    );

                    for await (const event of stream) {
                        if (abortController.signal.aborted) break;

                        const eventAny = event as any;
                        this.logger.debug('Stream event', { type: event.type });

                        // Capture token usage from the Anthropic-shaped
                        // lifecycle. `message_start` carries input_tokens;
                        // `message_delta.usage` is cumulative output_tokens.
                        if (event.type === 'message_start' && eventAny.message?.usage) {
                            promptTokens = eventAny.message.usage.input_tokens ?? 0;
                            // Anthropic also surfaces an initial output_tokens
                            // (usually 0 or the first few) on message_start.
                            completionTokens = eventAny.message.usage.output_tokens ?? completionTokens;
                            sawUsage = true;
                        } else if (event.type === 'message_delta' && eventAny.usage) {
                            // output_tokens here is the running total.
                            completionTokens = eventAny.usage.output_tokens ?? completionTokens;
                            sawUsage = true;
                        }

                        // Text deltas — handled inline since they're not part
                        // of the tool-call state machine.
                        if (event.type === 'content_block_delta' && eventAny.delta?.type === 'text_delta') {
                            const textDelta = eventAny.delta.text;
                            fullContent += textDelta;
                            subscriber.next({ type: 'text_delta', textDelta });
                            continue;
                        }

                        // Tool-use lifecycle (content_block_start.tool_use,
                        // content_block_delta.input_json_delta,
                        // content_block_stop) — fully delegated to the
                        // shared accumulator.
                        for (const ev of accumulator.feed(event)) {
                            subscriber.next(ev);
                            this.logger.debug('Stream event', { type: ev.type, name: ev.toolCall?.name });
                        }
                    }
                    // Stream-end safety net — emits a closing tool_use_end if
                    // the upstream dropped mid-tool (network blip, abort).
                    for (const ev of accumulator.flush()) {
                        subscriber.next(ev);
                    }

                    subscriber.next({
                        type: 'message_end',
                        message: {
                            id: this.generateId(),
                            role: MessageRole.ASSISTANT,
                            content: fullContent,
                            timestamp: new Date()
                        },
                        ...(sawUsage ? {
                            usage: {
                                promptTokens,
                                completionTokens,
                                totalTokens: promptTokens + completionTokens,
                            }
                        } : {})
                    });
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();

                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `Anthropic stream failed: ${error instanceof Error ? error.message : String(error)}`;
                        this.logger.error('Stream error', error);
                        subscriber.next({ type: 'error', error: errorMessage });
                        subscriber.error(new Error(errorMessage));
                    }
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
            throw new Error('Anthropic client not initialized');
        }

        const response = await this.client.messages.create({
            model: this.config?.model || 'claude-3-sonnet',
            max_tokens: request.maxTokens || 1,
            messages: this.transformMessages(request.messages),
            temperature: request.temperature || 0
        });

        return this.transformChatResponse(response);
    }

    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Anthropic API key is required']
            };
        }

        const supportedModels = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    /**
     * 转换消息格式 - Anthropic API 消息格式
     * 支持 tool_use 和 tool_result
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
            if (msg.role === 'system') continue;

            // 处理工具结果消息
            if (msg.role === 'tool' || msg.toolResults || msg.tool_use_id) {
                if (msg.toolResults && msg.toolResults.length > 0) {
                    const toolResultBlocks = msg.toolResults
                        .filter((tr: any) => tr.tool_use_id)
                        .map((tr: any) => ({
                            type: 'tool_result',
                            tool_use_id: tr.tool_use_id,
                            content: String(tr.content || '')
                        }));

                    if (toolResultBlocks.length > 0) {
                        result.push({ role: 'user', content: toolResultBlocks });
                    }
                } else if (msg.tool_use_id) {
                    result.push({
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            tool_use_id: msg.tool_use_id,
                            content: String(msg.content || '')
                        }]
                    });
                }
                continue;
            }

            // 处理 Assistant 消息
            if (msg.role === 'assistant') {
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    const contentBlocks: any[] = [];
                    if (msg.content) {
                        contentBlocks.push({ type: 'text', text: String(msg.content) });
                    }
                    for (const tc of msg.toolCalls) {
                        contentBlocks.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.name,
                            input: tc.input || {}
                        });
                    }
                    result.push({ role: 'assistant', content: contentBlocks });
                } else {
                    // Anthropic rejects content blocks with empty text; skip
                    // assistant messages whose content is empty entirely —
                    // they carry no information and would fail validation.
                    const text = String(msg.content || '');
                    if (!text) continue;
                    result.push({
                        role: 'assistant',
                        content: [{ type: 'text', text }]
                    });
                }
                continue;
            }

            // 用户消息
            result.push({
                role: 'user',
                content: [{ type: 'text', text: String(msg.content || '') }]
            });
        }

        return result;
    }

    private transformChatResponse(response: any): ChatResponse {
        const content = response.content[0];
        const text = content.type === 'text' ? content.text : '';

        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: text,
                timestamp: new Date()
            },
            usage: response.usage ? {
                promptTokens: response.usage.input_tokens || 0,
                completionTokens: response.usage.output_tokens || 0,
                totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
            } : undefined
        };
    }
}
