import { Injectable, Inject, Optional, Injector } from '@angular/core';
import { Observable, from, throwError, Subject, merge } from 'rxjs';
import { map, catchError, tap, takeUntil, finalize } from 'rxjs/operators';
import {
    ChatMessage, MessageRole, ChatRequest, ChatResponse, CommandRequest, CommandResponse,
    ExplainRequest, ExplainResponse, StreamEvent, ToolCall, ToolResult,
    AgentStreamEvent, AgentLoopConfig, TerminationReason, AgentState, ToolCallRecord,
    TerminationResult
} from '../../types/ai.types';
import { AiProviderManagerService } from './ai-provider-manager.service';
import { ConfigProviderService } from './config-provider.service';
import { TerminalContextService } from '../terminal/terminal-context.service';
import { TerminalToolsService } from '../terminal/terminal-tools.service';
import { TerminalManagerService } from '../terminal/terminal-manager.service';
import { SecurityValidatorService } from '../security/security-validator.service';
import { AgentApprovalService } from './agent-approval.service';
// Use lazy injection to get AiSidebarService to break circular dependency
import type { AiSidebarService } from '../chat/ai-sidebar.service';
import { LoggerService } from './logger.service';
import { BaseAiProvider, ProviderConfigUtils } from '../../types/provider.types';
import { StateGraph, START, END } from '@langchain/langgraph';

