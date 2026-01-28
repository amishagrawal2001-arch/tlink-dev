import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { BaseAiProvider } from './base-provider.service';
import { ProviderCapability, ValidationResult } from '../../types/provider.types';
import { ChatRequest, ChatResponse, StreamEvent, MessageRole, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';

/**
 * Ollama local AI provider
 * Compatible with OpenAI API format, default port 11434
 */
@Injectable()
export class OllamaProviderService extends BaseAiProvider {
    readonly name = 'ollama';
    readonly displayName = 'Ollama (Local)';
    readonly capabilities = [
        ProviderCapability.CHAT,
        ProviderCapability.STREAMING,
        ProviderCapability.COMMAND_GENERATION,
        ProviderCapability.COMMAND_EXPLANATION
    ];
    readonly authConfig = {
        type: 'none' as const,
        credentials: {}
    };

    // Cache models that don't support tools to avoid repeated errors
    private modelsWithoutToolSupport = new Set<string>();
    private toolSupportWarningsShown = new Set<string>();
    private lastModelName: string = '';

    constructor(logger: LoggerService) {
        super(logger);
    }

    /**
     * Clear tool support cache when model changes
     */
    private checkModelChange(): void {
        const currentModel = this.config?.model || 'llama3.1';
        if (currentModel !== this.lastModelName) {
            // Model changed - clear warning cache (but keep tool support cache)
            this.toolSupportWarningsShown.clear();
            this.lastModelName = currentModel;
        }
    }

    /**
     * Normalize baseURL by removing any existing API paths
     * Returns clean base URL (e.g., http://localhost:11434)
     */
    private normalizeBaseURL(baseURL: string): string {
        // Remove any existing API paths and trailing slashes
        return baseURL
            .replace(/\/v1\/chat\/completions.*$/i, '')
            .replace(/\/api\/chat.*$/i, '')
            .replace(/\/v1\/?$/i, '')
            .replace(/\/+$/, '');
    }

    /**
     * Non-streaming chat
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        this.logRequest(request);

        try {
            // Try OpenAI-compatible API first, fallback to native API
            const originalBaseURL = this.getBaseURL();
            const cleanBaseURL = this.normalizeBaseURL(originalBaseURL);
            
            // Check if user wants OpenAI-compatible API (baseURL contains /v1 in config)
            const useOpenAICompat = originalBaseURL.includes('/v1');
            
            let url: string;
            let requestBody: any;
            
            // Check if model changed and clear warning cache if needed
            this.checkModelChange();
            
            if (useOpenAICompat) {
                // OpenAI-compatible format: /v1/chat/completions
                // baseURL should be like http://localhost:11434
                url = `${cleanBaseURL}/v1/chat/completions`;
                const modelName = this.config?.model || 'llama3.1';
                
                // Skip tools if we know this model doesn't support them
                const shouldIncludeTools = request.tools && request.tools.length > 0 && !this.modelsWithoutToolSupport.has(modelName);
                
                requestBody = {
                    model: modelName,
                    messages: this.transformMessages(request.messages),
                    max_tokens: request.maxTokens || 1000,
                    temperature: request.temperature || 0.7,
                    stream: false,
                    ...(shouldIncludeTools ? { tools: request.tools } : {})
                };
            } else {
                // Native Ollama format: /api/chat
                // baseURL should be like http://localhost:11434
                url = `${cleanBaseURL}/api/chat`;
                requestBody = {
                    model: this.config?.model || 'llama3.1',
                    messages: this.transformMessagesToNative(request.messages),
                    stream: false,
                    options: {
                        temperature: request.temperature || 0.7,
                        num_predict: request.maxTokens || 1000
                    }
                };
            }
            
            this.logger.info('Ollama API request', { url, originalBaseURL, cleanBaseURL, useOpenAICompat, configBaseURL: this.config?.baseURL });
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                
                // Check if error is about tools not being supported
                if (response.status === 400 && errorText.includes('does not support tools')) {
                    const modelName = requestBody.model;
                    
                    // Cache this model as not supporting tools
                    this.modelsWithoutToolSupport.add(modelName);
                    
                    this.logger.warn('Model does not support tools, retrying without tools', { 
                        model: modelName,
                        errorText: errorText.substring(0, 200)
                    });
                    
                    // Retry without tools
                    const requestWithoutTools = {
                        ...request,
                        tools: undefined
                    };
                    
                    return this.chat(requestWithoutTools);
                }
                
                // If OpenAI-compatible API fails with 404, try native API
                if (useOpenAICompat && response.status === 404) {
                    this.logger.warn('OpenAI-compatible API not available, trying native API', { url, cleanBaseURL });
                    return this.chatWithNativeAPI(request);
                }
                throw new Error(`Ollama API error: ${response.status} - ${errorText.substring(0, 100)}`);
            }

            const data = await response.json();
            this.logResponse(data);

            if (useOpenAICompat) {
                // OpenAI-compatible response format
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
            } else {
                // Native Ollama response format
                return {
                    message: {
                        id: this.generateId(),
                        role: MessageRole.ASSISTANT,
                        content: data.message?.content || '',
                        timestamp: new Date()
                    },
                    usage: undefined
                };
            }
        } catch (error) {
            this.logError(error, { request });
            throw new Error(`Ollama chat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Native Ollama API chat (fallback)
     */
    private async chatWithNativeAPI(request: ChatRequest): Promise<ChatResponse> {
        const originalBaseURL = this.getBaseURL();
        const cleanBaseURL = this.normalizeBaseURL(originalBaseURL);
        const url = `${cleanBaseURL}/api/chat`;
        
        this.logger.debug('Ollama native API request', { url, originalBaseURL, cleanBaseURL });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config?.model || 'llama3.1',
                messages: this.transformMessagesToNative(request.messages),
                stream: false,
                options: {
                    temperature: request.temperature || 0.7,
                    num_predict: request.maxTokens || 1000
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama native API error: ${response.status}`);
        }

        const data = await response.json();
        return {
            message: {
                id: this.generateId(),
                role: MessageRole.ASSISTANT,
                content: data.message?.content || '',
                timestamp: new Date()
            },
            usage: undefined
        };
    }

    /**
     * Transform messages to native Ollama format
     */
    private transformMessagesToNative(messages: any[]): any[] {
        return messages.map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        }));
    }

    /**
     * Handle native Ollama streaming response
     */
    private async handleNativeStream(
        response: Response,
        subscriber: Observer<StreamEvent>,
        abortController: AbortController
    ): Promise<void> {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');

        let fullContent = '';
        while (true) {
            if (abortController.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(Boolean);

            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.message?.content) {
                        const delta = parsed.message.content;
                        fullContent += delta;
                        subscriber.next({
                            type: 'text_delta',
                            textDelta: delta
                        });
                    }
                    if (parsed.done) {
                        subscriber.next({
                            type: 'message_end',
                            message: {
                                id: this.generateId(),
                                role: MessageRole.ASSISTANT,
                                content: fullContent,
                                timestamp: new Date()
                            }
                        });
                        subscriber.complete();
                        return;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }

    /**
     * Streaming chat - supports tool call events
     */
    chatStream(request: ChatRequest): Observable<StreamEvent> {
        return new Observable<StreamEvent>((subscriber: Observer<StreamEvent>) => {
            const abortController = new AbortController();

            this.logRequest(request);

            const runStream = async () => {
                try {
                    // Try OpenAI-compatible API first, fallback to native API
                    const originalBaseURL = this.getBaseURL();
                    const cleanBaseURL = this.normalizeBaseURL(originalBaseURL);
                    
                    // Check if user wants OpenAI-compatible API (baseURL contains /v1 in config)
                    const useOpenAICompat = originalBaseURL.includes('/v1');
                    
                    let url: string;
                    let requestBody: any;
                    
                    // Check if model changed and clear warning cache if needed
                    this.checkModelChange();
                    
                    if (useOpenAICompat) {
                        // OpenAI-compatible format
                        // baseURL should be like http://localhost:11434
                        url = `${cleanBaseURL}/v1/chat/completions`;
                        const modelName = this.config?.model || 'llama3.1';
                        this.logger.debug('Using model', { modelName, configModel: this.config?.model });
                        
                        // Skip tools if we know this model doesn't support them
                        const shouldIncludeTools = request.tools && request.tools.length > 0 && !this.modelsWithoutToolSupport.has(modelName);
                        
                        requestBody = {
                            model: modelName,
                            messages: this.transformMessages(request.messages),
                            max_tokens: request.maxTokens || 1000,
                            temperature: request.temperature || 0.7,
                            stream: true,
                            ...(shouldIncludeTools ? { tools: request.tools } : {})
                        };
                    } else {
                        // Native Ollama format
                        // baseURL should be like http://localhost:11434
                        url = `${cleanBaseURL}/api/chat`;
                        const modelName = this.config?.model || 'llama3.1';
                        this.logger.debug('Using model', { modelName, configModel: this.config?.model });
                        requestBody = {
                            model: modelName,
                            messages: this.transformMessagesToNative(request.messages),
                            stream: true,
                            options: {
                                temperature: request.temperature || 0.7,
                                num_predict: request.maxTokens || 1000
                            }
                        };
                    }
                    
                    this.logger.info('Ollama stream API request', { 
                        url, 
                        originalBaseURL, 
                        cleanBaseURL, 
                        useOpenAICompat, 
                        configBaseURL: this.config?.baseURL,
                        model: requestBody.model,
                        requestBody: JSON.stringify(requestBody).substring(0, 200)
                    });
                    
                    let response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                        signal: abortController.signal
                    });

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => '');
                        this.logger.error('Ollama API error response', { 
                            status: response.status, 
                            statusText: response.statusText,
                            url,
                            errorText: errorText.substring(0, 200)
                        });
                        
                        // Check if error is about tools not being supported
                        if (response.status === 400 && errorText.includes('does not support tools')) {
                            const modelName = requestBody.model;
                            
                            // Cache this model as not supporting tools
                            this.modelsWithoutToolSupport.add(modelName);
                            
                            this.logger.warn('Model does not support tools, retrying without tools', { 
                                model: modelName,
                                errorText: errorText.substring(0, 200)
                            });
                            
                            // Only show warning once per model
                            if (!this.toolSupportWarningsShown.has(modelName)) {
                                this.toolSupportWarningsShown.add(modelName);
                                // Notify user that tools are disabled for this model (only once)
                                subscriber.next({
                                    type: 'text_delta',
                                    textDelta: `\n\n⚠️ Note: This model (${modelName}) does not support tools. Tool capabilities are disabled for this model.\n\n`
                                });
                            }
                            
                            // Recreate the request body without tools
                            const retryRequestBody = {
                                ...requestBody,
                                tools: undefined
                            };
                            
                            // Retry with the same stream handling
                            response = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(retryRequestBody),
                                signal: abortController.signal
                            });
                            
                            if (!response.ok) {
                                const retryErrorText = await response.text().catch(() => '');
                                throw new Error(`Ollama API error: ${response.status} - ${retryErrorText.substring(0, 100)}`);
                            }
                        }
                        
                        // If OpenAI-compatible API fails with 404, try native API
                        if (useOpenAICompat && response.status === 404) {
                            this.logger.warn('OpenAI-compatible API not available, trying native API');
                            return this.streamWithNativeAPI(request, subscriber, abortController);
                        }
                        throw new Error(`Ollama API error: ${response.status} - ${errorText.substring(0, 100)}`);
                    }
                    
                    // Handle native API streaming format
                    if (!useOpenAICompat) {
                        return this.handleNativeStream(response, subscriber, abortController);
                    }

                    const reader = response.body?.getReader();
                    const decoder = new TextDecoder();

                    if (!reader) {
                        throw new Error('No response body');
                    }

                    // Tool call state tracking
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

                                // Handle tool call blocks
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
                                            // Initialize name and input - they may come in chunks
                                            currentToolCallName = toolCall.function?.name || '';
                                            currentToolInput = toolCall.function?.arguments || '';

                                            // Only send tool_use_start if we have a name, otherwise wait for it
                                            if (currentToolCallName && currentToolCallName.trim() !== '') {
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
                                                // Name will come in a later chunk, wait for it
                                                this.logger.debug('Tool call started, waiting for name', { id: currentToolCallId, index });
                                            }
                                        } else {
                                            // 继续累积工具名称和参数
                                            if (toolCall.function?.name) {
                                                currentToolCallName += toolCall.function.name;
                                                // If we just got the name and haven't sent tool_use_start yet, send it now
                                                if (currentToolCallName && currentToolCallName.trim() !== '' && currentToolIndex === index) {
                                                    subscriber.next({
                                                        type: 'tool_use_start',
                                                        toolCall: {
                                                            id: currentToolCallId,
                                                            name: currentToolCallName,
                                                            input: {}
                                                        }
                                                    });
                                                    this.logger.debug('Stream event', { type: 'tool_use_start', name: currentToolCallName });
                                                }
                                            }
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
                    if (currentToolIndex >= 0 && currentToolCallName && currentToolCallName.trim() !== '') {
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
                    } else if (currentToolIndex >= 0 && (!currentToolCallName || currentToolCallName.trim() === '')) {
                        this.logger.warn('Skipping tool_use_end for tool with empty name', { 
                            currentToolCallId,
                            currentToolCallName 
                        });
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
                        const errorMessage = `Ollama stream failed: ${error instanceof Error ? error.message : String(error)}`;
                        this.logError(error, { request });
                        subscriber.next({ type: 'error', error: errorMessage });
                        subscriber.error(new Error(errorMessage));
                    }
                }
            };

            runStream();

            // 返回取消函数
            return () => abortController.abort();
        });
    }

    /**
     * Stream with native Ollama API (fallback)
     */
    private streamWithNativeAPI(
        request: ChatRequest,
        subscriber: Observer<StreamEvent>,
        abortController: AbortController
    ): void {
        const originalBaseURL = this.getBaseURL();
        const cleanBaseURL = this.normalizeBaseURL(originalBaseURL);
        const url = `${cleanBaseURL}/api/chat`;
        
        this.logger.debug('Ollama native stream API request', { url, originalBaseURL, cleanBaseURL });
        
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config?.model || 'llama3.1',
                messages: this.transformMessagesToNative(request.messages),
                stream: true,
                options: {
                    temperature: request.temperature || 0.7,
                    num_predict: request.maxTokens || 1000
                }
            }),
            signal: abortController.signal
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`Ollama native API error: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('No response body');

            let fullContent = '';
            while (true) {
                if (abortController.signal.aborted) break;
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(Boolean);

                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.message?.content) {
                            const delta = parsed.message.content;
                            fullContent += delta;
                            subscriber.next({
                                type: 'text_delta',
                                textDelta: delta
                            });
                        }
                        if (parsed.done) {
                            subscriber.next({
                                type: 'message_end',
                                message: {
                                    id: this.generateId(),
                                    role: MessageRole.ASSISTANT,
                                    content: fullContent,
                                    timestamp: new Date()
                                }
                            });
                            subscriber.complete();
                            return;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }).catch((error) => {
            if ((error as any).name !== 'AbortError') {
                subscriber.error(error);
            }
        });
    }

    protected async sendTestRequest(request: ChatRequest): Promise<ChatResponse> {
        // Try OpenAI-compatible API first, fallback to native
        const originalBaseURL = this.getBaseURL();
        const cleanBaseURL = this.normalizeBaseURL(originalBaseURL);
        
        // Check if user wants OpenAI-compatible API (baseURL contains /v1 in config)
        const useOpenAICompat = originalBaseURL.includes('/v1');
        
        let url: string;
        let requestBody: any;
        
        if (useOpenAICompat) {
            // baseURL should be like http://localhost:11434
            url = `${cleanBaseURL}/v1/chat/completions`;
            requestBody = {
                model: this.config?.model || 'llama3.1',
                messages: this.transformMessages(request.messages),
                max_tokens: 1,
                temperature: 0
            };
        } else {
            // baseURL should be like http://localhost:11434
            url = `${cleanBaseURL}/api/chat`;
            requestBody = {
                model: this.config?.model || 'llama3.1',
                messages: this.transformMessagesToNative(request.messages),
                stream: false,
                options: { temperature: 0, num_predict: 1 }
            };
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config?.model || 'llama3.1',
                messages: this.transformMessages(request.messages),
                max_tokens: request.maxTokens || 1,
                temperature: request.temperature || 0
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
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
     * 验证配置 - 本地服务无需 API Key
     */
    validateConfig(): ValidationResult {
        const warnings: string[] = [];

        if (!this.config?.model) {
            warnings.push('未指定模型，将使用默认模型 llama3.1');
        }

        return {
            valid: true,
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
        const result: any[] = [];

        for (const msg of messages) {
            // 处理工具结果消息
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

            // 处理 Assistant 消息
            if (msg.role === 'assistant') {
                const assistantMsg: any = {
                    role: 'assistant',
                    content: String(msg.content || '')
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

            // 用户消息
            result.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            });
        }

        return result;
    }
}
