import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { parseSseStream, OpenAiToolCallAccumulator } from './streaming';

/**
 * OpenAI兼容AI提供商
 * 支持LocalAI、Ollama、OpenRouter等OpenAI API兼容服务
 */
@Injectable()
export class OpenAiCompatibleProviderService extends BaseAiProvider {
    // Use string (not literal) so subclasses (e.g., tlink-proxy) can override safely
    readonly name: string = 'openai-compatible';
    readonly displayName: string = 'OpenAI Compatible';
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
    private supportedModels: string[] = [
        'gpt-3.5-turbo',
        'gpt-4',
        'gpt-4-turbo',
        'llama2',
        'llama2:70b',
        'codellama',
        'mistral',
        'mistral:7b',
        'mixtral',
        'local-model'
    ];

    constructor(logger: LoggerService) {
        super(logger);
    }

    private normalizeTools(tools?: any[]): any[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        // If already OpenAI-style tools, keep as-is.
        const alreadyOpenAi = tools.some(t => t?.type === 'function' && t?.function?.name);
        if (alreadyOpenAi) {
            return tools;
        }

        return tools.map((tool: any) => {
            const parameters = tool?.parameters || tool?.input_schema || { type: 'object', properties: {} };
            return {
                type: 'function',
                function: {
                    name: tool?.name,
                    description: tool?.description,
                    parameters
                }
            };
        });
    }

    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    /**
     * Normalizes the base URL so we always target the /v1 API once.
     * This prevents issues such as "/v1/v1/chat/completions" or missing "/v1".
     */
    private normalizeBaseUrl(url: string): string {
        if (!url) {
            return '';
        }

        // Trim whitespace and trailing slashes
        let base = url.trim().replace(/\/+$/, '');

        // Remove any trailing repeated /v1 segments (e.g., /v1 or /v1/v1)
        base = base.replace(/(?:\/v1)+$/, '');

        return `${base}/v1`;
    }

