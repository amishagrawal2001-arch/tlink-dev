import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import axios, { AxiosInstance } from 'axios';
import { Anthropic } from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, MessageRole, StreamEvent } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { parseSseStream, AnthropicToolCallAccumulator } from './streaming';

/**
 * GLM (ChatGLM) AI提供商
 * 支持两种API格式：
 * 1. Anthropic兼容格式: https://open.bigmodel.cn/api/anthropic -> 使用 Anthropic SDK
 * 2. OpenAI兼容格式: https://open.bigmodel.cn/api/paas/v4 -> 使用 Axios
 */
@Injectable()
export class GlmProviderService extends BaseAiProvider {
    readonly name = 'glm';
    readonly displayName = 'GLM (ChatGLM-4.6)';
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

    // 模式：true = Anthropic SDK, false = Axios (OpenAI 格式)
    private useAnthropicSdk: boolean = false;
    // 客户端：可以是 Anthropic SDK 或 Axios 实例
    private anthropicClient: Anthropic | null = null;
    private axiosClient: AxiosInstance | null = null;

    constructor(logger: LoggerService) {
        super(logger);
    }

    /**
     * 检测 API 格式模式
     * @param baseURL 基础 URL
     * @returns true = Anthropic 格式 (SDK), false = OpenAI 格式 (Axios)
     */
    private detectApiMode(baseURL: string): boolean {
        // Anthropic 兼容格式包含 /anthropic 路径
        return baseURL.includes('/anthropic');
    }

    /**
     * 获取当前 API 模式
     */
    private isAnthropicMode(): boolean {
        return this.useAnthropicSdk;
    }

    /**
     * 配置提供商
     */
    configure(config: any): void {
        super.configure(config);
        this.authConfig.credentials.apiKey = config.apiKey || '';
        this.initializeClient();
    }

    /**
     * 初始化客户端（根据 baseURL 自动选择 SDK 或 Axios）
     */
    private initializeClient(): void {
        if (!this.config?.apiKey) {
            this.logger.warn('GLM API key not provided');
            return;
        }

        const baseURL = this.getBaseURL();
        this.useAnthropicSdk = this.detectApiMode(baseURL);

        try {
            if (this.useAnthropicSdk) {
                // 方案1: Anthropic SDK (用于 /api/anthropic 格式)
                const allowBrowser = typeof window !== 'undefined' && (window as any).process?.versions?.electron;
                const clientOptions: any = {
                    apiKey: this.config.apiKey,
                    baseURL: baseURL,
                };
                if (allowBrowser) {
                    clientOptions.dangerouslyAllowBrowser = true;
                }
                this.anthropicClient = new Anthropic(clientOptions);
                this.logger.info('GLM client initialized (Anthropic SDK)', {
                    baseURL,
                    model: this.config.model || 'glm-4.6'
                });
            } else {
                // 方案2: Axios (用于 /api/paas/v4 OpenAI 格式)
                this.axiosClient = axios.create({
                    baseURL: baseURL,
                    timeout: this.getTimeout(),
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                // 添加请求拦截器
                this.axiosClient.interceptors.request.use(
                    (config) => {
                        this.logger.debug('GLM API request', {
                            url: config.url,
                            method: config.method,
                            data: this.sanitizeRequest(config.data)
                        });
                        return config;
                    },
                    (error) => {
                        this.logger.error('GLM API request error', error);
                        return Promise.reject(error);
                    }
                );

                // 添加响应拦截器
                this.axiosClient.interceptors.response.use(
                    (response) => {
                        this.logger.debug('GLM API response', {
                            status: response.status,
                            data: this.sanitizeResponse(response.data)
                        });
                        return response;
                    },
                    (error) => {
                        this.logger.error('GLM API response error', error);
                        return Promise.reject(error);
                    }
                );

                this.logger.info('GLM client initialized (Axios)', {
                    baseURL,
                    model: this.config.model || 'glm-4.6'
                });
            }
        } catch (error) {
            this.logger.error('Failed to initialize GLM client', error);
            throw error;
        }
    }

    /**
     * 聊天功能 - 支持双模式
     * 方案1: Anthropic SDK -> /v1/messages
     * 方案2: Axios -> /chat/completions
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (this.useAnthropicSdk) {
            return this.chatWithAnthropicSdk(request);
        } else {
            return this.chatWithAxios(request);
        }
    }

    /**
     * 方案1: 使用 Anthropic SDK (适用于 /api/anthropic 格式)
     */
    private async chatWithAnthropicSdk(request: ChatRequest): Promise<ChatResponse> {
        if (!this.anthropicClient) {
            throw new Error('GLM client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.anthropicClient!.messages.create({
                    model: this.config?.model || 'glm-4.6',
                    max_tokens: request.maxTokens || 1000,
                    system: request.systemPrompt || this.getDefaultSystemPrompt(),
                    messages: this.transformMessages(request.messages),
                    temperature: request.temperature || 0.95,
                    stream: request.stream || false
                });
                return result;
            });

            this.logResponse(response);
            return this.transformChatResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`GLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 方案2: 使用 Axios (适用于 /api/paas/v4 OpenAI 格式)
     */
    private async chatWithAxios(request: ChatRequest): Promise<ChatResponse> {
        if (!this.axiosClient) {
            throw new Error('GLM client not initialized');
        }

        this.logRequest(request);

        try {
            const response = await this.withRetry(async () => {
                const result = await this.axiosClient!.post('/chat/completions', {
                    model: this.config?.model || 'glm-4',
                    messages: request.messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.95,
                    stream: request.stream || false
                });
                return result.data;
            });

            this.logResponse(response);
            return this.transformOpenAIResponse(response);

        } catch (error) {
            this.logError(error, { request });
            throw new Error(`GLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 流式聊天功能 - 支持双模式
     * 方案1: Anthropic SDK -> 自动 SSE 解析，浏览器兼容
     * 方案2: Axios -> responseType: 'text' + 手动解析 SSE
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        if (this.useAnthropicSdk) {
            return this.chatStreamWithAnthropicSdk(request);
        } else {
            return this.chatStreamWithAxios(request);
        }
    }