// Import all provider services
import { OpenAiProviderService } from '../providers/openai-provider.service';
import { AnthropicProviderService } from '../providers/anthropic-provider.service';
import { MinimaxProviderService } from '../providers/minimax-provider.service';
import { GlmProviderService } from '../providers/glm-provider.service';
import { OpenAiCompatibleProviderService } from '../providers/openai-compatible.service';
import { OllamaProviderService } from '../providers/ollama-provider.service';
import { OllamaCloudProviderService } from '../providers/ollama-cloud-provider.service';
import { VllmProviderService } from '../providers/vllm-provider.service';
import { GroqProviderService } from '../providers/groq-provider.service';
import { TlinkProxyProviderService } from '../providers/tlink-proxy.provider';
import { TlinkAgentProviderService } from '../providers/tlink-agent.provider';

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
    // Provider mapping table
    private providerMapping: { [key: string]: BaseAiProvider } = {};

    constructor(
        private providerManager: AiProviderManagerService,
        private config: ConfigProviderService,
        private terminalContext: TerminalContextService,
        private terminalTools: TerminalToolsService,
        private terminalManager: TerminalManagerService,
        private securityValidator: SecurityValidatorService,
        private agentApproval: AgentApprovalService,
        private injector: Injector,
        private logger: LoggerService,
        // Inject all provider services
        @Optional() private openaiProvider: OpenAiProviderService,
        @Optional() private anthropicProvider: AnthropicProviderService,
        @Optional() private minimaxProvider: MinimaxProviderService,
        @Optional() private glmProvider: GlmProviderService,
        @Optional() private openaiCompatibleProvider: OpenAiCompatibleProviderService,
        @Optional() private ollamaProvider: OllamaProviderService,
        @Optional() private ollamaCloudProvider: OllamaCloudProviderService,
        @Optional() private vllmProvider: VllmProviderService,
        @Optional() private groqProvider: GroqProviderService,
        @Optional() private tlinkProxyProvider?: TlinkProxyProviderService,
        @Optional() private tlinkAgentProvider?: TlinkAgentProviderService
    ) {
        // Build provider mapping table
        this.buildProviderMapping();
    }

    /**
     * Build provider mapping table
     */
    private buildProviderMapping(): void {
        if (this.openaiProvider) {
            this.providerMapping['openai'] = this.openaiProvider;
        }
        if (this.anthropicProvider) {
            this.providerMapping['anthropic'] = this.anthropicProvider;
        }
        if (this.minimaxProvider) {
            this.providerMapping['minimax'] = this.minimaxProvider;
        }
        if (this.glmProvider) {
            this.providerMapping['glm'] = this.glmProvider;
        }
        if (this.openaiCompatibleProvider) {
            this.providerMapping['openai-compatible'] = this.openaiCompatibleProvider;
        }
        // Prefer dedicated instances; keep legacy alias for proxy
        if (this.tlinkProxyProvider) {
            this.providerMapping['tlink-agentic'] = this.tlinkProxyProvider;
            this.providerMapping['tlink-proxy'] = this.tlinkProxyProvider; // legacy alias
        } else if (this.openaiCompatibleProvider) {
            // Fallback: still allow openai-compatible to serve, but mapping will be removed once dedicated provider is present
            this.providerMapping['tlink-agentic'] = this.openaiCompatibleProvider;
            this.providerMapping['tlink-proxy'] = this.openaiCompatibleProvider;
        }
        if (this.tlinkAgentProvider) {
            this.providerMapping['tlink-agent'] = this.tlinkAgentProvider;
        } else if (this.openaiCompatibleProvider) {
            this.providerMapping['tlink-agent'] = this.openaiCompatibleProvider;
        }
        if (this.ollamaProvider) {
            this.providerMapping['ollama'] = this.ollamaProvider;
        }
        if (this.ollamaCloudProvider) {
            this.providerMapping['ollama-cloud'] = this.ollamaCloudProvider;
        }
        if (this.vllmProvider) {
            this.providerMapping['vllm'] = this.vllmProvider;
        }
        if (this.groqProvider) {
            this.providerMapping['groq'] = this.groqProvider;
        }
    }

    /**
     * Initialize AI assistant
     */
    initialize(): void {
        this.logger.info('Initializing AI Assistant...');

        // Check if enabled
        if (!this.config.isEnabled()) {
            this.logger.info('AI Assistant is disabled in configuration');
            return;
        }

        // Get default provider BEFORE registering (to prevent auto-selection)
        // Normalize legacy default provider id
        const defaultProviderRaw = this.config.getDefaultProvider();
        const defaultProvider = (defaultProviderRaw === 'tlink-proxy') ? 'tlink-agentic' : defaultProviderRaw;
        this.logger.info('Default provider from config', { defaultProvider });

        // Register and configure all providers (don't auto-set first provider as active)
        this.registerAllProviders();

        // Set default provider
        if (defaultProvider && this.providerManager.hasProvider(defaultProvider)) {
            const providerConfig = this.config.getProviderConfig(defaultProvider);
            // Only set as active if provider is enabled
            if (providerConfig?.enabled !== false) {
                const success = this.providerManager.setActiveProvider(defaultProvider);
                if (success) {
                    this.logger.info(`Active provider set to: ${defaultProvider}`);
                } else {
                    this.logger.warn(`Failed to set active provider to: ${defaultProvider}`);
                }
            } else {
                this.logger.warn(`Default provider ${defaultProvider} is disabled, finding alternative`);
                // Fall through to find enabled provider
            }
        }
        
        // If no valid default provider, try to set first enabled provider
        if (!this.providerManager.getActiveProvider()) {
            this.logger.info('No active provider set, finding first enabled provider...');
            const allConfigs = this.config.getAllProviderConfigs();
            for (const [name, providerConfig] of Object.entries(allConfigs)) {
                // Check if provider is enabled and has required config
                const isEnabled = providerConfig?.enabled !== false;
                const hasConfig = providerConfig?.apiKey || ['ollama', 'vllm'].includes(name);
                
                if (isEnabled && hasConfig && this.providerManager.hasProvider(name)) {
                    const success = this.providerManager.setActiveProvider(name);
                    if (success) {
                        this.config.setDefaultProvider(name);
                        this.logger.info(`Auto-selected enabled provider: ${name}`);
                        break;
                    }
                }
            }
        }

        // Log final active provider
        const finalActive = this.providerManager.getActiveProvider();
        this.logger.info('AI Assistant initialized successfully', {
            activeProvider: finalActive?.name || 'none'
        });

        // Listen to config changes and update provider configs
        this.config.onConfigChange().subscribe((change) => {
            // If provider config changed, update the provider
            if (change.key?.startsWith('providers.')) {
                const providerName = change.key.replace('providers.', '');
                const provider = this.providerMapping[providerName];
                if (provider && change.value) {
                    let filledConfig = change.value;
                    try {
                        filledConfig = ProviderConfigUtils.fillDefaults({ ...change.value, name: providerName }, providerName);
                    } catch {
                        // Fallback to raw config if provider is unknown
                    }
                    // Update provider config
                    provider.configure({
                        ...filledConfig,
                        enabled: filledConfig.enabled !== false
                    });
                    this.logger.debug('Provider config updated', { 
                        provider: providerName,
                        model: filledConfig.model 
                    });
                }
            }
        });
    }

    /**
     * Register and configure all providers
     */
    private registerAllProviders(): void {
        this.logger.info('Registering AI providers...');

        const allConfigs = this.config.getAllProviderConfigs();
        let registeredCount = 0;

        for (const [nameRaw, providerConfig] of Object.entries(allConfigs)) {
            const name = (nameRaw === 'tlink-proxy') ? 'tlink-agentic' : nameRaw;
            const provider = this.providerMapping[name];
            if (provider) {
                try {
                    // Configure provider (this initializes the client)
                    if (providerConfig) {
                        let filledConfig = providerConfig;
                        try {
                            filledConfig = ProviderConfigUtils.fillDefaults({ ...providerConfig, name }, name);
                        } catch {
                            // Fallback to raw config
                        }
                        provider.configure({
                            ...filledConfig,
                            enabled: filledConfig.enabled !== false
                        });
                        this.logger.info(`Provider ${name} configured`, {
                            hasApiKey: !!providerConfig.apiKey,
                            model: providerConfig.model
                        });
                    }

                    // Register to manager (don't auto-set as active - let initialize() handle it)
                    // Special handling for Tlink Agentic: register primary id and legacy alias
                    if (name === 'tlink-agentic') {
                        this.providerManager.registerProvider(provider, false);
                        // Also register legacy alias if the internal map is available
                        const providerManagerInternal = this.providerManager as any;
                        if (providerManagerInternal?.providers) {
                            providerManagerInternal.providers.set('tlink-proxy', provider);
                            providerManagerInternal.providers.set('tlink-agent', provider);
                            this.logger.info(`Provider tlink-agentic registered with legacy alias tlink-proxy`);
                            this.logger.info(`Provider tlink-agentic registered with alias tlink-agent`);
                        }
                    } else if (name === 'tlink-proxy') {
                        // Legacy key in config; register as agentic and alias old id
                        this.providerManager.registerProvider(provider, false);
                        const providerManagerInternal = this.providerManager as any;
                        if (providerManagerInternal?.providers) {
                            providerManagerInternal.providers.set('tlink-agentic', provider);
                            providerManagerInternal.providers.set('tlink-proxy', provider);
                        }
                        this.logger.info(`Legacy provider id tlink-proxy registered; aliasing to tlink-agentic`);
                    } else {
                        this.providerManager.registerProvider(provider, false);
                    }
                    registeredCount++;
                    this.logger.info(`Provider registered: ${name}`);
                } catch (error) {
                    this.logger.error(`Failed to register provider: ${name}`, error);
                }
            } else {
                this.logger.warn(`Provider not found in mapping: ${name}`);
            }
        }

        this.logger.info(`Total providers registered: ${registeredCount}`);
    }

    /**
     * Refresh provider configuration from config service
     */
    private refreshProviderConfig(providerName: string): void {
        const provider = this.providerMapping[providerName];
        if (provider) {
            const providerConfig = this.config.getProviderConfig(providerName);
            if (providerConfig) {
                provider.configure({
                    ...providerConfig,
                    enabled: providerConfig.enabled !== false
                });
                this.logger.debug('Provider config refreshed', { 
                    provider: providerName,
                    model: providerConfig.model 
                });
            }
        }
    }

    /**
     * Public refresh hook for settings UI to apply config changes immediately.
     */
    refreshProvider(providerName: string): void {
        this.refreshProviderConfig(providerName);
    }

    /**
     * 聊天功能
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        // Pull latest settings (important when settings are saved from another window/process)
        this.config.reloadConfigFromStorage();
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            this.logger.error('No active AI provider available', {
                activeProviderName: this.providerManager.getActiveProviderName(),
                allProviders: this.providerManager.getAllProviders().map(p => p.name)
            });
            throw new Error('No active AI provider available');
        }

        // Ensure provider config is up-to-date before making request
        this.refreshProviderConfig(activeProvider.name);
        const validation = activeProvider.validateConfig();
        if (!validation.valid) {
            const errorText = validation.errors?.join('; ') || 'Provider configuration is invalid';
            this.logger.warn('Provider validation failed', { provider: activeProvider.name, errors: validation.errors });
            throw new Error(errorText);
        }

        this.logger.info('Processing chat request', { 
            provider: activeProvider.name,
            providerDisplayName: activeProvider.displayName
        });

        try {
            // 检查提供商能力
            if (!activeProvider.supportsCapability('chat' as any)) {
                throw new Error(`Provider ${activeProvider.name} does not support chat capability`);
            }

            // 如果启用工具调用，添加工具定义
            if (request.enableTools !== false) {
                request.tools = this.terminalTools.getToolDefinitions();
            }

            let response = await activeProvider.chat(request);

            // Handle tool calls (return value includes tool call statistics)
            const { finalResponse, totalToolCallsExecuted } = await this.handleToolCallsWithStats(
                request, response, activeProvider
            );
            response = finalResponse;

            // 使用累计的工具调用次数进行幻觉检测
            const hallucinationDetected = this.detectHallucination({
                text: response.message.content,
                toolCallCount: totalToolCallsExecuted
            });

            if (hallucinationDetected) {
                // 附加警告消息，提醒用户
                response.message.content += '\n\n⚠️ **检测到可能的幻觉**：AI声称执行了操作但未实际调用工具。\n实际执行的命令可能为空。请重新描述您的需求。';
            }

            this.logger.info('Chat request completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Chat request failed', error);
            throw error;
        }
    }

    /**
     * Streaming chat functionality
     */
    chatStream(request: ChatRequest): Observable<any> {
        const activeProvider = this.providerManager.getActiveProvider() as any;
        if (!activeProvider) {
            return throwError(() => new Error('No active AI provider available'));
        }

        // Ensure provider config is up-to-date before making request
        this.refreshProviderConfig(activeProvider.name);

        // Check if provider supports streaming
        if (!activeProvider.supportsCapability('streaming' as any)) {
            this.logger.warn(`Provider ${activeProvider.name} does not support streaming, falling back to non-streaming`);
            return from(this.chat(request));
        }

        // Add tool definitions
        if (request.enableTools !== false) {
            request.tools = this.terminalTools.getToolDefinitions();
        }

        // Use Subject to send additional tool result events
        const toolResultSubject = new Subject<StreamEvent>();

        // Call streaming method
        return merge(
            activeProvider.chatStream(request).pipe(
                tap(async (event: StreamEvent) => {
                    // Execute when tool call completes
                    if (event.type === 'tool_use_end' && event.toolCall) {
                        await this.executeToolAndEmit(event.toolCall, toolResultSubject);
                    }
                }),
                catchError(error => {
                    this.logger.error('Stream error', error);
                    toolResultSubject.error(error);
                    return throwError(() => error);
                }),
                // When main stream completes, also complete toolResultSubject
                finalize(() => {
                    this.logger.info('Main stream finalized, completing toolResultSubject');
                    toolResultSubject.complete();
                })
            ),
            toolResultSubject.asObservable()
        );
    }

    /**
     * Execute tool call and emit result event
     */
    private async executeToolAndEmit(
        toolCall: { id: string; name: string; input: any },
        resultSubject: Subject<StreamEvent>
    ): Promise<void> {
        try {
            const startTime = Date.now();
            const result = await this.terminalTools.executeToolCall({
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input
            });
            const duration = Date.now() - startTime;

            // Send tool result event
            resultSubject.next({
                type: 'tool_result',
                result: {
                    tool_use_id: result.tool_use_id,
                    content: result.content,
                    is_error: result.is_error
                }
            });

            this.logger.info('Tool executed in stream', {
                name: toolCall.name,
                duration,
                success: !result.is_error,
                resultPreview: result.content.substring(0, 100)
            });
        } catch (error) {
            // Send tool error event
            resultSubject.next({
                type: 'tool_error',
                error: error instanceof Error ? error.message : String(error)
            });
            this.logger.error('Tool execution failed in stream', { name: toolCall.name, error });
        }
    }

    /**
     * Handle tool calls
     * @param maxDepth Maximum recursion depth to avoid infinite loops
     */
    private async handleToolCalls(
        originalRequest: ChatRequest,
        response: ChatResponse,
        provider: BaseAiProvider,
        depth: number = 0,
        maxDepth: number = 10
    ): Promise<ChatResponse> {
        // 检查响应中是否有工具调用
        const toolCalls = (response as any).toolCalls as ToolCall[] | undefined;

        if (!toolCalls || toolCalls.length === 0) {
            return response;
        }

        // 检查递归深度
        if (depth >= maxDepth) {
            this.logger.warn('Max tool call depth reached', { depth, maxDepth });
            return response;
        }

        this.logger.info('Tool calls detected', { count: toolCalls.length, depth });

        // 执行所有工具调用
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
            this.logger.info('Executing tool in handleToolCalls', { name: toolCall.name, depth });
            const result = await this.terminalTools.executeToolCall(toolCall);
            toolResults.push(result);
        }

        // 构建包含工具结果的新请求
        const toolResultsMessage: ChatMessage = {
            id: `tool_result_${Date.now()}`,
            role: MessageRole.USER,
            content: toolResults.map(r =>
                `工具 ${r.tool_use_id} 结果:\n${r.content}`
            ).join('\n\n'),
            timestamp: new Date(),
            metadata: { toolResults }
        };

        // 继续对话 - 仍然允许工具调用但递归处理
        const followUpRequest: ChatRequest = {
            ...originalRequest,
            messages: [
                ...originalRequest.messages,
                response.message,
                toolResultsMessage
            ],
            tools: this.terminalTools.getToolDefinitions()
        };

        // 发送后续请求
        const followUpResponse = await provider.chat(followUpRequest);

        // ===== 关键修复：如果 AI 回复太短，直接附加工具结果 =====
        const minResponseLength = 50; // 如果回复少于50字符，认为AI没有正确展示结果
        const toolResultsText = toolResults.map(r => r.content).join('\n\n');

        if (followUpResponse.message.content.length < minResponseLength && toolResultsText.length > 0) {
            this.logger.info('AI response too short, appending tool results directly', {
                responseLength: followUpResponse.message.content.length,
                toolResultsLength: toolResultsText.length
            });

            // 查找包含终端输出的工具结果
            const terminalOutput = toolResults.find(r =>
                r.content.includes('=== 终端输出 ===') ||
                r.content.includes('✅ 命令已执行')
            );

            if (terminalOutput) {
                followUpResponse.message.content =
                    followUpResponse.message.content + '\n\n' + terminalOutput.content;
            } else {
                // 附加所有工具结果
                followUpResponse.message.content =
                    followUpResponse.message.content + '\n\n' + toolResultsText;
            }
        }

        // 递归处理后续响应中的工具调用
        return this.handleToolCalls(followUpRequest, followUpResponse, provider, depth + 1, maxDepth);
    }

    /**
     * Handle tool calls (with statistics)
     * Returns final response and cumulative tool call count
     */
    private async handleToolCallsWithStats(
        originalRequest: ChatRequest,
        response: ChatResponse,
        provider: BaseAiProvider,
        depth: number = 0,
        maxDepth: number = 10,
        accumulatedToolCalls: number = 0
    ): Promise<{ finalResponse: ChatResponse; totalToolCallsExecuted: number }> {
        // 检查响应中是否有工具调用
        const toolCalls = (response as any).toolCalls as ToolCall[] | undefined;

        if (!toolCalls || toolCalls.length === 0) {
            return {
                finalResponse: response,
                totalToolCallsExecuted: accumulatedToolCalls
            };
        }

        // 检查递归深度
        if (depth >= maxDepth) {
            this.logger.warn('Max tool call depth reached', { depth, maxDepth });
            return {
                finalResponse: response,
                totalToolCallsExecuted: accumulatedToolCalls
            };
        }

        // 累计工具调用次数
        const newTotal = accumulatedToolCalls + toolCalls.length;
        this.logger.info('Tool calls executed', {
            thisRound: toolCalls.length,
            total: newTotal,
            depth
        });

        // 执行所有工具调用
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
            this.logger.info('Executing tool in handleToolCalls', { name: toolCall.name, depth });
            const result = await this.terminalTools.executeToolCall(toolCall);
            toolResults.push(result);
        }

        // 构建包含工具结果的新请求
        const toolResultsMessage: ChatMessage = {
            id: `tool_result_${Date.now()}`,
            role: MessageRole.USER,
            content: toolResults.map(r =>
                `工具 ${r.tool_use_id} 结果:\n${r.content}`
            ).join('\n\n'),
            timestamp: new Date(),
            metadata: { toolResults }
        };

        // 继续对话 - 仍然允许工具调用但递归处理
        const followUpRequest: ChatRequest = {
            ...originalRequest,
            messages: [
                ...originalRequest.messages,
                response.message,
                toolResultsMessage
            ],
            tools: this.terminalTools.getToolDefinitions()
        };

        // 发送后续请求
        const followUpResponse = await provider.chat(followUpRequest);

        // 如果 AI 回复太短，直接附加工具结果
        const minResponseLength = 50;
        const toolResultsText = toolResults.map(r => r.content).join('\n\n');

        if (followUpResponse.message.content.length < minResponseLength && toolResultsText.length > 0) {
            this.logger.info('AI response too short, appending tool results directly', {
                responseLength: followUpResponse.message.content.length,
                toolResultsLength: toolResultsText.length
            });

            const terminalOutput = toolResults.find(r =>
                r.content.includes('=== 终端输出 ===') ||
                r.content.includes('✅ 命令已执行')
            );

            if (terminalOutput) {
                followUpResponse.message.content =
                    followUpResponse.message.content + '\n\n' + terminalOutput.content;
            } else {
                followUpResponse.message.content =
                    followUpResponse.message.content + '\n\n' + toolResultsText;
            }
        }

        // 递归处理后续响应中的工具调用，传递累计值
        return this.handleToolCallsWithStats(
            followUpRequest,
            followUpResponse,
            provider,
            depth + 1,
            maxDepth,
            newTotal
        );
    }

    /**
     * 生成命令
     */
    async generateCommand(request: CommandRequest): Promise<CommandResponse> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing command generation request', { provider: activeProvider.name });

        try {
            // 检查提供商能力
            if (!activeProvider.supportsCapability('command_generation' as any)) {
                throw new Error(`Provider ${activeProvider.name} does not support command generation capability`);
            }

            const response = await activeProvider.generateCommand(request);
            this.logger.info('Command generation completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Command generation failed', error);
            throw error;
        }
    }

    /**
     * 解释命令
     */
    async explainCommand(request: ExplainRequest): Promise<ExplainResponse> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing command explanation request', { provider: activeProvider.name });

        try {
            // 检查提供商能力
            if (!activeProvider.supportsCapability('command_explanation' as any)) {
                throw new Error(`Provider ${activeProvider.name} does not support command explanation capability`);
            }

            const response = await activeProvider.explainCommand(request);
            this.logger.info('Command explanation completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Command explanation failed', error);
            throw error;
        }
    }

    /**
     * 分析结果
     */
    async analyzeResult(request: any): Promise<any> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            throw new Error('No active AI provider available');
        }

        this.logger.info('Processing result analysis request', { provider: activeProvider.name });

        try {
            const response = await activeProvider.analyzeResult(request);
            this.logger.info('Result analysis completed successfully');
            return response;

        } catch (error) {
            this.logger.error('Result analysis failed', error);
            throw error;
        }
    }

    /**
     * 从选择生成命令
     */
    async generateCommandFromSelection(): Promise<CommandResponse | null> {
        try {
            // 从当前终端获取选中文本
            const selection = await this.terminalManager.getSelection();
            if (!selection) {
                this.logger.warn('No text selected in terminal');
                return null;
            }
            const context = this.terminalContext.getCurrentContext();

            const request: CommandRequest = {
                naturalLanguage: selection || '帮我执行上一个命令',
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform,
                    shell: context?.session.shell,
                    environment: context?.session.environment
                }
            };

            return this.generateCommand(request);
        } catch (error) {
            this.logger.error('Failed to generate command from selection', error);
            return null;
        }
    }

    /**
     * 解释当前选择
     */
    async explainCommandFromSelection(): Promise<ExplainResponse | null> {
        try {
            // 从当前终端获取选中文本
            const selection = await this.terminalManager.getSelection();
            if (!selection) {
                this.logger.warn('No text selected in terminal');
                return null;
            }

            const context = this.terminalContext.getCurrentContext();
            const request: ExplainRequest = {
                command: selection,
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform
                }
            };

            return this.explainCommand(request);
        } catch (error) {
            this.logger.error('Failed to explain command from selection', error);
            return null;
        }
    }

    /**
     * 打开聊天界面
     * 使用延迟注入获取 AiSidebarService 以避免循环依赖
     */
    openChatInterface(): void {
        this.logger.info('Opening chat interface');
        // 延迟获取 AiSidebarService 以打破循环依赖
        const { AiSidebarService } = require('../chat/ai-sidebar.service');
        const sidebarService = this.injector.get(AiSidebarService) as AiSidebarService;
        sidebarService.show();
    }

    /**
     * Open AI Assistant in a dedicated window when available.
     * Falls back to the in-app sidebar for non-Electron environments.
     */
    openAssistantWindow(): void {
        try {
            const electron = (window as any).require?.('electron')
                ?? (window as any).nodeRequire?.('electron')
                ?? (typeof require !== 'undefined' ? require('electron') : null);
            const ipcRenderer = electron?.ipcRenderer;
            if (ipcRenderer) {
                ipcRenderer.send('app:open-ai-assistant-window');
                return;
            }
        } catch (error) {
            this.logger.warn('Failed to open AI Assistant window, falling back to sidebar', error);
        }
        this.openChatInterface();
    }

    /**
     * 获取提供商状态
     */
    getProviderStatus(): any {
        const activeProvider = this.providerManager.getActiveProvider();
        const allProviders = this.providerManager.getAllProviderInfo();

        return {
            active: activeProvider?.getInfo(),
            all: allProviders,
            count: allProviders.length
        };
    }

    /**
     * 切换提供商
     */
    switchProvider(providerName: string): boolean {
        // If switching to empty, clear active provider
        if (!providerName) {
            this.providerManager.setActiveProvider('');
            this.config.setDefaultProvider('');
            this.logger.info('Provider cleared');
            return true;
        }

        // Ensure we have the latest config before switching
        this.config.reloadConfigFromStorage();
        
        // Check if provider is enabled before switching
        const providerConfig = this.config.getProviderConfig(providerName);
        const providerInstance = this.providerMapping[providerName];
        if (providerConfig?.enabled === false) {
            this.logger.warn(`Cannot switch to disabled provider: ${providerName}`);
            
            // Find another enabled provider
            const allConfigs = this.config.getAllProviderConfigs();
            const enabledProviders = Object.keys(allConfigs).filter(key => {
                const config = allConfigs[key];
                return config && config.enabled !== false && key !== providerName;
            });
            
            if (enabledProviders.length > 0) {
                const fallbackProvider = enabledProviders[0];
                this.logger.info(`Switching to enabled provider instead: ${fallbackProvider}`);
                return this.switchProvider(fallbackProvider);
            } else {
                this.logger.error('No enabled providers available');
                return false;
            }
        }
        
        // Guard: Groq requires an API key before we allow switching
        if (providerName === 'groq' || providerName === 'ollama-cloud') {
            const apiKey = (providerConfig as any)?.apiKey
                || providerInstance?.getConfig?.()?.apiKey;
            if (!apiKey || String(apiKey).trim() === '') {
                this.logger.error(`Cannot switch to ${providerName}: API key is missing`);
                return false;
            }
        }

        // Log available providers for debugging
        const allProviderNames = this.providerManager.getAllProviders().map(p => p.name);
        this.logger.debug('Available providers in manager', { providers: allProviderNames, attempting: providerName });
        
        const success = this.providerManager.setActiveProvider(providerName);
        if (success) {
            this.config.setDefaultProvider(providerName);
            this.logger.info('Provider switched successfully', { provider: providerName });
        } else {
            this.logger.error('Failed to switch provider', { 
                provider: providerName,
                availableProviders: allProviderNames,
                providerConfig: providerConfig?.name || 'none'
            });
        }
        return success;
    }

    /**
     * 获取下一个提供商
     */
    switchToNextProvider(): boolean {
        return this.providerManager.switchToNextProvider();
    }

    /**
     * 获取上一个提供商
     */
    switchToPreviousProvider(): boolean {
        return this.providerManager.switchToPreviousProvider();
    }

    /**
     * 健康检查
     */
    async healthCheck(): Promise<{ provider: string; status: string; latency?: number }[]> {
        this.logger.info('Performing health check on all providers');
        return this.providerManager.checkAllProvidersHealth();
    }

    /**
     * 验证配置
     */
    async validateConfig(): Promise<{ name: string; valid: boolean; errors: string[] }[]> {
        this.logger.info('Validating all provider configurations');
        return this.providerManager.validateAllProviders();
    }

    /**
     * 获取当前上下文感知提示
     */
    getContextAwarePrompt(basePrompt: string): string {
        const context = this.terminalContext.getCurrentContext();
        const error = this.terminalContext.getLastError();

        let enhancedPrompt = basePrompt;

        if (context) {
            enhancedPrompt += `\n\n当前环境：\n`;
            enhancedPrompt += `- 目录：${context.session.cwd}\n`;
            enhancedPrompt += `- Shell：${context.session.shell}\n`;
            enhancedPrompt += `- 系统：${context.systemInfo.platform}\n`;

            if (context.recentCommands.length > 0) {
                enhancedPrompt += `- 最近命令：${context.recentCommands.slice(0, 3).join(' → ')}\n`;
            }

            if (error) {
                enhancedPrompt += `\n当前错误：\n`;
                enhancedPrompt += `- 错误：${error.message}\n`;
                enhancedPrompt += `- 命令：${error.command}\n`;
            }
        }

        return enhancedPrompt;
    }

    /**
     * 获取建议命令
     */
    async getSuggestedCommands(input: string): Promise<string[]> {
        const activeProvider = this.providerManager.getActiveProvider();
        if (!activeProvider) {
            return [];
        }

        try {
            const context = this.terminalContext.getCurrentContext();
            const suggestions: string[] = [];

            // 1. 基于当前目录的智能建议
            if (context?.session.cwd) {
                const dirSuggestions = this.getDirectoryBasedSuggestions(context.session.cwd);
                suggestions.push(...dirSuggestions);
            }

            // 2. 基于最近命令的建议
            if (context?.recentCommands) {
                const historySuggestions = this.getHistoryBasedSuggestions(context.recentCommands, input);
                suggestions.push(...historySuggestions);
            }

            // 3. 基于当前输入的模糊匹配建议
            if (input.length > 0) {
                const inputSuggestions = this.getInputBasedSuggestions(input, suggestions);
                suggestions.push(...inputSuggestions);
            }

            // 去重并限制数量
            const uniqueSuggestions = [...new Set(suggestions)].slice(0, 8);

            return uniqueSuggestions;

        } catch (error) {
            this.logger.error('Failed to get suggested commands', error);
            return [];
        }
    }

    /**
     * 基于当前目录的智能建议
     */
    private getDirectoryBasedSuggestions(cwd: string): string[] {
        const suggestions: string[] = [];

        // Git相关建议
        if (cwd.includes('.git') || this.isGitRepository(cwd)) {
            suggestions.push(
                'git status',
                'git pull',
                'git add .',
                'git commit -m ""',
                'git log --oneline',
                'git checkout -b '
            );
        }

        // Node.js项目建议
        if (this.isNodeProject(cwd)) {
            suggestions.push(
                'npm install',
                'npm run dev',
                'npm run build',
                'npm test',
                'npm run lint',
                'yarn install',
                'pnpm install'
            );
        }

        // Python项目建议
        if (this.isPythonProject(cwd)) {
            suggestions.push(
                'python -m venv venv',
                'pip install -r requirements.txt',
                'python main.py',
                'pytest',
                'python -m pip install --upgrade pip'
            );
        }

        // Docker项目建议
        if (this.hasDockerFiles(cwd)) {
            suggestions.push(
                'docker build -t .',
                'docker-compose up',
                'docker-compose down',
                'docker ps',
                'docker images'
            );
        }

        // Kubernetes项目建议
        if (this.hasK8sFiles(cwd)) {
            suggestions.push(
                'kubectl get pods',
                'kubectl get svc',
                'kubectl apply -f ',
                'kubectl describe pod ',
                'kubectl logs -f '
            );
        }

        return suggestions;
    }

    /**
     * 基于历史的智能建议
     */
    private getHistoryBasedSuggestions(recentCommands: string[], input: string): string[] {
        const suggestions: string[] = [];

        // 提取最近使用过的相关命令
        for (const cmd of recentCommands.slice(0, 10)) {
            // 如果输入与历史命令开头匹配，添加完整命令
            if (cmd.toLowerCase().startsWith(input.toLowerCase()) && cmd !== input) {
                suggestions.push(cmd);
            }

            // 添加相似类别的新命令
            if (input.length > 2 && cmd.toLowerCase().includes(input.toLowerCase())) {
                const baseCmd = cmd.split(' ')[0];
                if (!suggestions.includes(baseCmd)) {
                    suggestions.push(baseCmd);
                }
            }
        }

        return suggestions;
    }

    /**
     * 基于输入的模糊建议
     */
    private getInputBasedSuggestions(input: string, existingSuggestions: string[]): string[] {
        const suggestions: string[] = [];
        const lowerInput = input.toLowerCase();

        // 常用命令模板
        const commandTemplates: { [key: string]: string[] } = {
            'git': [
                'git status',
                'git add .',
                'git commit -m ""',
                'git checkout -b ',
                'git merge ',
                'git rebase ',
                'git stash',
                'git stash pop',
                'git diff',
                'git log --oneline'
            ],
            'npm': [
                'npm install ',
                'npm run ',
                'npm list',
                'npm outdated',
                'npm update',
                'npm run dev',
                'npm run build'
            ],
            'docker': [
                'docker build -t ',
                'docker run -it ',
                'docker-compose up',
                'docker-compose down',
                'docker ps',
                'docker images'
            ],
            'kubectl': [
                'kubectl get ',
                'kubectl describe ',
                'kubectl apply -f ',
                'kubectl delete -f ',
                'kubectl logs '
            ],
            'ls': [
                'ls -la',
                'ls -lh',
                'ls -R'
            ],
            'cd': [
                'cd ..',
                'cd /',
                'cd ~'
            ],
            'grep': [
                'grep -r "" .',
                'grep -n "" .',
                'grep -E "" .'
            ],
            'find': [
                'find . -name ""',
                'find . -type f -name ""'
            ]
        };

        // 查找匹配的命令模板
        for (const [prefix, templates] of Object.entries(commandTemplates)) {
            if (lowerInput.startsWith(prefix) || lowerInput.includes(prefix)) {
                for (const template of templates) {
                    if (!existingSuggestions.includes(template)) {
                        suggestions.push(template);
                    }
                }
            }
        }

        return suggestions;
    }

    /**
     * 检查是否为Git仓库
     */
    private isGitRepository(path: string): boolean {
        return path.includes('.git') ||
            this.hasFile(path, '.git');
    }

    /**
     * 检查是否为Node.js项目
     */
    private isNodeProject(path: string): boolean {
        return this.hasFile(path, 'package.json') ||
            this.hasFile(path, 'node_modules');
    }

    /**
     * 检查是否为Python项目
     */
    private isPythonProject(path: string): boolean {
        return this.hasFile(path, 'requirements.txt') ||
            this.hasFile(path, 'pyproject.toml') ||
            this.hasFile(path, 'setup.py') ||
            this.hasFile(path, 'venv');
    }

    /**
     * 检查是否有Docker文件
     */
    private hasDockerFiles(path: string): boolean {
        return this.hasFile(path, 'Dockerfile') ||
            this.hasFile(path, 'docker-compose.yml') ||
            this.hasFile(path, 'docker-compose.yaml');
    }

    /**
     * 检查是否有Kubernetes文件
     */
    private hasK8sFiles(path: string): boolean {
        return this.hasFile(path, 'k8s') ||
            this.hasFile(path, 'kubernetes') ||
            path.includes('k8s') ||
            path.includes('kubernetes');
    }

    /**
     * 检查文件是否存在（简化版）
     */
    private hasFile(path: string, filename: string): boolean {
        // 这里应该是实际的文件系统检查
        // 由于无法直接访问文件系统，返回false
        // 实际实现应该使用Node.js的fs模块
        return path.includes(filename);
    }

    /**
     * 分析终端错误并提供修复建议
     */
    async getErrorFix(error: any): Promise<CommandResponse | null> {
        try {
            const context = this.terminalContext.getCurrentContext();

            const request: CommandRequest = {
                naturalLanguage: `修复这个错误：${error.message}`,
                context: {
                    currentDirectory: context?.session.cwd,
                    operatingSystem: context?.systemInfo.platform,
                    shell: context?.session.shell,
                    environment: context?.session.environment
                }
            };

            return this.generateCommand(request);
        } catch (err) {
            this.logger.error('Failed to get error fix', err);
            return null;
        }
    }

    /**
     * Detect AI hallucination
     * Triggered when AI claims to have performed an action (e.g., switch terminal, execute command) but did not call the corresponding tool
     */
    private detectHallucination(response: { text: string; toolCallCount: number }): boolean {
        const actionKeywords = [
            '已切换', '已执行', '已完成', '已写入', '已读取',
            '切换成功', '执行成功', '写入成功', '读取成功',
            '现在切换', '现在执行', '已经为您切换', '已经为您执行',
            '我将切换', '我会切换', '已经切换到', '已经执行了',
            '终端已切换', '命令已执行', '操作已完成'
        ];

        const hasActionClaim = actionKeywords.some(keyword => response.text.includes(keyword));

        if (hasActionClaim && response.toolCallCount === 0) {
            this.logger.warn('AI Hallucination detected', {
                textPreview: response.text.substring(0, 100),
                toolCallCount: response.toolCallCount
            });
            return true;
        }

        return false;
    }

    // ============================================================================
    // Agent 循环相关方法
    // ============================================================================

    /**
     * 完整的 Agent 对话循环
     * 自动处理：工具调用 → 执行工具 → 工具结果发回 AI → 多轮循环
     * 包含智能终止检测
     */
    chatStreamWithAgentLoop(
        request: ChatRequest,
        config: AgentLoopConfig = {}
    ): Observable<AgentStreamEvent> {
        const engine = (this.config.get<string>('agentEngine', 'langgraph') || 'langgraph').toLowerCase();
        if (engine === 'legacy') {
            return this.chatStreamWithLegacyAgentLoop(request, config);
        }
        return this.chatStreamWithLangGraphLoop(request, config);
    }

    /**
     * Legacy Agent loop (pre-LangGraph)
     */
    private chatStreamWithLegacyAgentLoop(
        request: ChatRequest,
        config: AgentLoopConfig = {}
    ): Observable<AgentStreamEvent> {
        // 🔥 入口日志 - 确认方法被调用
        this.logger.info('🔥 chatStreamWithLegacyAgentLoop CALLED', {
            messagesCount: request.messages?.length,
            maxRounds: config.maxRounds,
            timeoutMs: config.timeoutMs
        });

        // 配置参数
        // 降低默认轮次，避免长时间循环
        const maxRounds = config.maxRounds || 6;
        const timeoutMs = config.timeoutMs || 120000;  // 默认 2 分钟
        const repeatThreshold = config.repeatThreshold || 5;  // 重复调用阈值（提高到 5，避免正常多次调用被误判）
        const failureThreshold = config.failureThreshold || 3;  // 连续失败阈值（提高到 3，但添加无进展检测）

        const callbacks = {
            onRoundStart: config.onRoundStart,
            onRoundEnd: config.onRoundEnd,
            onAgentComplete: config.onAgentComplete
        };

        // Agent 状态追踪
        const agentState: AgentState = {
            currentRound: 0,
            startTime: Date.now(),
            toolCallHistory: [],
            lastAiResponse: '',
            isActive: true
        };

        return new Observable<AgentStreamEvent>((subscriber) => {
            // 消息历史副本（用于多轮对话）
            const conversationMessages: ChatMessage[] = [...(request.messages || [])];

            // === 新增：添加 Agent 执行规则系统提示 ===
            const taskContextMessage: ChatMessage = {
                id: this.generateId(),
                role: MessageRole.SYSTEM,
                content: this.buildAgentSystemPrompt(),
                timestamp: new Date()
            };

            // 将任务强调消息插入到消息列表最前面
            conversationMessages.unshift(taskContextMessage);

            // 递归执行单轮对话
            const runSingleRound = async (): Promise<void> => {
                if (!agentState.isActive) return;

                agentState.currentRound++;

                // 发送 round_start 事件
                subscriber.next({ type: 'round_start', round: agentState.currentRound });
                callbacks.onRoundStart?.(agentState.currentRound);
                this.logger.info(`Agent round ${agentState.currentRound} started`);

                // 本轮收集的工具调用
                const pendingToolCalls: ToolCall[] = [];
                let roundTextContent = '';

                return new Promise<void>((resolve, reject) => {
                    // 构建当前轮次的请求
                    const roundRequest: ChatRequest = {
                        ...request,
                        messages: conversationMessages,
                        enableTools: true
                    };

                    // 调用流式 API
                    const activeProvider = this.providerManager.getActiveProvider() as any;
                    if (!activeProvider) {
                        const error = new Error('No active AI provider available');
                        subscriber.next({ type: 'error', error: error.message });
                        reject(error);
                        return;
                    }

                    // 添加工具定义
                    roundRequest.tools = this.terminalTools.getToolDefinitions();

                    // 直接订阅 provider 的流（不使用 merge，否则需要所有源都 complete）
                    activeProvider.chatStream(roundRequest).subscribe({
                        next: (event: any) => {
                            switch (event.type) {
                                case 'text_delta':
                                    // 转发文本增量
                                    if (event.textDelta) {
                                        roundTextContent += event.textDelta;
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta: event.textDelta
                                        });
                                    }
                                    break;

                                case 'tool_use_start':
                                    // 转发工具开始
                                    subscriber.next({
                                        type: 'tool_use_start',
                                        toolCall: event.toolCall
                                    });
                                    break;

                                case 'tool_use_end':
                                    // 收集工具调用
                                    if (event.toolCall) {
                                        pendingToolCalls.push(event.toolCall as ToolCall);
                                        subscriber.next({
                                            type: 'tool_use_end',
                                            toolCall: event.toolCall
                                        });
                                    }
                                    break;

                                case 'error':
                                    subscriber.next({ type: 'error', error: event.error });
                                    break;
                            }
                        },
                        error: (error) => {
                            subscriber.next({
                                type: 'error',
                                error: error instanceof Error ? error.message : String(error)
                            });
                            reject(error);
                        },
                        complete: () => {
                            // 使用 IIFE 确保异步操作被正确执行
                            (async () => {
                                // 发送 round_end 事件
                                subscriber.next({ type: 'round_end', round: agentState.currentRound });
                                callbacks.onRoundEnd?.(agentState.currentRound);
                                this.logger.debug(`Round ${agentState.currentRound} ended, messages in conversation: ${conversationMessages.length}`);

                                // 将本轮 AI 回复添加到消息历史
                                // 关键修复：即使没有文本内容，只要有工具调用也必须添加 assistant 消息
                                // 否则 tool_use 块会丢失，导致下一轮请求时 tool_result 找不到对应的 tool_use
                                if (roundTextContent || pendingToolCalls.length > 0) {
                                    conversationMessages.push({
                                        id: this.generateId(),
                                        role: MessageRole.ASSISTANT,
                                        content: roundTextContent || '', // 即使为空也要添加
                                        timestamp: new Date(),
                                        // 保留工具调用记录，供下一轮 transformMessages 构建 Anthropic tool_use 格式
                                        toolCalls: pendingToolCalls.map(tc => ({
                                            id: tc.id,
                                            name: tc.name,
                                            input: tc.input
                                        }))
                                    });
                                    // 更新 Agent 状态的 lastAiResponse
                                    agentState.lastAiResponse = roundTextContent || '';
                                }

                                // 获取用户消息（最后一个用户消息）
                                const lastUserMessage = conversationMessages
                                    .filter(m => m.role === MessageRole.USER)
                                    .pop()?.content || '';

                                // 执行智能终止检测 (AI 响应后)
                                const termination = this.checkTermination(
                                    agentState,
                                    pendingToolCalls,
                                    [],
                                    { maxRounds, timeoutMs, repeatThreshold, failureThreshold },
                                    'after_ai_response',
                                    lastUserMessage
                                );

                                // 【新增】检测 AI 输出 <invoke> 文本但没有实际工具调用的情况
                                // 这通常是 AI 模仿了 XML 格式而不是真正调用工具
                                const hasInvokeText = roundTextContent && (
                                    roundTextContent.includes('<invoke') ||
                                    roundTextContent.includes('<parameter') ||
                                    roundTextContent.includes('</invoke>')
                                );
                                const noActualToolCalls = pendingToolCalls.length === 0;

                                if (hasInvokeText && noActualToolCalls && agentState.currentRound < maxRounds) {
                                    this.logger.warn('Detected <invoke> text without actual tool calls, forcing retry', {
                                        round: agentState.currentRound,
                                        textPreview: roundTextContent.slice(0, 200)
                                    });

                                    // 添加纠正提示到消息历史
                                    conversationMessages.push({
                                        id: this.generateId(),
                                        role: MessageRole.USER,
                                        content: `【系统提示】你输出了 <invoke> 格式的文本，但这不是正确的工具调用方式。请直接调用工具，不要用文本描述工具调用。系统会自动处理你的工具调用请求。`,
                                        timestamp: new Date()
                                    });

                                    // 发送重试事件
                                    subscriber.next({
                                        type: 'text_delta',
                                        textDelta: '\n\n[系统：检测到格式错误，正在重试...]\n'
                                    });

                                    // 强制重试
                                    try {
                                        await runSingleRound();
                                    } catch (retryError) {
                                        this.logger.error('Retry round error', retryError);
                                    }
                                    return;
                                }

                                const clarificationRequested = this.isClarificationResponse(roundTextContent || '');
                                if ((pendingToolCalls.length === 0 && clarificationRequested) || termination.shouldTerminate) {
                                    this.logger.info('Agent terminated by smart detector', { reason: termination.reason });
                                    subscriber.next({
                                        type: 'agent_complete',
                                        reason: termination.reason,
                                        totalRounds: agentState.currentRound,
                                        terminationMessage: termination.message
                                    });
                                    callbacks.onAgentComplete?.(termination.reason, agentState.currentRound);
                                    subscriber.complete();
                                    resolve();
                                    return;
                                }

                                // 检查是否有待执行的工具
                                if (pendingToolCalls.length > 0) {
                                    // 【新增】在工具执行前检查：如果是简单问候且工具调用无效，直接终止
                                    const validToolNames = this.terminalTools.getToolDefinitions().map(t => t.name);
                                    const hasInvalidToolCall = pendingToolCalls.some(tc => !validToolNames.includes(tc.name));
                                    
                                    if (hasInvalidToolCall) {
                                        const lastUserMessage = conversationMessages
                                            .filter(m => m.role === MessageRole.USER)
                                            .pop()?.content || '';
                                        
                                        // 如果是简单问候且工具调用无效，认为是简单对话
                                        if (this.isSimpleConversation(roundTextContent || '', lastUserMessage)) {
                                            this.logger.info('Simple conversation with invalid tool call, terminating early', {
                                                userMessage: lastUserMessage.substring(0, 50),
                                                invalidTools: pendingToolCalls.filter(tc => !validToolNames.includes(tc.name)).map(tc => tc.name)
                                            });
                                            subscriber.next({
                                                type: 'agent_complete',
                                                reason: 'no_tools',
                                                totalRounds: agentState.currentRound,
                                                terminationMessage: 'Simple conversation, invalid tool call ignored'
                                            });
                                            callbacks.onAgentComplete?.('no_tools', agentState.currentRound);
                                            subscriber.complete();
                                            resolve();
                                            return;
                                        }
                                    }

                                    this.logger.info(`Round ${agentState.currentRound}: ${pendingToolCalls.length} tools to execute`);

                                    // 执行所有工具
                                    const toolResults = await this.executeToolsSequentially(
                                        pendingToolCalls,
                                        subscriber,
                                        agentState
                                    );

                                    // 将工具结果添加到消息历史
                                    const toolResultMessage = this.buildToolResultMessage(toolResults);
                                    conversationMessages.push(toolResultMessage);

                                    this.logger.info('Tool results added to conversation, starting next round', {
                                        round: agentState.currentRound,
                                        totalMessages: conversationMessages.length
                                    });

                                    // 执行工具后的终止检测 (不检查 no_tools)
                                    const postToolTermination = this.checkTermination(
                                        agentState,
                                        [],
                                        toolResults,
                                        { maxRounds, timeoutMs, repeatThreshold, failureThreshold },
                                        'after_tool_execution'
                                    );

                                    if (postToolTermination.shouldTerminate) {
                                        this.logger.info('Agent terminated after tool execution', { reason: postToolTermination.reason });
                                        subscriber.next({
                                            type: 'agent_complete',
                                            reason: postToolTermination.reason,
                                            totalRounds: agentState.currentRound,
                                            terminationMessage: postToolTermination.message
                                        });
                                        callbacks.onAgentComplete?.(postToolTermination.reason, agentState.currentRound);
                                        subscriber.complete();
                                        resolve();
                                        return;
                                    }

                                    // 继续下一轮（添加递归安全保护）
                                    try {
                                        await runSingleRound();
                                    } catch (recursionError) {
                                        this.logger.error('Recursive round error', recursionError);
                                        subscriber.next({
                                            type: 'error',
                                            error: `执行循环中断: ${recursionError instanceof Error ? recursionError.message : 'Unknown error'}`
                                        });
                                        subscriber.error(recursionError);
                                    }
                                } else {
                                    const extractedToolCalls = this.extractToolCallsFromText(roundTextContent || '');
                                    if (extractedToolCalls.length > 0) {
                                        this.logger.info('Extracted tool calls from text response', { count: extractedToolCalls.length });
                                        const toolResults = await this.executeToolsSequentially(
                                            extractedToolCalls,
                                            subscriber,
                                            agentState
                                        );
                                        const toolResultMessage = this.buildToolResultMessage(toolResults);
                                        conversationMessages.push(toolResultMessage);
                                        try {
                                            await runSingleRound();
                                        } catch (recursionError) {
                                            this.logger.error('Recursive round error', recursionError);
                                            subscriber.next({
                                                type: 'error',
                                                error: `执行循环中断: ${recursionError instanceof Error ? recursionError.message : 'Unknown error'}`
                                            });
                                            subscriber.error(recursionError);
                                        }
                                        return;
                                    }
                                    // Auto-apply patch if model returned code without tool calls for file creation
                                    const lastUserMessage = conversationMessages
                                        .filter(m => m.role === MessageRole.USER)
                                        .pop()?.content || '';
                                    const autoPatch = this.buildAutoPatchFromResponse(roundTextContent, lastUserMessage);
                                    if (autoPatch) {
                                        this.logger.info('Auto-building patch from model response', { fileName: autoPatch.fileName });
                                        const toolCalls = [{
                                            id: this.generateId(),
                                            name: 'apply_patch',
                                            input: { patch: autoPatch.patch }
                                        }] as ToolCall[];
                                        const toolResults = await this.executeToolsSequentially(toolCalls, subscriber, agentState);
                                        const toolResultMessage = this.buildToolResultMessage(toolResults);
                                        conversationMessages.push(toolResultMessage);
                                        try {
                                            await runSingleRound();
                                        } catch (recursionError) {
                                            this.logger.error('Recursive round error', recursionError);
                                            subscriber.next({
                                                type: 'error',
                                                error: `执行循环中断: ${recursionError instanceof Error ? recursionError.message : 'Unknown error'}`
                                            });
                                            subscriber.error(recursionError);
                                        }
                                        return;
                                    }
                                    const mentionsPatch = /apply_patch|patch/i.test(roundTextContent || '');
                                    const hasCode = !!this.extractFirstCodeBlock(roundTextContent || '');
                                    if (mentionsPatch && !hasCode) {
                                        const warning = 'Model referenced apply_patch but did not provide file contents. Try again or switch providers for reliable tool calls.';
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta: `\n\n⚠️ ${warning}\n`
                                        });
                                        subscriber.next({
                                            type: 'agent_complete',
                                            reason: 'no_tools',
                                            totalRounds: agentState.currentRound,
                                            terminationMessage: warning
                                        });
                                        callbacks.onAgentComplete?.('no_tools', agentState.currentRound);
                                        subscriber.complete();
                                        resolve();
                                        return;
                                    }
                                    const hasCodeBlock = !!this.extractFirstCodeBlock(roundTextContent);
                                    if (!hasCodeBlock && this.hasIncompleteHint(roundTextContent || '')) {
                                        const warning = 'No tool calls were returned. This provider may not support tool calling. Switch providers or enable tool support to create files.';
                                        subscriber.next({
                                            type: 'text_delta',
                                            textDelta: `\n\n⚠️ ${warning}\n`
                                        });
                                        subscriber.next({
                                            type: 'agent_complete',
                                            reason: 'no_tools',
                                            totalRounds: agentState.currentRound,
                                            terminationMessage: warning
                                        });
                                        callbacks.onAgentComplete?.('no_tools', agentState.currentRound);
                                        subscriber.complete();
                                        resolve();
                                        return;
                                    }
                                    // 没有工具调用
                                    // 如果 checkTermination 返回 shouldTerminate: false（检测到未完成暗示），继续下一轮
                                    if (!termination.shouldTerminate) {
                                        this.logger.info(`No tools but incomplete hint detected (${termination.reason}), continuing to next round`);
                                        try {
                                            await runSingleRound();
                                        } catch (recursionError) {
                                            this.logger.error('Recursive round error', recursionError);
                                            subscriber.next({
                                                type: 'error',
                                                error: `执行循环中断: ${recursionError instanceof Error ? recursionError.message : 'Unknown error'}`
                                            });
                                            subscriber.error(recursionError);
                                        }
                                    } else {
                                        // 真正完成，终止 Agent
                                        this.logger.info(`Agent completed: ${agentState.currentRound} rounds, reason: ${termination.reason}`);
                                        subscriber.next({
                                            type: 'agent_complete',
                                            reason: termination.reason,
                                            totalRounds: agentState.currentRound,
                                            terminationMessage: termination.message
                                        });
                                        callbacks.onAgentComplete?.(termination.reason, agentState.currentRound);
                                        subscriber.complete();
                                    }
                                }

                                resolve();
                            })().catch(error => {
                                this.logger.error('Error in complete handler', error);
                                subscriber.next({ type: 'error', error: error.message });
                                reject(error);
                            });
                        }
                    });
                });
            };

            // 开始第一轮
            runSingleRound().catch(error => {
                subscriber.error(error);
            });

            // 返回取消函数
            return () => {
                agentState.isActive = false;
                this.logger.info('Agent loop cancelled by subscriber');
            };
        });
    }

    /**
     * LangGraph-based Agent loop
     */
    private chatStreamWithLangGraphLoop(
        request: ChatRequest,
        config: AgentLoopConfig = {}
    ): Observable<AgentStreamEvent> {
        this.logger.info('🔥 chatStreamWithLangGraphLoop CALLED', {
            messagesCount: request.messages?.length,
            maxRounds: config.maxRounds,
            timeoutMs: config.timeoutMs
        });

        const maxRounds = config.maxRounds || 6;
        const timeoutMs = config.timeoutMs || 120000;
        const repeatThreshold = config.repeatThreshold || 5;
        const failureThreshold = config.failureThreshold || 3;
        const plannerEnabled = (this.config.get<boolean>('agentPlannerEnabled', true) ?? true);
        const reviewerEnabled = (this.config.get<boolean>('agentReviewerEnabled', true) ?? true);

        const callbacks = {
            onRoundStart: config.onRoundStart,
            onRoundEnd: config.onRoundEnd,
            onAgentComplete: config.onAgentComplete
        };

        const agentState: AgentState = {
            currentRound: 0,
            startTime: Date.now(),
            toolCallHistory: [],
            lastAiResponse: '',
            isActive: true
        };

            type LangGraphState = {
                messages: ChatMessage[];
                pendingToolCalls: ToolCall[];
                toolResults: ToolResult[];
                lastText: string;
                shouldTerminate: boolean;
                termination: TerminationResult | null;
                forceRetry: boolean;
                round: number;
                hasPlan: boolean;
                reviewRequired: boolean;
                reviewerNotes: string;
                contentRetryCount: number;
                hasToolResult: boolean;
                hasPatchApplied: boolean;
            };
            const graphStateArgs = {
                channels: {
                    messages: { reducer: (_left: ChatMessage[] | undefined, right: ChatMessage[] | undefined) => right ?? _left ?? [], default: () => [] },
                    pendingToolCalls: { reducer: (_left: ToolCall[] | undefined, right: ToolCall[] | undefined) => right ?? _left ?? [], default: () => [] },
                    toolResults: { reducer: (_left: ToolResult[] | undefined, right: ToolResult[] | undefined) => right ?? _left ?? [], default: () => [] },
                    lastText: { reducer: (_left: string | undefined, right: string | undefined) => right ?? _left ?? '', default: () => '' },
                    shouldTerminate: { reducer: (_left: boolean | undefined, right: boolean | undefined) => right ?? _left ?? false, default: () => false },
                    termination: { reducer: (_left: TerminationResult | null | undefined, right: TerminationResult | null | undefined) => right ?? _left ?? null, default: () => null },
                    forceRetry: { reducer: (_left: boolean | undefined, right: boolean | undefined) => right ?? _left ?? false, default: () => false },
                    round: { reducer: (_left: number | undefined, right: number | undefined) => right ?? _left ?? 0, default: () => 0 },
                    hasPlan: { reducer: (_left: boolean | undefined, right: boolean | undefined) => right ?? _left ?? false, default: () => false },
                    reviewRequired: { reducer: (_left: boolean | undefined, right: boolean | undefined) => right ?? _left ?? false, default: () => false },
                    reviewerNotes: { reducer: (_left: string | undefined, right: string | undefined) => right ?? _left ?? '', default: () => '' },
                    contentRetryCount: { reducer: (_left: number | undefined, right: number | undefined) => right ?? _left ?? 0, default: () => 0 },
                    hasToolResult: { reducer: (_left: boolean | undefined, right: boolean | undefined) => right ?? _left ?? false, default: () => false },
                    hasPatchApplied: { reducer: (_left: boolean | undefined, right: boolean | undefined) => right ?? _left ?? false, default: () => false }
                }
            };

        return new Observable<AgentStreamEvent>((subscriber) => {
            const conversationMessages: ChatMessage[] = [...(request.messages || [])];
            const taskContextMessage: ChatMessage = {
                id: this.generateId(),
                role: MessageRole.SYSTEM,
                content: this.buildAgentSystemPrompt(),
                timestamp: new Date()
            };
            conversationMessages.unshift(taskContextMessage);

            const plannerNode = async (state: LangGraphState): Promise<Partial<LangGraphState>> => {
                if (!plannerEnabled || state.hasPlan) {
                    return { hasPlan: state.hasPlan };
                }
                if (!agentState.isActive) {
                    return {
                        shouldTerminate: true,
                        termination: { shouldTerminate: true, reason: 'user_cancel', message: 'User cancelled' } as TerminationResult
                    };
                }
                const activeProvider = this.providerManager.getActiveProvider() as any;
                if (!activeProvider) {
                    return { hasPlan: true };
                }
                const planRequest: ChatRequest = {
                    ...request,
                    messages: [
                        ...state.messages,
                        {
                            id: this.generateId(),
                            role: MessageRole.SYSTEM,
                            content: 'You are a planner. Provide a short bullet plan. Do not call tools. Do not mention tool names, commands, or file paths.',
                            timestamp: new Date()
                        }
                    ],
                    enableTools: false,
                    tools: []
                };
                try {
                    const planResponse = await activeProvider.chat(planRequest);
                    const planText = planResponse?.message?.content?.trim() || '';
                    if (planText) {
                        const planHasTools = /apply_patch|read_file|list_files|write_to_terminal|task_complete|command:|tool/i.test(planText);
                        if (planHasTools) {
                            return { hasPlan: true };
                        }
                        subscriber.next({ type: 'text_delta', textDelta: `\n\nPlan:\n${planText}\n` });
                        const updatedMessages = [...state.messages, {
                            id: this.generateId(),
                            role: MessageRole.ASSISTANT,
                            content: `Plan:\n${planText}`,
                            timestamp: new Date()
                        }];
                        return { messages: updatedMessages, hasPlan: true };
                    }
                } catch (error) {
                    this.logger.warn('Planner node failed', { error: error instanceof Error ? error.message : String(error) });
                }
                return { hasPlan: true };
            };

            const assistantNode = async (state: LangGraphState): Promise<Partial<LangGraphState>> => {
                if (!agentState.isActive) {
                    return {
                        shouldTerminate: true,
                        termination: { shouldTerminate: true, reason: 'user_cancel', message: 'User cancelled' } as TerminationResult,
                        forceRetry: false
                    };
                }

                const currentRound = (state.round || 0) + 1;
                agentState.currentRound = currentRound;
                subscriber.next({ type: 'round_start', round: currentRound });
                callbacks.onRoundStart?.(currentRound);
                this.logger.info(`Agent round ${currentRound} started`);

                const pendingToolCalls: ToolCall[] = [];
                let roundTextContent = '';

                const roundRequest: ChatRequest = {
                    ...request,
                    messages: state.messages || [],
                    enableTools: true,
                    tools: this.terminalTools.getToolDefinitions()
                };

                const activeProvider = this.providerManager.getActiveProvider() as any;
                if (!activeProvider) {
                    const error = new Error('No active AI provider available');
                    subscriber.next({ type: 'error', error: error.message });
                    return {
                        shouldTerminate: true,
                        termination: { shouldTerminate: true, reason: 'no_tools', message: error.message } as TerminationResult,
                        forceRetry: false
                    };
                }

                await new Promise<void>((resolve, reject) => {
                    const streamSub = activeProvider.chatStream(roundRequest).subscribe({
                        next: (event: any) => {
                            if (!agentState.isActive) return;
                            switch (event.type) {
                                case 'text_delta':
                                    if (event.textDelta) {
                                        roundTextContent += event.textDelta;
                                        subscriber.next({ type: 'text_delta', textDelta: event.textDelta });
                                    }
                                    break;
                                case 'tool_use_start':
                                    subscriber.next({ type: 'tool_use_start', toolCall: event.toolCall });
                                    break;
                                case 'tool_use_end':
                                    if (event.toolCall) {
                                        pendingToolCalls.push(event.toolCall as ToolCall);
                                        subscriber.next({ type: 'tool_use_end', toolCall: event.toolCall });
                                    }
                                    break;
                                case 'error':
                                    subscriber.next({ type: 'error', error: event.error });
                                    break;
                            }
                        },
                        error: (error: any) => {
                            subscriber.next({
                                type: 'error',
                                error: error instanceof Error ? error.message : String(error)
                            });
                            streamSub.unsubscribe();
                            reject(error);
                        },
                        complete: () => {
                            streamSub.unsubscribe();
                            resolve();
                        }
                    });
                });

                subscriber.next({ type: 'round_end', round: currentRound });
                callbacks.onRoundEnd?.(currentRound);

                const updatedMessages: ChatMessage[] = [...(state.messages || [])];
                if (roundTextContent || pendingToolCalls.length > 0) {
                    updatedMessages.push({
                        id: this.generateId(),
                        role: MessageRole.ASSISTANT,
                        content: roundTextContent || '',
                        timestamp: new Date(),
                        toolCalls: pendingToolCalls.map(tc => ({
                            id: tc.id,
                            name: tc.name,
                            input: tc.input
                        }))
                    });
                    agentState.lastAiResponse = roundTextContent || '';
                }

                const lastUserMessage = updatedMessages
                    .filter(m => m.role === MessageRole.USER)
                    .pop()?.content || '';

                const termination = this.checkTermination(
                    agentState,
                    pendingToolCalls,
                    [],
                    { maxRounds, timeoutMs, repeatThreshold, failureThreshold },
                    'after_ai_response',
                    lastUserMessage
                );

                const validToolNames = this.terminalTools.getToolDefinitions().map(t => t.name);
                const validToolCalls = pendingToolCalls.filter(tc => validToolNames.includes(tc.name));
                if (validToolCalls.length !== pendingToolCalls.length) {
                    this.logger.warn('Dropping invalid tool calls', {
                        invalid: pendingToolCalls.filter(tc => !validToolNames.includes(tc.name)).map(tc => tc.name)
                    });
                }

                const hasInvokeText = roundTextContent && (
                    roundTextContent.includes('<invoke') ||
                    roundTextContent.includes('<parameter') ||
                    roundTextContent.includes('</invoke>')
                );
                const noActualToolCalls = validToolCalls.length === 0;

                if (hasInvokeText && noActualToolCalls && agentState.currentRound < maxRounds) {
                    updatedMessages.push({
                        id: this.generateId(),
                        role: MessageRole.USER,
                        content: `【系统提示】你输出了 <invoke> 格式的文本，但这不是正确的工具调用方式。请直接调用工具，不要用文本描述工具调用。系统会自动处理你的工具调用请求。`,
                        timestamp: new Date()
                    });
                    subscriber.next({
                        type: 'text_delta',
                        textDelta: '\n\n[系统：检测到格式错误，正在重试...]\n'
                    });
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: [],
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: true,
                        round: currentRound
                    };
                }

                const clarificationRequested = this.isClarificationResponse(roundTextContent || '');
                if ((noActualToolCalls && clarificationRequested) || termination.shouldTerminate) {
                    this.logger.info('Agent terminated by smart detector', { reason: termination.reason });
                    subscriber.next({
                        type: 'agent_complete',
                        reason: termination.reason,
                        totalRounds: agentState.currentRound,
                        terminationMessage: termination.message
                    });
                    callbacks.onAgentComplete?.(termination.reason, agentState.currentRound);
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: [],
                        lastText: roundTextContent,
                        shouldTerminate: true,
                        termination,
                        forceRetry: false,
                        round: currentRound
                    };
                }

                if (validToolCalls.length > 0) {
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: validToolCalls,
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: false,
                        round: currentRound,
                        reviewRequired: false
                    };
                }

                const extractedToolCalls = this.extractToolCallsFromText(roundTextContent || '');
                if (extractedToolCalls.length > 0) {
                    this.logger.info('Extracted tool calls from text response', { count: extractedToolCalls.length });
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: extractedToolCalls,
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: false,
                        round: currentRound,
                        reviewRequired: false
                    };
                }

                const autoPatch = this.buildAutoPatchFromResponse(roundTextContent, lastUserMessage);
                if (autoPatch) {
                    this.logger.info('Auto-building patch from model response', { fileName: autoPatch.fileName });
                    const toolCalls = [{
                        id: this.generateId(),
                        name: 'apply_patch',
                        input: { patch: autoPatch.patch }
                    }] as ToolCall[];
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: toolCalls,
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: false,
                        round: currentRound,
                        reviewRequired: false
                    };
                }

                const looseCodePatch = this.buildPatchFromLooseCode(roundTextContent || '', lastUserMessage);
                if (looseCodePatch) {
                    this.logger.info('Built patch from loose code text', { fileName: looseCodePatch.fileName });
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: [{
                            id: this.generateId(),
                            name: 'apply_patch',
                            input: { patch: looseCodePatch.patch }
                        }],
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: false,
                        round: currentRound,
                        reviewRequired: false
                    };
                }

                const createdClaim = /(created|created in|saved|written|added|generated)/i.test(roundTextContent || '');
                const filenameOnly = /^\s*[A-Za-z0-9._-]+\.[A-Za-z0-9]+\s*$/.test(roundTextContent || '');
                if (createdClaim || filenameOnly) {
                    const inferred = this.inferFileName(roundTextContent || '', '', lastUserMessage) || (roundTextContent || '').trim();
                    const rawName = inferred || 'generated_file.txt';
                    // Keep absolute path if it lives under working dir; otherwise reject
                    const pathModule = (window as any)?.require?.('path');
                    const configuredRoot = (this.config.get<string>('agentWorkingDir', '') || '').trim();
                    let safeName = rawName;
                    if (pathModule) {
                        const isAbs = pathModule.isAbsolute(rawName);
                        if (isAbs) {
                            const root = configuredRoot || pathModule.resolve('.');
                            const normalizedRoot = root.endsWith(pathModule.sep) ? root : `${root}${pathModule.sep}`;
                            const normalizedTarget = pathModule.resolve(rawName);
                            if (normalizedTarget.startsWith(normalizedRoot)) {
                                safeName = normalizedTarget;
                            } else {
                                this.logger.warn('Rejected absolute path outside workdir', { rawName, root: normalizedRoot });
                                safeName = rawName.replace(/^(\.\.\/|\/)+/, '');
                            }
                        } else {
                            safeName = rawName.replace(/^(\.\.\/|\/)+/, '');
                        }
                    } else {
                        safeName = rawName.replace(/^(\.\.\/|\/)+/, '');
                    }
                    if (safeName) {
                        const patch = [
                            '--- /dev/null',
                            `+++ ${safeName}`,
                            '@@ -0,0 +1,1 @@',
                            '+',
                            ''
                        ].join('\n');
                        this.logger.info('Auto-creating minimal file from success claim', { fileName: safeName });
                        return {
                            messages: updatedMessages,
                            pendingToolCalls: [{
                                id: this.generateId(),
                                name: 'apply_patch',
                                input: { patch }
                            }],
                            lastText: roundTextContent,
                            shouldTerminate: false,
                            termination: null,
                            forceRetry: false,
                            round: currentRound,
                            reviewRequired: false
                        };
                    }
                }

                // Strong fallback: if user intent is to create a file but no patch/tool calls were produced, generate a minimal patch
                if (this.isFileCreateIntent(lastUserMessage) && !state.hasPatchApplied) {
                    const inferred = this.inferFileName(roundTextContent || '', '', lastUserMessage) || 'generated_file.txt';
                    const safeName = inferred.replace(/^(\.\.\/|\/)+/, '');
                    const placeholderLines = [
                        '#!/usr/bin/env python3',
                        '\"\"\"Auto-generated placeholder; please add content.\"\"\"',
                        '',
                        'def main():',
                        '    print("placeholder")',
                        '',
                        'if __name__ == "__main__":',
                        '    main()'
                    ];
                    const patch = [
                        '--- /dev/null',
                        `+++ ${safeName}`,
                        `@@ -0,0 +1,${placeholderLines.length} @@`,
                        ...placeholderLines.map(l => `+${l}`),
                        ''
                    ].join('\n');
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: [{
                            id: this.generateId(),
                            name: 'apply_patch',
                            input: { patch }
                        }],
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: false,
                        round: currentRound,
                        reviewRequired: false,
                        hasToolResult: state.hasToolResult,
                        hasPatchApplied: state.hasPatchApplied
                    };
                }

                const mentionsPatch = /apply_patch|patch/i.test(roundTextContent || '');
                const hasCode = !!this.extractFirstCodeBlock(roundTextContent || '');
                if (mentionsPatch && !hasCode) {
                    if ((state.contentRetryCount || 0) < 1) {
                        const retryHint: ChatMessage = {
                            id: this.generateId(),
                            role: MessageRole.SYSTEM,
                            content: 'Provide the full file contents in a code block. Do not output tool commands or file paths.',
                            timestamp: new Date()
                        };
                        const retryMessages = [...updatedMessages, retryHint];
                        return {
                            messages: retryMessages,
                            pendingToolCalls: [],
                            lastText: roundTextContent,
                            shouldTerminate: false,
                            termination: null,
                            forceRetry: true,
                            round: currentRound,
                            contentRetryCount: (state.contentRetryCount || 0) + 1
                        };
                    }
                    const warning = 'Model referenced apply_patch but did not provide file contents. Try again or switch providers for reliable tool calls.';
                    subscriber.next({
                        type: 'text_delta',
                        textDelta: `\n\n⚠️ ${warning}\n`
                    });
                    subscriber.next({
                        type: 'agent_complete',
                        reason: 'no_tools',
                        totalRounds: agentState.currentRound,
                        terminationMessage: warning
                    });
                    callbacks.onAgentComplete?.('no_tools', agentState.currentRound);
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: [],
                        lastText: roundTextContent,
                        shouldTerminate: true,
                        termination: { shouldTerminate: true, reason: 'no_tools', message: warning } as TerminationResult,
                        forceRetry: false,
                        round: currentRound
                    };
                }

                if (!termination.shouldTerminate) {
                    this.logger.info(`No tools but incomplete hint detected (${termination.reason}), continuing to next round`);
                    return {
                        messages: updatedMessages,
                        pendingToolCalls: [],
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: true,
                        round: currentRound,
                        reviewRequired: false
                    };
                }

                this.logger.info(`Agent completed: ${agentState.currentRound} rounds, reason: ${termination.reason}`);
                subscriber.next({
                    type: 'agent_complete',
                    reason: termination.reason,
                    totalRounds: agentState.currentRound,
                    terminationMessage: termination.message
                });
                callbacks.onAgentComplete?.(termination.reason, agentState.currentRound);

                // If no tools ever ran, force retry once to obtain executable steps
                const hasEverRunTools = state.hasToolResult;
                const hasPatch = state.hasPatchApplied;
                const fileIntent = this.isFileCreateIntent(lastUserMessage);

                if (!hasEverRunTools || (fileIntent && !hasPatch)) {
                    const retryHint: ChatMessage = {
                        id: this.generateId(),
                        role: MessageRole.SYSTEM,
                        content: 'You must apply a patch with full file contents (code block). Do not just say the file is created.',
                        timestamp: new Date()
                    };
                    return {
                        messages: [...updatedMessages, retryHint],
                        pendingToolCalls: [],
                        lastText: roundTextContent,
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: true,
                        round: currentRound,
                        reviewRequired: false,
                        hasToolResult: hasEverRunTools,
                        hasPatchApplied: hasPatch
                    };
                }

                return {
                    messages: updatedMessages,
                    pendingToolCalls: [],
                    lastText: roundTextContent,
                    shouldTerminate: true,
                    termination: termination as TerminationResult,
                    forceRetry: false,
                    round: currentRound,
                    reviewRequired: false,
                    hasToolResult: hasEverRunTools,
                    hasPatchApplied: hasPatch
                };
                };

            const toolsNode = async (state: LangGraphState): Promise<Partial<LangGraphState>> => {
                if (!agentState.isActive) {
                    return {
                        shouldTerminate: true,
                        termination: { shouldTerminate: true, reason: 'user_cancel', message: 'User cancelled' } as TerminationResult,
                        forceRetry: false,
                        pendingToolCalls: []
                    };
                }

                const toolCalls = state.pendingToolCalls || [];
                if (toolCalls.length === 0) {
                    return {
                        messages: state.messages,
                        pendingToolCalls: [],
                        shouldTerminate: false,
                        termination: null,
                        forceRetry: false,
                        round: state.round,
                        reviewRequired: false
                    };
                }

                this.logger.info(`Round ${agentState.currentRound}: ${toolCalls.length} tools to execute`);
                const toolResults = await this.executeToolsSequentially(toolCalls, subscriber, agentState);
                const updatedMessages: ChatMessage[] = [...(state.messages || [])];
                const toolResultMessage = this.buildToolResultMessage(toolResults);
                updatedMessages.push(toolResultMessage);

                const postToolTermination = this.checkTermination(
                    agentState,
                    [],
                    toolResults,
                    { maxRounds, timeoutMs, repeatThreshold, failureThreshold },
                    'after_tool_execution'
                );

                if (postToolTermination.shouldTerminate) {
                    this.logger.info('Agent terminated after tool execution', { reason: postToolTermination.reason });
                    subscriber.next({
                        type: 'agent_complete',
                        reason: postToolTermination.reason,
                        totalRounds: agentState.currentRound,
                        terminationMessage: postToolTermination.message
                    });
                    callbacks.onAgentComplete?.(postToolTermination.reason, agentState.currentRound);
                }

                return {
                    messages: updatedMessages,
                    pendingToolCalls: [],
                    toolResults,
                    shouldTerminate: postToolTermination.shouldTerminate,
                    termination: postToolTermination.shouldTerminate ? (postToolTermination as TerminationResult) : null,
                    forceRetry: false,
                    round: state.round,
                    reviewRequired: reviewerEnabled && !postToolTermination.shouldTerminate,
                    hasToolResult: true,
                    hasPatchApplied: state.hasPatchApplied || toolCalls.some(tc => tc.name === 'apply_patch')
                };
            };

            const reviewerNode = async (state: LangGraphState): Promise<Partial<LangGraphState>> => {
                if (!reviewerEnabled || !state.reviewRequired) {
                    return { reviewRequired: false, reviewerNotes: '' };
                }
                if (!agentState.isActive) {
                    return {
                        shouldTerminate: true,
                        termination: { shouldTerminate: true, reason: 'user_cancel', message: 'User cancelled' } as TerminationResult
                    };
                }
                if (agentState.currentRound >= maxRounds) {
                    return { reviewRequired: false, reviewerNotes: '' };
                }
                const activeProvider = this.providerManager.getActiveProvider() as any;
                if (!activeProvider) {
                    return { reviewRequired: false, reviewerNotes: '' };
                }
                const reviewRequest: ChatRequest = {
                    ...request,
                    messages: [
                        ...state.messages,
                        {
                            id: this.generateId(),
                            role: MessageRole.SYSTEM,
                            content: 'You are a reviewer. If the task is complete, respond with "APPROVED". If not, respond with "REVISE: <short fix instructions>". Do not call tools.',
                            timestamp: new Date()
                        }
                    ],
                    enableTools: false,
                    tools: []
                };
                try {
                    const reviewResponse = await activeProvider.chat(reviewRequest);
                    const reviewText = (reviewResponse?.message?.content || '').trim();
                    if (reviewText) {
                        subscriber.next({ type: 'text_delta', textDelta: `\n\nReviewer:\n${reviewText}\n` });
                    }
                    if (/^approved\b/i.test(reviewText)) {
                        const termination: TerminationResult = {
                            shouldTerminate: true,
                            reason: 'summarizing',
                            message: 'Reviewer approved'
                        };
                        subscriber.next({
                            type: 'agent_complete',
                            reason: termination.reason,
                            totalRounds: agentState.currentRound,
                            terminationMessage: termination.message
                        });
                        callbacks.onAgentComplete?.(termination.reason, agentState.currentRound);
                        return {
                            shouldTerminate: true,
                            termination,
                            reviewRequired: false,
                            reviewerNotes: reviewText
                        };
                    }
                    if (/^revise\b/i.test(reviewText)) {
                        const updatedMessages = [...state.messages, {
                            id: this.generateId(),
                            role: MessageRole.USER,
                            content: `Reviewer feedback: ${reviewText.replace(/^revise:\s*/i, '')}`,
                            timestamp: new Date()
                        }];
                        return {
                            messages: updatedMessages,
                            reviewRequired: false,
                            reviewerNotes: reviewText
                        };
                    }
                    return { reviewRequired: false, reviewerNotes: reviewText };
                } catch (error) {
                    this.logger.warn('Reviewer node failed', { error: error instanceof Error ? error.message : String(error) });
                    return { reviewRequired: false, reviewerNotes: '' };
                }
            };

            const graph = new StateGraph<LangGraphState>(graphStateArgs)
                .addNode('planner', plannerNode)
                .addNode('assistant', assistantNode)
                .addNode('tools', toolsNode)
                .addNode('reviewer', reviewerNode)
                .addEdge(START, 'planner')
                .addEdge('planner', 'assistant')
                .addConditionalEdges(
                    'assistant',
                    (state: LangGraphState) => {
                        if (state.shouldTerminate) return 'end';
                        if (state.forceRetry) return 'assistant';
                        if (state.pendingToolCalls && state.pendingToolCalls.length > 0) return 'tools';
                        return 'end';
                    },
                    { assistant: 'assistant', tools: 'tools', end: END }
                )
                .addConditionalEdges(
                    'tools',
                    (state: LangGraphState) => (state.shouldTerminate ? 'end' : (state.reviewRequired ? 'reviewer' : 'assistant')),
                    { assistant: 'assistant', reviewer: 'reviewer', end: END }
                )
                .addConditionalEdges(
                    'reviewer',
                    (state: LangGraphState) => (state.shouldTerminate ? 'end' : 'assistant'),
                    { assistant: 'assistant', end: END }
                )
                .compile();

            const initialState = {
                messages: conversationMessages,
                pendingToolCalls: [],
                toolResults: [],
                lastText: '',
                shouldTerminate: false,
                termination: null,
                forceRetry: false,
                round: 0,
                contentRetryCount: 0,
                hasToolResult: false,
                hasPatchApplied: false
            };

            graph.invoke(initialState)
                .then(() => {
                    if (!subscriber.closed) {
                        subscriber.complete();
                    }
                })
                .catch((error: any) => {
                    const message = error instanceof Error ? error.message : String(error);
                    subscriber.next({ type: 'error', error: message });
                    subscriber.error(error);
                });

            return () => {
                agentState.isActive = false;
                this.logger.info('Agent loop cancelled by subscriber');
            };
        });
    }

    /**
     * 顺序执行工具并发送事件
     * @param toolCalls 工具调用列表
     * @param subscriber 事件订阅者
     * @param agentState Agent 状态（用于追踪工具调用历史）
     */
    private async executeToolsSequentially(
        toolCalls: ToolCall[],
        subscriber: { next: (event: AgentStreamEvent) => void },
        agentState?: AgentState
    ): Promise<ToolResult[]> {
        const results: ToolResult[] = [];

        for (const toolCall of toolCalls) {
            // 发送 tool_executing 事件
            subscriber.next({
                type: 'tool_executing',
                toolCall: {
                    id: toolCall.id,
                    name: toolCall.name,
                    input: toolCall.input
                }
            });

            const startTime = Date.now();

            try {
                // Always require approval for commands and patches
                if (toolCall.name === 'write_to_terminal' && toolCall.input?.command) {
                    const command = toolCall.input.command;
                    const approved = await this.agentApproval.requestApproval({
                        id: toolCall.id,
                        type: 'command',
                        title: 'Approve Command Execution',
                        command,
                        detail: 'The agent wants to run this command.'
                    });

                    if (!approved) {
                        const duration = Date.now() - startTime;
                        subscriber.next({
                            type: 'tool_executed',
                            toolCall: {
                                id: toolCall.id,
                                name: toolCall.name,
                                input: toolCall.input
                            },
                            toolResult: {
                                tool_use_id: toolCall.id,
                                content: '⚠️ Command denied by user',
                                is_error: true,
                                duration
                            }
                        });

                        results.push({
                            tool_use_id: toolCall.id,
                            name: toolCall.name,
                            content: 'Command denied by user',
                            is_error: true
                        });

                        if (agentState) {
                            agentState.toolCallHistory.push({
                                name: toolCall.name,
                                input: toolCall.input,
                                inputHash: this.hashInput(toolCall.input),
                                success: false,
                                timestamp: Date.now()
                            });
                        }

                        continue;
                    }
                }

                if (toolCall.name === 'apply_patch' && toolCall.input?.patch) {
                    const patch = toolCall.input.patch;
                    const approved = await this.agentApproval.requestApproval({
                        id: toolCall.id,
                        type: 'patch',
                        title: 'Approve Patch Apply',
                        patch,
                        detail: 'The agent wants to apply this patch.'
                    });

                    if (!approved) {
                        const duration = Date.now() - startTime;
                        subscriber.next({
                            type: 'tool_executed',
                            toolCall: {
                                id: toolCall.id,
                                name: toolCall.name,
                                input: toolCall.input
                            },
                            toolResult: {
                                tool_use_id: toolCall.id,
                                content: '⚠️ Patch denied by user',
                                is_error: true,
                                duration
                            }
                        });

                        results.push({
                            tool_use_id: toolCall.id,
                            name: toolCall.name,
                            content: 'Patch denied by user',
                            is_error: true
                        });

                        if (agentState) {
                            agentState.toolCallHistory.push({
                                name: toolCall.name,
                                input: toolCall.input,
                                inputHash: this.hashInput(toolCall.input),
                                success: false,
                                timestamp: Date.now()
                            });
                        }

                        continue;
                    }
                }

                const result = await this.terminalTools.executeToolCall(toolCall);
                const duration = Date.now() - startTime;

                // 添加工具名称到结果中
                results.push({
                    ...result,
                    name: toolCall.name  // 添加工具名称
                });

                // 记录到 Agent 状态历史
                if (agentState) {
                    agentState.toolCallHistory.push({
                        name: toolCall.name,
                        input: toolCall.input,
                        inputHash: this.hashInput(toolCall.input),
                        success: !result.is_error,
                        timestamp: Date.now()
                    });
                }

                // 发送 tool_executed 事件
                subscriber.next({
                    type: 'tool_executed',
                    toolCall: {
                        id: toolCall.id,
                        name: toolCall.name,
                        input: toolCall.input
                    },
                    toolResult: {
                        tool_use_id: result.tool_use_id,
                        content: result.content,
                        is_error: !!result.is_error,
                        duration
                    }
                });

                this.logger.info('Tool executed', {
                    name: toolCall.name,
                    duration,
                    success: !result.is_error
                });

            } catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isWorkdirViolation = typeof errorMessage === 'string' && /outside working dir/i.test(errorMessage);

                // 发送 tool_error 事件
                subscriber.next({
                    type: 'tool_error',
                    toolCall: {
                        id: toolCall.id,
                        name: toolCall.name,
                        input: toolCall.input
                    },
                    toolResult: {
                        tool_use_id: toolCall.id,
                        content: `Tool execution failed: ${errorMessage}`,
                        is_error: true,
                        duration
                    }
                });

                if (isWorkdirViolation) {
                    subscriber.next({
                        type: 'text_delta',
                        textDelta: '\n\n⚠️ Patch blocked: target file is outside the configured Work Dir. Update Work Dir or use relative paths.\n'
                    });
                }

                // 添加错误结果以便 AI 知道
                results.push({
                    tool_use_id: toolCall.id,
                    content: `工具执行失败: ${errorMessage}`,
                    is_error: true
                });

                // 记录失败的调用到历史
                if (agentState) {
                    agentState.toolCallHistory.push({
                        name: toolCall.name,
                        input: toolCall.input,
                        inputHash: this.hashInput(toolCall.input),
                        success: false,
                        timestamp: Date.now()
                    });
                }

                this.logger.error('Tool execution failed', { name: toolCall.name, error });
            }
        }

        return results;
    }

    /**
     * 构建工具结果消息
     * 关键：添加 toolResults 和 tool_use_id 字段，供 transformMessages 正确识别和处理
     */
    private buildToolResultMessage(results: ToolResult[]): ChatMessage {
        const content = results.map(r => {
            const toolName = r.name || r.tool_use_id;
            const status = r.is_error ? 'Execution failed' : 'Execution successful';
            return `[${toolName}] ${status}.\nResult: ${r.content}`;
        }).join('\n\n');

        return {
            id: this.generateId(),
            role: MessageRole.TOOL,
            // 添加提示让 AI 继续完成用户的其他请求
            content: `Tool execution completed:\n\n${content}\n\nPlease check the user's original request. If there are still incomplete tasks, please continue calling the appropriate tools to complete them. If all tasks are completed, please summarize the results and reply to the user.`,
            timestamp: new Date(),
            // 关键：添加 toolResults 字段供 transformMessages 识别
            toolResults: results.map(r => ({
                tool_use_id: r.tool_use_id,
                name: r.name,
                content: r.content,
                is_error: r.is_error
            })),
            // 保留 tool_use_id 供简单识别
            tool_use_id: results[0]?.tool_use_id || ''
        };
    }

    /**
     * 生成唯一 ID
     */
    private generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ============================================================================
    // 智能终止检测相关方法
    // ============================================================================

    /**
     * 智能终止检测器
     * @param state Agent 状态
     * @param currentToolCalls 当前工具调用列表
     * @param toolResults 工具执行结果列表
     * @param config 配置参数
     * @param phase 检测场景：'after_ai_response'(AI响应后) | 'after_tool_execution'(工具执行后)
     */
    private checkTermination(
        state: AgentState,
        currentToolCalls: ToolCall[],
        toolResults: ToolResult[],
        config: {
            maxRounds: number;
            timeoutMs: number;
            repeatThreshold: number;
            failureThreshold: number;
        },
        phase: 'after_ai_response' | 'after_tool_execution' = 'after_ai_response',
        userMessage?: string  // Optional: only needed for 'after_ai_response' phase
    ): TerminationResult {
        this.logger.debug('Checking termination conditions', {
            currentRound: state.currentRound,
            maxRounds: config.maxRounds,
            toolCallsCount: currentToolCalls.length,
            historyCount: state.toolCallHistory.length,
            phase
        });

        // 1. 检查 task_complete 工具调用 (两个场景都检查)
        const taskCompleteResult = toolResults.find(r => (r as any).isTaskComplete);
        if (taskCompleteResult) {
            const terminationMessage = (taskCompleteResult as any).content || 'Task completed';
            return {
                shouldTerminate: true,
                reason: 'task_complete',
                message: terminationMessage
            };
        }

        // 2. 无工具调用检测 (只在 AI 响应后检查)
        if (phase === 'after_ai_response') {
            if (currentToolCalls.length === 0 && state.lastAiResponse) {
                // === 新增：检查是否是简单问候/对话，不需要工具 ===
                if (this.isSimpleConversation(state.lastAiResponse, userMessage)) {
                    this.logger.info('Detected simple conversation, terminating early', {
                        userMessage: userMessage?.substring(0, 50),
                        aiResponse: state.lastAiResponse.substring(0, 50)
                    });
                    return {
                        shouldTerminate: true,
                        reason: 'no_tools',
                        message: 'Simple conversation, no tools needed'
                    };
                }

                // === 新增：检查 AI 是否明确表示无法完成任务 ===
                const aiSaysCannotComplete = this.detectCannotComplete(state.lastAiResponse);
                if (aiSaysCannotComplete) {
                    this.logger.info('AI explicitly stated it cannot complete the task', {
                        response: state.lastAiResponse.substring(0, 200),
                        round: state.currentRound
                    });
                    return {
                        shouldTerminate: true,
                        reason: 'no_tools',
                        message: 'AI cannot complete this task with available tools'
                    };
                }

                // 先检查「未完成暗示」（但如果AI明确说没有函数，则忽略未完成暗示）
                const aiSaysNoFunction = /\b(no function|there is no function|unable to|cannot|can't|don't have|doesn't have|没有.*函数|无法.*执行|不能.*执行)/i.test(state.lastAiResponse.toLowerCase()) ||
                    /\b(unfortunately.*no.*function|however.*no.*function)/i.test(state.lastAiResponse.toLowerCase()) ||
                    /\bunfortunately.*there.*is.*no.*function/i.test(state.lastAiResponse.toLowerCase());

                if (this.hasIncompleteHint(state.lastAiResponse) && !aiSaysNoFunction) {
                    this.logger.warn('AI indicated incomplete task but no tools called', {
                        response: state.lastAiResponse.substring(0, 100)
                    });
                    return { shouldTerminate: false, reason: 'no_tools' };
                }

                // === 新增：检查 AI 是否提到了工具名但没调用 ===
                if (this.mentionsToolWithoutCalling(state.lastAiResponse)) {
                    this.logger.warn('AI mentioned tool but did not call it, continuing', {
                        response: state.lastAiResponse.substring(0, 100)
                    });
                    return { shouldTerminate: false, reason: 'mentioned_tool' };
                }

                // 检查总结关键词
                if (this.hasSummaryHint(state.lastAiResponse)) {
                    return {
                        shouldTerminate: true,
                        reason: 'summarizing',
                        message: '检测到 AI 正在总结，任务已完成'
                    };
                }
                // 默认无工具调用结束
                return {
                    shouldTerminate: true,
                    reason: 'no_tools',
                    message: 'No tool calls in this round, task completed'
                };
            }
        }

        // 3. 工具成功后直接终止（after_tool_execution 阶段）
        if (phase === 'after_tool_execution' && toolResults.length > 0) {
            const hasError = toolResults.some(r => r.is_error);
            if (!hasError) {
                return {
                    shouldTerminate: true,
                    reason: 'tool_success',
                    message: '工具执行成功，任务完成'
                };
            }
        }

        // 4. 重复工具调用检测 (两个场景都检查)
        if (currentToolCalls.length > 0) {
            const recentHistory = state.toolCallHistory.slice(-config.repeatThreshold * 2);

            for (const tc of currentToolCalls) {
                const inputHash = this.hashInput(tc.input);
                const repeatCount = recentHistory.filter(h =>
                    h.name === tc.name && h.inputHash === inputHash
                ).length;

                if (repeatCount >= config.repeatThreshold - 1) {  // 加上本次
                    return {
                        shouldTerminate: true,
                        reason: 'repeated_tool',
                        message: `工具 ${tc.name} 被重复调用 ${repeatCount + 1} 次，可能陷入循环`
                    };
                }
            }
        }

        // 5. 连续失败检测 (两个场景都检查)
        const recentResults = state.toolCallHistory.slice(-config.failureThreshold * 2);
        const failureCount = recentResults.filter(r => !r.success).length;
        if (failureCount >= config.failureThreshold) {
            return {
                shouldTerminate: true,
                reason: 'high_failure_rate',
                message: `连续 ${failureCount} 次工具调用失败，停止执行`
            };
        }

        // === 新增：检测多次尝试但无进展的情况 ===
        // 如果已经执行了很多轮（>= 10），且最近几轮都没有成功，应该终止
        if (state.currentRound >= 10 && phase === 'after_tool_execution') {
            const recentRounds = state.toolCallHistory.slice(-5); // 最近5轮
            const recentSuccessCount = recentRounds.filter(r => r.success).length;
            // 如果最近5轮都没有成功，且总轮数已经很多，终止
            if (recentSuccessCount === 0 && recentRounds.length >= 3) {
                this.logger.warn('No progress made in recent rounds, terminating', {
                    currentRound: state.currentRound,
                    recentRounds: recentRounds.length,
                    recentSuccessCount
                });
                return {
                    shouldTerminate: true,
                    reason: 'no_progress',
                    message: `已执行 ${state.currentRound} 轮，最近 ${recentRounds.length} 轮无进展，停止执行`
                };
            }
        }

        // 5. 超时检测 (两个场景都检查)
        const elapsedTime = Date.now() - state.startTime;
        if (elapsedTime > config.timeoutMs) {
            return {
                shouldTerminate: true,
                reason: 'timeout',
                message: `任务执行超时 (${Math.round(elapsedTime / 1000)}s)`
            };
        }

        // 6. 安全保底 - 最大轮数检测 (两个场景都检查)
        if (state.currentRound >= config.maxRounds) {
            this.logger.warn('Max rounds reached, forcing termination', {
                currentRound: state.currentRound,
                maxRounds: config.maxRounds,
                toolCallHistory: state.toolCallHistory.length,
                lastAiResponse: state.lastAiResponse?.substring(0, 100)
            });
            return {
                shouldTerminate: true,
                reason: 'max_rounds',
                message: `Maximum rounds reached (${config.maxRounds} rounds). The task may be too complex or the AI is stuck in a loop.`
            };
        }

        // 7. 额外安全检查：如果轮数过多且没有工具调用，强制终止
        if (state.currentRound >= 10 && phase === 'after_ai_response' && currentToolCalls.length === 0) {
            this.logger.warn('Many rounds without tools, forcing termination', {
                currentRound: state.currentRound,
                lastAiResponse: state.lastAiResponse?.substring(0, 100)
            });
            return {
                shouldTerminate: true,
                reason: 'no_tools',
                message: `Executed ${state.currentRound} rounds without tool calls. Task may be complete or cannot be completed.`
            };
        }

        return { shouldTerminate: false, reason: 'no_tools' };
    }

    /**
     * 检测 AI 回复中的「未完成暗示」
     * 使用正则表达式匹配更多变体
     */
    private hasIncompleteHint(text: string): boolean {
        if (!text || text.length < 2) return false;  // 边界情况检查

        return AiAssistantService.INCOMPLETE_PATTERNS.some(p => p.test(text));
    }

    /**
     * 检测 AI 回复中的「总结暗示」
     */
    private hasSummaryHint(text: string): boolean {
        if (!text || text.length < 2) return false;  // 边界情况检查

        return AiAssistantService.SUMMARY_PATTERNS.some(p => p.test(text));
    }

    // ============================================================================
    // 预编译的正则表达式（静态缓存）
    // ============================================================================

    // 未完成暗示模式
    private static readonly INCOMPLETE_PATTERNS: RegExp[] = [
        // 中文模式
        /现在.{0,6}(为您|帮您|给您|查看|执行|检查)/,       // 现在为您、现在继续为您
        /继续.{0,4}(为您|帮您|查看|执行|检查|获取)/,       // 继续为您、继续查看
        /(让我|我来|我将|我会).{0,6}(查看|执行|检查|获取|点击|打开|选择)/, // 让我查看、让我点击
        /(正在|开始|准备).{0,4}(执行|查看|检查|获取)/,     // 正在执行、开始查看
        /(接下来|然后|之后|随后).{0,4}(将|会|要)/,         // 接下来将、然后会
        /(马上|立即|即将|稍后|待会).{0,4}(为您|执行|查看)/, // 马上为您、即将执行
        /首先.{0,8}(然后|接着|之后)/,                      // 首先...然后
        /(第一步|下一步|接下来)/,                          // 步骤指示
        /(帮您|为您|给您).{0,4}(查看|执行|检查|获取|操作)/, // 帮您查看、为您执行
        /(我需要|需要).{0,4}(查看|执行|检查|获取)/,         // 我需要查看
        /(先|首先|第一).{0,4}(看看|检查|执行)/,             // 先看看、首先检查
        /下面.{0,4}(将|会|要|是)/,                         // 下面将、下面是
        /(等一下|稍等|请稍候)/,                             // 等待提示
        // === 新增：MCP 和工具相关模式 ===
        /(让我|我来|我将|我会).{0,30}(使用|调用|执行|查询|访问|点击|打开|选择|滚动|输入)/,  // 浏览器操作
        /使用.{0,20}(工具|MCP|浏览器).*?(查询|访问|获取)/,        // 使用工具模式
        /(MCP|mcp).{0,15}(工具|浏览器|服务|server)/i,            // MCP 相关操作
        /访问.{0,15}(官网|网站|URL|链接|网址)/,                   // 访问网站
        /(查询|获取|搜索).{0,10}(信息|数据|结果|推荐)/,           // 查询信息
        /浏览器.{0,10}(工具|访问|打开)/,                          // 浏览器操作
        /(下一步|接下来|然后).{0,15}(使用|调用|执行|查询)/,       // 步骤预告（更宽）
        /现在.{0,15}(重新|继续|使用|调用|执行|让我|查询|获取|搜索)/, // 现在使用/查询（含重新）
        // === 新增：重新/继续/再次类模式（高优先级） ===
        /重新.{0,10}(查询|搜索|获取|执行|尝试|加载|刷新)/,        // 重新查询、重新搜索
        /继续.{0,10}(查询|搜索|获取|执行|尝试)/,                  // 继续查询
        /再次.{0,10}(查询|搜索|获取|执行|尝试)/,                  // 再次执行
        /再.{0,6}(查一下|看一下|执行|获取)/,                      // 再查一下、再执行
        /还有.{0,10}(需要|要|可以)/,                              // 还有需要
        /另外.{0,10}(需要|要|可以)/,                              // 另外还需要
        /让我再.{0,10}/,                                          // 让我再看看
        /我再.{0,10}/,                                            // 我再查询一下
        /我再.{0,10}(次|一下)/,                                   // 我再一次
        /再试.{0,6}/,                                             // 再试一次
        /尝试.{0,10}(查询|搜索|执行|获取)/,                       // 尝试查询
        /看看能否.{0,10}/,                                        // 看看能否
        /检查一下.{0,10}/,                                        // 检查一下
        /确认.{0,10}(是否|有没有)/,                               // 确认一下
        /试.{0,6}(着|一下|看)/,                                   // 试一下、试试
        /查.{0,6}(看|一下|询)/,                                   // 查查看
        /查一下.{0,10}/,                                          // 查一下
        /获取.{0,10}(更多|其他、最新)/,                           // 获取更多信息
        /查看.{0,10}(更多|其他|详情)/,                            // 查看更多
        /然后.{0,15}(查询|搜索|获取|执行)/,                       // 然后查询
        /接下来.{0,15}(查询|搜索|获取|执行)/,                     // 接下来查询
        /现在重新/,                                               // 现在重新（通用）
        /继续执行/,                                               // 继续执行
        /再次执行/,                                               // 再次执行
        /重新加载/,                                               // 重新加载
        /刷新.{0,6}/,                                             // 刷新页面等
        // 英文模式
        /\b(let me|i('ll| will| am going to))\b/i,
        /\b(now i|first i|next i)\b/i,
        /\b(going to|about to|starting to|ready to|prepared to)\b/i,  // 扩展：ready to, prepared to
        /\b(will now|shall now|let's)\b/i,
        /\b(proceed(ing)? to|continu(e|ing) to)\b/i,
        /\b(executing|running|checking|fetching)\b/i,
        /\b(step \d|first,?|next,?|then,?)\b/i,
        /\b(wait(ing)?|hold on|stand by|just a moment)\b/i,  // 扩展：stand by, just a moment
        /\b(i need to|i have to)\b/i,
        /\b(looking (at|into|for))\b/i,
        // === 新增：英文浏览器操作动词 ===
        /\b(click(ing)?|open(ing)?|select(ing)?)\b/i,
        /\b(scroll(ing)?|type|typing|input(ting)?)\b/i,
        /\b(navigat(e|ing)|brows(e|ing))\b/i,
        /\b(submit(ting)?|enter(ing)?)\b/i,
        // === 新增：英文重试/再次类模式（高优先级） ===
        /\bagain\b/i,                                           // try again
        /\b(re)?try(ing)?\b/i,                                  // retry, trying
        /\b(re)?search(ing)?\b/i,                               // research, searching
        /\b(re)?visit(ing)?\b/i,                                // revisit
        /\b(re)?fresh(ing)?\b/i,                                // refresh
        /\b(re)?load(ing)?\b/i,                                 // reload
        /\b(another|one more|once more)\b/i,                    // one more time
        /\b(second|next) (try|time)\b/i,                        // second try
        // === 新增：英文意图执行类模式 ===
        /\blet me try\b/i,
        /\bI('ll| will) try\b/i,
        /\bI('m| am) going to try\b/i,
        /\bneed to (try|check|search|find)\b/i,
        /\bhave to (try|check|search|find)\b/i,
        /\bshould (try|check|search|find)\b/i,
        /\bshould try\b/i,
        /\bmust (try|check|search|find)\b/i,
        /\btry to (find|get|check|search)\b/i,
        /\battempt(ing)? to\b/i,
        /\bwork on\b/i,
        /\bhandle this\b/i,
        /\bdeal with\b/i,
        /\btake care of\b/i,
        /\bprocess(ing)?\b/i,
        /\bmanag(e|ing)?\b/i,
        /\bexecut(e|ion|ing)\b/i,
        /\bproceed\b/i,
        /\bcontinu(e|ing)\b/i,
        /\bfollow up\b/i,
        /\blook into\b/i,
        /\binvestigat(e|ing)?\b/i,
        /\bexplor(e|ing)?\b/i,
        /\bcheck (on|for|into)\b/i,
        /\bverify\b/i,
        /\bvalidat(e|ing)?\b/i,
        /\bconfirm(ing)?\b/i,
        /\bfetch(ing)?\b/i,
        /\bretriev(e|ing|al)?\b/i,
        /\bquer(y|ies|ing)\b/i,
        /\brequest(ing)?\b/i,
        /\bobtain(ing)?\b/i,
        /\bacquir(e|ing)?\b/i,
        /\bconsult(ing)?\b/i,
        /\brefer(ring)? to\b/i,
        /\bexamin(e|ing)?\b/i,
        /\binspect(ing)?\b/i,
        /\breview(ing)?\b/i,
        /\bmonitor(ing)?\b/i,
        /\btrack(ing)?\b/i,
        /\bwatch(ing)?\b/i,
        /\bwait(ing)? for\b/i,
        /\bon it\b/i,
        /\bto do\b/i,
        // === 新增：中文"好的/没问题，我来"类模式 ===
        /好的.?([，,]|我|来)/,                                        // 好的，我来、好的，我帮您
        /(好的|好的嘞|好的呀|好嘞|好啊)[，, ]?(我来|我帮|我给)/,      // 好的，我来帮您
        /(没问题|没问题呀)[，, ]?(我来|我帮|我给)/,                   // 没问题，我来帮你
        /(好的|好的)[，, ]?(我|让我)[帮|给]/,                          // 好的，我帮您
        /(那我们|我们)[，, ]?(先|来)/,                                 // 那我们先、我们来
        /(好的|好)[，, ]?(那|就先)/,                                   // 好的，那先、就先
        /(行|行吧|好的)[，, ]?(我|让我)/,                              // 行吧，我来
        /(嗯|嗯嗯)[，, ]?(我|让我|我来)/,                              // 嗯，我来
        /(OK|ok|Okay|okay)[，, ]?(我|让我)/,                          // OK，我来
        /(明白|懂了)[，, ]?(我|让我|我来)/,                            // 明白，我来
        /(收到|收到)[，, ]?(我|让我|我来)/,                            // 收到，我来
    ];

    // 总结暗示模式
    private static readonly SUMMARY_PATTERNS: RegExp[] = [
        // 中文模式
        /(已经|已|均已).{0,4}(完成|结束|执行完)/,
        /(总结|汇总|综上|以上是|如上)/,
        /任务.{0,4}(完成|结束)/,
        /操作.{0,4}(完成|成功)/,
        /(至此|到此|至今|目前).{0,4}(完成|结束)/,           // 至此完成
        /(全部|所有|均).{0,4}(完成|执行完|结束)/,           // 全部完成
        /以上.{0,4}(就是|便是|为)/,                        // 以上就是
        /这.{0,4}(就是|便是).*结果/,                       // 这就是结果
        /本次.{0,4}(任务|操作).{0,4}(完成|结束)/,           // 本次任务完成
        /(以上就是|便是).{0,10}(结果|总结)/,               // 以上就是结果
        /(结果|答案|信息).{0,4}(如下|在此|在这里)/,         // 结果如下
        /请.{0,4}(查收|查看|参考)/,                        // 请查收
        // 英文模式
        /\b(completed?|finished|done|all set)\b/i,
        /\b(in summary|to summarize|here('s| is) (the|a) summary)\b/i,
        /\b(task (is )?completed?|successfully (completed?|executed?))\b/i,
        /\b(that's (all|it)|we('re| are) done)\b/i,        // that's all, we're done
        /\b(above (is|are)|here (is|are) the result)\b/i,
        // === 新增：总结完成类模式 ===
        /\bwrap up\b/i,
        /\bwind up\b/i,
        /\bfinish up\b/i,
        /\bconclud(e|ing)?\b/i,
        /\bfinaliz(e|ing)?\b/i,
        /\bwrap things up\b/i,
        /\bterminat(e|ing)?\b/i,
        /\bend (it|this|now)\b/i,
        /\bstop (it|here|now)\b/i,
        /\bhalt(ing)?\b/i,
        /\bclose (this|it|up)\b/i,
        /\bhere('s| is) (the|your) (result|answer|information)\b/i,
        /\bplease (see|check|review)\b/i,
        /\bfor your (reference|review)\b/i,
        // === 新增：更多完成类模式 ===
        /\b(all done|that's it|that('s| is) (all|it))\b/i,
        /\bjob done\b/i,
        /\bmission complete\b/i,
        /\bexecution complete\b/i,
        /\bprocess (complete|finished)\b/i,
        /\boperation (complete|finished|done)\b/i,
        /\b(request )?complete\b/i,
        /\bwe('re| are) (all )?set\b/i,
        /\beverything (is )?(done|complete|set)\b/i,
        /\byou('re| are) (all )?set\b/i,
        /\bhere('s| is) everything\b/i,
        /\bthat should be (all|it)\b/i,
        /\bthat should do (it|the trick)\b/i,
        /\blet me know if you need anything else\b/i,
        /\bfeel free to ask\b/i,
        /\bhave a great day\b/i,
        /\bhappy (coding|terminal|computing)\b/i,
    ];

    /**
     * 检测是否是简单对话（问候、闲聊等），不需要工具执行
     * 用于避免对简单问候进行不必要的工具调用循环
     */
    private isSimpleConversation(aiResponse: string, userMessage?: string): boolean {
        if (!aiResponse || aiResponse.length < 2) return false;

        const responseLower = aiResponse.toLowerCase().trim();
        const userLower = userMessage?.toLowerCase().trim() || '';

        // 简单问候模式（更宽松，支持部分匹配和拼写错误）
        const greetingPatterns = [
            // 英文问候（支持部分匹配，如 "ello" -> "hello"）
            /^(h?i|h?ello|hey|greetings|good (morning|afternoon|evening|day))[!.,]?$/i,
            /^(h?i|h?ello|hey)[!.,]?\s*(there|how can i help|what can i do|how are you)/i,
            /^(thanks?|thank you|thx)[!.,]?\s*(for|very much|a lot|so much)?/i,
            /^(you're welcome|no problem|my pleasure|anytime)[!.,]?$/i,
            /^(ok|okay|sure|alright|got it|understood)[!.,]?$/i,
            /^(yes|yeah|yep|no|nope|maybe)[!.,]?$/i,
            // 中文问候
            /^(你好|您好|嗨|哈喽|早上好|下午好|晚上好)[！。，]?$/,
            /^(谢谢|多谢|感谢)[！。，]?/,
            /^(不客气|没关系|没问题)[！。，]?$/,
            /^(好的|明白了|知道了|收到)[！。，]?$/,
            /^(是|不是|对|不对|可能)[！。，]?$/,
        ];

        // 检查用户消息是否是简单问候（支持部分匹配）
        const isUserGreeting = greetingPatterns.some(p => p.test(userLower)) ||
            // 支持拼写错误：ello, hlo, helo 等
            /^(ello|hlo|helo|hii|hiii)[!.,]?$/i.test(userLower) ||
            // 非常短的消息（1-5个字符）很可能是问候
            (userLower.length <= 5 && /^[a-z]+$/i.test(userLower)) ||
            // 精确匹配 "hello"（包括各种大小写和标点）
            /^hello[!.,]?$/i.test(userLower);

        // 检查AI回复是否表示"没有对应的函数"或"无法执行"（说明不需要工具）
        const noFunctionNeeded = /\b(no function|there is no function|unable to|cannot|can't|don't have|doesn't have|没有.*函数|无法.*执行|不能.*执行)/i.test(responseLower) ||
            /\b(unfortunately.*no.*function|however.*no.*function)/i.test(responseLower) ||
            // 匹配 "Unfortunately, there is no function that directly corresponds"
            /\bunfortunately.*there.*is.*no.*function/i.test(responseLower) ||
            // 匹配 "However, I can suggest" (说明没有直接函数，只是建议)
            /\bhowever.*i.*can.*suggest/i.test(responseLower);

        // 检查AI回复是否是简单问候/回应
        const isAiGreeting = greetingPatterns.some(p => p.test(responseLower)) ||
            // 或者AI回复很短且包含问候语
            (responseLower.length < 100 && (
                /\b(hi|hello|hey|greetings|how can i help|what can i do|how are you)\b/i.test(responseLower) ||
                /(你好|您好|嗨|哈喽|我可以|我能帮)/.test(responseLower)
            ));

        // 如果用户是简单问候且AI说没有函数需要，则认为是简单对话
        if (isUserGreeting && noFunctionNeeded) {
            this.logger.debug('Simple conversation: user greeting + AI says no function needed', {
                userMessage: userLower,
                aiResponse: responseLower.substring(0, 100)
            });
            return true;
        }

        // 如果AI明确说没有函数对应，且用户消息很短（可能是问候），也认为是简单对话
        if (noFunctionNeeded && userLower.length <= 10 && !/\b(execut|run|call|invoke|command|命令|执行|运行)/i.test(userLower)) {
            this.logger.debug('Simple conversation: AI says no function + short user message', {
                userMessage: userLower,
                aiResponse: responseLower.substring(0, 100)
            });
            return true;
        }

        // 如果用户和AI都是简单问候，则认为是简单对话
        if (isUserGreeting && isAiGreeting) {
            return true;
        }

        // 如果AI回复很短（少于100字符）且明确表示不需要工具，也是简单对话
        if (responseLower.length < 100 && noFunctionNeeded && !this.hasIncompleteHint(aiResponse)) {
            return true;
        }

        // 如果AI回复很短（少于50字符）且不包含工具相关词汇，也可能是简单对话
        if (responseLower.length < 50 && !this.hasIncompleteHint(aiResponse) && !this.mentionsToolWithoutCalling(aiResponse)) {
            // 检查是否包含明显的工具执行意图
            const hasToolIntent = /\b(execut|run|call|invoke|use tool|使用工具|执行|调用)/i.test(responseLower);
            if (!hasToolIntent) {
                return true;
            }
        }

        return false;
    }

    /**
     * 检测 AI 是否明确表示无法完成任务
     * 用于识别当 AI 说它没有能力或工具来完成请求时，应该终止循环
     */
    private detectCannotComplete(text: string): boolean {
        if (!text || text.length < 10) return false;

        const textLower = text.toLowerCase();

        // 检测明确的"无法完成"表达
        const cannotCompletePatterns = [
            // 英文模式
            /\b(i (don't|do not) have (access to|the ability to|a way to|tools to|the capability to))/i,
            /\b(i (cannot|cant|can't) (access|get|retrieve|obtain|fetch|find|check))/i,
            /\b(there is no (way|tool|function|method|capability) (to|for|that))/i,
            /\b(i (am|'m) (unable|not able) to)/i,
            /\b(i (don't|do not) (have|possess) (the|any) (tools|functions|capabilities|access))/i,
            /\b(no (tool|function|method|way) (is|are) (available|provided|accessible))/i,
            /\b(i (cannot|cant|can't) (help|assist|provide|give|tell) (you|with))/i,
            /\b(sorry,? i (don't|do not|cannot|cant|can't))/i,
            /\b(i (apologize|regret),? (but|however) i (cannot|cant|can't|don't|do not))/i,
            /\b(unfortunately,? i (cannot|cant|can't|don't|do not|am unable))/i,
            /\b(i (wish|would like) (i|to) (could|can),? (but|however))/i,
            /\b(as (an|a) (terminal|command|cli) (assistant|ai|agent),? i (don't|do not|cannot|cant|can't))/i,
            /\b(i (am|'m) (only|just) (a|an) (terminal|command|cli) (assistant|ai|agent))/i,
            /\b(my (capabilities|abilities|tools|functions) (are|is) (limited|restricted) (to|to only))/i,
            /\b(i (can|can only) (help|assist) (with|for) (terminal|command|cli))/i,
            // 中文模式
            /(我没有|无法|不能|不可以)(访问|获取|检索|查找|检查|使用)/,
            /(抱歉|对不起|很遗憾)，?(我|本)(无法|不能|不可以|没有)/,
            /(我|本)(是|只|仅)(一个|一款)(终端|命令行)(助手|AI|代理)/,
            /(我的|本)(功能|工具|能力)(仅限于|只能|只能用于)/,
            /(没有|不存在)(可用的|提供的|可访问的)(工具|功能|方法|方式)/,
        ];

        // 检查是否匹配"无法完成"模式
        const matchesCannotComplete = cannotCompletePatterns.some(pattern => pattern.test(textLower));

        // 额外检查：如果文本很短（< 200字符）且包含"无法"相关词汇，更可能是明确表示无法完成
        if (text.length < 200 && matchesCannotComplete) {
            return true;
        }

        // 检查是否在解释为什么无法完成（通常会有较长的解释）
        if (matchesCannotComplete && (
            textLower.includes('because') ||
            textLower.includes('since') ||
            textLower.includes('as') ||
            textLower.includes('由于') ||
            textLower.includes('因为') ||
            textLower.includes('原因是')
        )) {
            return true;
        }

        return matchesCannotComplete;
    }

    /**
     * 检测 AI 回复中是否提到了工具但没有调用
     * 用于防止 AI 说要执行工具但实际没调用的情况
     */
    private mentionsToolWithoutCalling(text: string): boolean {
        if (!text || text.length < 2) return false;

        // 检测 MCP 工具提及
        const mcpPatterns = [
            /mcp_\w+/i,                           // mcp_xxx 格式的工具名
            /MCP.{0,10}(工具|浏览器|服务)/,       // MCP工具、MCP浏览器
            /浏览器.{0,5}工具/,                   // 浏览器工具
            /使用.{0,10}工具.{0,10}(访问|查询|获取)/, // 使用xxx工具访问
        ];

        // 检测内置工具提及
        const builtinToolPatterns = [
            /write_to_terminal/i,
            /read_terminal_output/i,
            /focus_terminal/i,
            /get_terminal_list/i,
            /apply_patch/i,
            /read_file/i,
            /list_files/i,
            /task_complete/i
        ];

        const allPatterns = [...mcpPatterns, ...builtinToolPatterns];

        return allPatterns.some(p => p.test(text));
    }

    /**
     * 构建 Agent 执行规则系统提示
     * Enhanced version with code-aware tools
     */
    private buildAgentSystemPrompt(): string {
        const workingDir = (this.config.get<string>('agentWorkingDir', '') || '').trim();
        const workingDirLine = workingDir
            ? `\n### Working Directory\nUse ${workingDir} as the root for relative paths. Do not use absolute paths in patches.`
            : '\n### Working Directory\nUse relative paths only (no absolute paths) in patches.';
        return `## Agent Mode - Code-Aware Assistant
You are an intelligent code assistant with terminal operations, code editing, and workspace analysis capabilities. You understand code context and provide context-aware suggestions.

### 🔍 Code Context Tools (Check These First!)
**Before making code changes:**
- get_active_editor_context: See what file user is editing, cursor position, selected code
- get_editor_diagnostics: Check compilation errors and warnings
- get_project_info: Understand project type, dependencies, scripts

**When searching/understanding code:**
- search_code_content: Find patterns across workspace files
- search_symbols: Locate function/class/variable definitions
- find_files: Find files matching glob patterns
- get_definition: Jump to where a symbol is defined (LSP)
- get_references: Find all usages of a symbol (LSP)
- get_type_info: Get type information at a position (LSP)

### 📝 Code Editing Tools
- insert_at_cursor: Insert code at user's cursor position (quick edits)
- replace_selection: Replace selected text (when user has selection)
- apply_patch: Multi-line edits using unified diff format
- read_file/list_files: Inspect files and directories

### 🖥️ Terminal Operations
- write_to_terminal: Execute shell commands (tests, installs, builds)
- read_terminal_output: Get command output
${workingDirLine}

### Recommended Workflow for Code Tasks
1. **Understand context**: Call get_active_editor_context to see what user is working on
2. **Check for errors**: Use get_editor_diagnostics if fixing bugs
3. **Search if needed**: Use search_code_content or search_symbols to understand codebase patterns
4. **Make changes**: Use insert_at_cursor, replace_selection, or apply_patch
5. **Complete**: Call task_complete with summary

### Prohibited Behaviors
❌ Describing tool calls in text (e.g., <invoke>, <parameter> tags)
❌ Outputting JSON instead of real tool calls
❌ Pretending tool execution succeeded without result
❌ Editing files via terminal commands (use code editing tools instead)
❌ Ignoring user's active editor context for code tasks
❌ Asking questions when task is clear

### Best Practices
✅ For "fix this", "add here", "update this" → Check get_active_editor_context first
✅ For "find where X is defined" → Use search_symbols or get_definition
✅ For "fix errors" → Check get_editor_diagnostics first
✅ Wait for actual tool results before responding to user`;
    }

    /**
     * 计算输入的哈希值（用于重复检测）
     */
    private hashInput(input: any): string {
        try {
            const str = JSON.stringify(input);
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;  // 转换为 32 位整数
            }
            return hash.toString(36);
        } catch {
            return Math.random().toString(36);
        }
    }

    private buildAutoPatchFromResponse(responseText: string, lastUserMessage: string): { fileName: string; patch: string } | null {
        if (!this.isFileCreateIntent(lastUserMessage)) {
            return null;
        }
        const codeBlock = this.extractFirstCodeBlock(responseText);
        if (!codeBlock) {
            return null;
        }
        const inferred = this.inferFileName(responseText, codeBlock, lastUserMessage);
        const safeName = (inferred || 'generated_script.py').replace(/^(\.\.\/|\/)+/, '');
        if (!safeName) {
            return null;
        }
        const codeLines = codeBlock.split('\n');
        const patch = [
            `--- /dev/null`,
            `+++ ${safeName}`,
            `@@ -0,0 +1,${codeLines.length} @@`,
            ...codeLines.map(line => `+${line}`),
            ''
        ].join('\n');
        return { fileName: safeName, patch };
    }

    private isFileCreateIntent(message: string): boolean {
        const text = (message || '').toLowerCase();
        return /(create|add|save|write).*(file|script)|create\s+.*\.py|save\s+.*\.py/.test(text);
    }

    private extractFirstCodeBlock(text: string): string | null {
        const match = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/m.exec(text || '');
        if (!match) return null;
        return match[1].replace(/\s+$/g, '');
    }

    private inferFileName(responseText: string, code: string, userText: string): string | null {
        const explicit = /file\s+(?:added:|name(?:d)?|called)?\s*([A-Za-z0-9._-]+\.[A-Za-z0-9]+)/i.exec(responseText);
        if (explicit?.[1]) return explicit[1];
        const fromUser = /([A-Za-z0-9._-]+\.[A-Za-z0-9]+)/.exec(userText);
        if (fromUser?.[1]) return fromUser[1];
        const scriptMatch = /([A-Za-z0-9._-]+\.py)/i.exec(responseText);
        if (scriptMatch?.[1]) return scriptMatch[1];
        const isPython = /^#!.*python|^\s*import\s+|^\s*def\s+/m.test(code);
        return isPython ? 'generated_script.py' : 'generated_file.txt';
    }

    private extractToolCallsFromText(text: string): ToolCall[] {
        const candidates: string[] = [];
        if (text) {
            candidates.push(text.trim());
        }
        const codeBlock = this.extractFirstCodeBlock(text);
        if (codeBlock) {
            candidates.push(codeBlock.trim());
        }

        // Detect apply_patch heredoc blocks (<<EOF ... EOF)
        const heredocPatch = this.extractHeredocPatch(text);
        if (heredocPatch) {
            return [{
                id: this.generateId(),
                name: 'apply_patch',
                input: { patch: heredocPatch }
            }];
        }

        // Detect raw unified diff in plain text
        for (const candidate of candidates) {
            const patch = this.extractUnifiedDiffFromText(candidate);
            if (patch) {
                return [{
                    id: this.generateId(),
                    name: 'apply_patch',
                    input: { patch }
                }];
            }
        }

        for (const candidate of candidates) {
            if (!candidate || !candidate.startsWith('{') || !candidate.endsWith('}')) {
                continue;
            }
            try {
                const payload = JSON.parse(candidate);
                const patchFromPayload = this.extractPatchFromPayload(payload);
                if (patchFromPayload) {
                    return [{
                        id: this.generateId(),
                        name: 'apply_patch',
                        input: { patch: patchFromPayload }
                    }];
                }
            } catch {
                // Ignore parse failures
            }
        }

        return [];
    }

    private extractHeredocPatch(text: string): string | null {
        const lines = text.split('\n');
        let startIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/apply_patch.*<<EOF/i.test(lines[i])) {
                startIdx = i + 1;
                break;
            }
        }
        if (startIdx === -1) return null;
        let endIdx = -1;
        for (let i = startIdx; i < lines.length; i++) {
            if (/^EOF\s*$/i.test(lines[i])) {
                endIdx = i;
                break;
            }
        }
        if (endIdx === -1 || endIdx <= startIdx) return null;
        const codeLines = lines.slice(startIdx, endIdx);
        if (codeLines.length === 0) return null;
        const inferredName = this.inferFileName(text, codeLines.join('\n'), '') || 'generated_file.txt';
        const safeName = inferredName.replace(/^(\.\.\/|\/)+/, '');
        const patch = [
            '--- /dev/null',
            `+++ ${safeName}`,
            `@@ -0,0 +1,${codeLines.length} @@`,
            ...codeLines.map(l => `+${l}`),
            ''
        ].join('\n');
        return patch;
    }

    private extractUnifiedDiffFromText(text: string): string | null {
        const idx = text.indexOf('--- ');
        if (idx === -1) return null;
        // Try to stop at the next blank line after a diff hunk or end of string
        const remainder = text.slice(idx);
        const endIdx = remainder.search(/\n\s*\n/);
        const slice = endIdx === -1 ? remainder.trim() : remainder.slice(0, endIdx).trim();
        if (!slice.includes('\n+++ ')) return null;
        return slice + '\n';
    }

    private buildPatchFromLooseCode(responseText: string, lastUserMessage: string): { fileName: string; patch: string } | null {
        const text = (responseText || '').trim();
        if (!text) return null;

        const looksLikeCode = /(def\s+\w+\s*\(|import\s+\w+)/.test(text) || /param\s*=\s*['"]?-/.test(text);
        if (!looksLikeCode) return null;

        const inferred = this.inferFileName(responseText, '', lastUserMessage) || 'generated_script.py';
        const safeName = inferred.replace(/^(\.\.\/|\/)+/, '');
        const lines = text.split('\n')
            .map(l => l.replace(/^Plan:\s*/i, ''))
            .map(l => l.trimEnd());

        // simple indentation fix: indent lines after a def if they are not indented
        const fixed: string[] = [];
        let inFunc = false;
        for (const line of lines) {
            if (/^\s*def\s+\w+\s*\(/.test(line)) {
                inFunc = true;
                fixed.push(line.trim());
                continue;
            }
            if (inFunc) {
                if (line.trim() === '') {
                    inFunc = false;
                    fixed.push('');
                    continue;
                }
                const alreadyIndented = /^\s+/.test(line);
                fixed.push(alreadyIndented ? line : `    ${line.trim()}`);
            } else {
                fixed.push(line);
            }
        }

        const patch = [
            '--- /dev/null',
            `+++ ${safeName}`,
            `@@ -0,0 +1,${fixed.length} @@`,
            ...fixed.map(l => `+${l}`),
            ''
        ].join('\n');

        return { fileName: safeName, patch };
    }

    private extractPatchFromPayload(payload: any): string | null {
        if (!payload) return null;
        if (typeof payload.patch === 'string') {
            return payload.patch;
        }
        if (Array.isArray(payload.cmd)) {
            const cmd = payload.cmd;
            const applyIndex = cmd.findIndex((item: any) => item === 'apply_patch');
            if (applyIndex === -1) return null;
            const patchIndex = cmd.findIndex((item: any) => item === 'patch');
            if (patchIndex !== -1 && typeof cmd[patchIndex + 1] === 'string') {
                return cmd[patchIndex + 1];
            }
            const lastString = [...cmd].reverse().find((item: any) => typeof item === 'string');
            return typeof lastString === 'string' ? lastString : null;
        }
        return null;
    }

    private isClarificationResponse(text: string): boolean {
        const trimmed = text.trim().toLowerCase();
        if (!trimmed) return false;
        return (
            trimmed.includes('could you') ||
            trimmed.includes('can you') ||
            trimmed.includes('please provide') ||
            trimmed.includes('please share') ||
            trimmed.includes('what would you like') ||
            trimmed.includes('let me know') ||
            trimmed.includes('what code') ||
            trimmed.includes('what content') ||
            trimmed.includes('what should') ||
            trimmed.includes('need more details')
        );
    }
}