    private initializeClient(): void {
        const cfg = this.config;
        const allowUnauthenticated = cfg?.authConfig?.type === 'none';
        const isAgentic = cfg?.name === 'tlink-agentic' || cfg?.name === 'tlink-proxy' || cfg?.name === 'tlink-agent';
        const allowMissingKey = allowUnauthenticated || isAgentic; // Tlink Agentic can be used without a token, but should send one if provided

        if (!cfg?.baseURL) {
            this.logger.warn('OpenAI compatible provider configuration incomplete (missing baseURL)');
            return;
        }

        if (!cfg?.apiKey && !allowMissingKey) {
            this.logger.warn('OpenAI compatible provider configuration incomplete (missing API key)');
            return;
        }

        try {
            const normalizedBaseUrl = this.normalizeBaseUrl(cfg.baseURL);
            cfg.baseURL = normalizedBaseUrl;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Attach Authorization header when an API key is provided
            if (cfg.apiKey) {
                headers['Authorization'] = `Bearer ${cfg.apiKey}`;
            }

            this.client = axios.create({
                baseURL: normalizedBaseUrl,
                timeout: this.getTimeout(),
                headers
            });

            this.logger.info('OpenAI compatible client initialized', {
                baseURL: normalizedBaseUrl,
                model: cfg.model || 'gpt-3.5-turbo'
            });
        } catch (error) {
            this.logger.error('Failed to initialize OpenAI compatible client', error);
            throw error;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (!this.client) {
            throw new Error('OpenAI compatible client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const tools = this.normalizeTools(request.tools);
                const payload: any = {
                    model: this.config?.model || 'gpt-3.5-turbo',
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 0.7,
                    stream: request.stream || false,
                    ...(tools && tools.length > 0 ? { tools } : {})
                };
                if (Number.isFinite(request.maxTokens) && (request.maxTokens as number) > 0) {
                    payload.max_tokens = request.maxTokens;
                }
                const isAgentic = this.config?.name === 'tlink-agentic' || this.config?.name === 'tlink-proxy' || this.config?.name === 'tlink-agent';
                if (isAgentic && request.intent) {
                    payload.intent = request.intent;
                }
                const result = await this.client!.post('/chat/completions', payload);

                this.logResponse(result.data);
                return result.data;
            });

            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`OpenAI compatible chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持工具调用事件
     * 当 disableStreaming 配置为 true 时，使用非流式请求模拟流式响应
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.client) {
                const error = new Error('OpenAI compatible client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            const abortController = new AbortController();

            // 检查是否禁用流式响应
            const useStreaming = !this.config?.disableStreaming;

            const runStream = async () => {
                try {
                    // 如果禁用流式，使用非流式请求模拟流式响应
                    if (!useStreaming) {
                        this.logger.info('Streaming disabled, using non-streaming fallback');
                        const tools = this.normalizeTools(request.tools);
                        const payload: any = {
                            model: this.config?.model || 'gpt-3.5-turbo',
                            messages: this.transformMessages(request.messages),
                            temperature: request.temperature || 0.7,
                            stream: false,
                            ...(tools && tools.length > 0 ? { tools } : {})
                        };
                        if (Number.isFinite(request.maxTokens) && (request.maxTokens as number) > 0) {
                            payload.max_tokens = request.maxTokens;
                        }
                        const isAgentic = this.config?.name === 'tlink-agentic' || this.config?.name === 'tlink-proxy' || this.config?.name === 'tlink-agent';
                        if (isAgentic && request.intent) {
                            payload.intent = request.intent;
                        }
                        const response = await this.client!.post('/chat/completions', payload);

                        const message = response.data.choices?.[0]?.message;
                        const content = message?.content || '';
                        const toolCalls = message?.tool_calls || [];

                        // 发射工具调用事件（如果有）
                        if (toolCalls.length > 0) {
                            this.logger.debug('Non-streaming response contains tool_calls', { count: toolCalls.length });
                            for (const toolCall of toolCalls) {
                                const toolId = toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                const toolName = toolCall.function?.name || '';
                                const toolArgs = toolCall.function?.arguments || '';

                                // 解析 arguments 为 JSON 对象
                                let parsedInput = {};
                                try {
                                    parsedInput = JSON.parse(toolArgs);
                                } catch (e) {
                                    // 如果解析失败，使用原始字符串
                                }

                                // 发射 tool_use_start
                                subscriber.next({
                                    type: 'tool_use_start',
                                    toolCall: {
                                        id: toolId,
                                        name: toolName,
                                        input: {}
                                    }
                                });

                                // 发射 tool_use_end
                                subscriber.next({
                                    type: 'tool_use_end',
                                    toolCall: {
                                        id: toolId,
                                        name: toolName,
                                        input: parsedInput
                                    }
                                });
                            }
                        }

                        // 发射文本内容
                        subscriber.next({
                            type: 'text_delta',
                            textDelta: content
                        });

                        subscriber.next({
                            type: 'message_end',
                            message: {
                                id: this.generateId(),
                                role: MessageRole.ASSISTANT,
                                content: content,
                                timestamp: new Date()
                            }
                        });
                        subscriber.complete();
                        return;
                    }

                    // 正常流式请求 - 使用 'text' 而不是 'stream' (浏览器兼容)
                    const tools = this.normalizeTools(request.tools);
                    const payload: any = {
                        model: this.config?.model || 'gpt-3.5-turbo',
                        messages: this.transformMessages(request.messages),
                        temperature: request.temperature || 0.7,
                        stream: true,
                        ...(tools && tools.length > 0 ? { tools } : {})
                    };
                    if (Number.isFinite(request.maxTokens) && (request.maxTokens as number) > 0) {
                        payload.max_tokens = request.maxTokens;
                    }
                    const isAgentic = this.config?.name === 'tlink-agentic' || this.config?.name === 'tlink-proxy' || this.config?.name === 'tlink-agent';
                    if (isAgentic && request.intent) {
                        payload.intent = request.intent;
                    }
                    const response = await this.client!.post('/chat/completions', payload, {
                        responseType: 'text'  // 浏览器不支持 'stream'，使用 'text' 代替
                    });

                    const stream = response.data;

                    // The shared parseSseStream accepts string OR async-iterable;
                    // unify the two upstream paths into one loop.
                    const sseSource: AsyncIterable<unknown> | string =
                        typeof stream === 'string'
                            ? (this.logger.info('Received buffered SSE response, parsing as text'), stream)
                            : (stream && typeof (stream as any)[Symbol.asyncIterator] === 'function')
                                ? stream
                                : (this.logger.info('Buffered (non-iterable) SSE response, coercing to text'), stream?.toString?.() || '');

                    const accumulator = new OpenAiToolCallAccumulator();
                    let fullContent = '';

                    for await (const { data } of parseSseStream(sseSource, { signal: abortController.signal })) {
                        try {
                            const parsed = JSON.parse(data);
                            const choice = parsed.choices?.[0];

                            this.logger.debug('Stream event', { type: 'delta', hasToolCalls: !!choice?.delta?.tool_calls });

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
                        }
                    });
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();

                } catch (error) {
                    const errorMessage = `OpenAI compatible stream failed: ${error instanceof Error ? error.message : String(error)}`;
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
        if (!this.client) {
            throw new Error('OpenAI compatible client not initialized');
        }

        const response = await this.client.post('/chat/completions', {
            model: this.config?.model || 'gpt-3.5-turbo',
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
                errors: [...(result.errors || []), 'API key is required']
            };
        }

        if (!this.config?.baseURL) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'Base URL is required']
            };
        }

        if (this.config.model && !this.supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${this.supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    /**
     * OpenAI-compatible transform: preserve tool_calls on assistant messages
     * and tool_call_id on tool-result messages. Flattening these to
     * {role, content} makes servers like Tabby return 422 "missing field
     * tool_call_id" once the conversation includes any tool round.
     */
    protected transformMessages(messages: any[]): any[] {
        const result: any[] = [];

        for (const msg of messages) {
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