    /**
     * 方案1: Anthropic SDK 流式 (适用于 /api/anthropic 格式)
     * 优势: SDK 自动处理 SSE，浏览器完全兼容
     */
    private chatStreamWithAnthropicSdk(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.anthropicClient) {
                const error = new Error('GLM client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            this.logRequest(request);

            const abortController = new AbortController();

            const runStream = async () => {
                try {
                    const stream = (this.anthropicClient!.messages.stream as any)({
                        model: this.config?.model || 'glm-4.6',
                        max_tokens: request.maxTokens || 1000,
                        system: request.systemPrompt || this.getDefaultSystemPrompt(),
                        messages: this.transformMessages(request.messages),
                        temperature: request.temperature || 0.95
                    });

                    const accumulator = new AnthropicToolCallAccumulator();
                    let fullContent = '';

                    for await (const event of stream) {
                        if (abortController.signal.aborted) break;

                        this.logger.debug('Stream event', { type: event.type });

                        // Text deltas handled inline; tool lifecycle goes to
                        // the shared accumulator.
                        if (
                            event.type === 'content_block_delta' &&
                            (event.delta as any)?.type === 'text_delta'
                        ) {
                            const textDelta = (event.delta as any).text;
                            fullContent += textDelta;
                            subscriber.next({ type: 'text_delta', textDelta });
                            continue;
                        }
                        for (const ev of accumulator.feed(event)) {
                            subscriber.next(ev);
                            this.logger.debug('Stream event', { type: ev.type, name: ev.toolCall?.name });
                        }
                    }
                    for (const ev of accumulator.flush()) {
                        subscriber.next(ev);
                    }

                    const finalMessage = await stream.finalMessage();
                    subscriber.next({
                        type: 'message_end',
                        message: this.transformChatResponse(finalMessage).message
                    });
                    this.logger.debug('Stream event', { type: 'message_end', contentLength: fullContent.length });
                    subscriber.complete();

                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `GLM stream failed: ${error instanceof Error ? error.message : String(error)}`;
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

    /**
     * 方案2: Axios 流式 (适用于 /api/paas/v4 OpenAI 格式)
     * 修复: 使用 responseType: 'text' 避免浏览器 'stream' 类型错误
     */
    private chatStreamWithAxios(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            if (!this.axiosClient) {
                const error = new Error('GLM client not initialized');
                subscriber.next({ type: 'error', error: error.message });
                subscriber.error(error);
                return;
            }

            this.logRequest(request);

            let fullContent = '';

            const abortController = new AbortController();

            const runStream = async () => {
                try {
                    // responseType: 'text' instead of 'stream' for browser
                    // compatibility — axios in the browser doesn't support
                    // 'stream'. parseSseStream handles either.
                    const response = await this.axiosClient!.post('/chat/completions', {
                        model: this.config?.model || 'glm-4',
                        messages: request.messages.map(msg => ({
                            role: msg.role,
                            content: msg.content
                        })),
                        max_tokens: request.maxTokens || 1000,
                        temperature: request.temperature || 0.95,
                        stream: true
                    }, {
                        responseType: 'text'
                    });

                    const stream = response.data;

                    for await (const { data } of parseSseStream(stream, { signal: abortController.signal })) {
                        try {
                            const parsed = JSON.parse(data);
                            const choice = parsed.choices?.[0];
                            if (!choice) continue;

                            const delta = choice.delta?.content || '';
                            if (delta) {
                                fullContent += delta;
                                subscriber.next({ type: 'text_delta', textDelta: delta });
                            }

                            if (choice.finish_reason) {
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
                            }
                        } catch {
                            // Keep-alive frame or unparseable line — skip.
                        }
                    }

                } catch (error) {
                    if ((error as any).name !== 'AbortError') {
                        const errorMessage = `GLM stream failed: ${error instanceof Error ? error.message : String(error)}`;
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

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        if (this.useAnthropicSdk) {
            // 方案1: Anthropic SDK 测试
            if (!this.anthropicClient) {
                throw new Error('GLM client not initialized');
            }
            const response = await this.anthropicClient.messages.create({
                model: this.config?.model || 'glm-4.6',
                max_tokens: request.maxTokens || 1,
                messages: this.transformMessages(request.messages),
                temperature: request.temperature || 0
            });
            return this.transformChatResponse(response);
        } else {
            // 方案2: Axios 测试
            if (!this.axiosClient) {
                throw new Error('GLM client not initialized');
            }
            const response = await this.axiosClient.post('/chat/completions', {
                model: this.config?.model || 'glm-4',
                messages: request.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                max_tokens: request.maxTokens || 1,
                temperature: request.temperature || 0
            });
            return this.transformOpenAIResponse(response.data);
        }
    }

    /**
     * 验证配置
     */
    validateConfig(): ValidationResult {
        const result = super.validateConfig();

        if (!this.config?.apiKey) {
            return {
                valid: false,
                errors: [...(result.errors || []), 'GLM API key is required']
            };
        }

        // 验证支持的模型
        const supportedModels = ['glm-4.6'];
        if (this.config.model && !supportedModels.includes(this.config.model)) {
            result.warnings = [
                ...(result.warnings || []),
                `Model ${this.config.model} might not be supported. Supported models: ${supportedModels.join(', ')}`
            ];
        }

        return result;
    }

    /**
     * 转换消息格式（Anthropic兼容）
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
                    result.push({
                        role: 'assistant',
                        content: [{ type: 'text', text: String(msg.content || '') }]
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

    /**
     * 转换聊天响应 (Anthropic 格式)
     */
    private transformChatResponse(response: any): ChatResponse {
        let text = '';

        if (response?.content) {
            if (Array.isArray(response.content)) {
                for (const block of response.content) {
                    if (block.type === 'text') {
                        text += block.text || '';
                    }
                    // Note: 工具调用通过流式事件处理，不在此处处理
                }
            } else if (typeof response.content === 'string') {
                text = response.content;
            }
        }

        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: text,
                timestamp: new Date()
            },
            usage: response?.usage ? {
                promptTokens: response.usage.input_tokens || 0,
                completionTokens: response.usage.output_tokens || 0,
                totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
            } : undefined
        };
    }

    /**
     * 转换 OpenAI 格式响应
     */
    private transformOpenAIResponse(response: any): ChatResponse {
        const choice = response.choices?.[0];
        const message = choice?.message;

        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: message?.content || '',
                timestamp: new Date()
            },
            usage: response?.usage ? {
                promptTokens: response.usage.prompt_tokens || 0,
                completionTokens: response.usage.completion_tokens || 0,
                totalTokens: response.usage.total_tokens || 0
            } : undefined
        };
    }
}
