import { Injectable, Optional } from '@angular/core';
import { Observable, of } from 'rxjs';
import { IBaseAiProvider, ProviderConfig, AuthConfig, ProviderCapability, HealthStatus, ValidationResult, ProviderInfo, PROVIDER_DEFAULTS } from '../../types/provider.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse, StreamEvent, MessageRole } from '../../types/ai.types';
import { LoggerService } from '../core/logger.service';
import { scrubSecrets, scrubSecretString } from '../security/secret-scrubber';
import { CircuitBreaker, CircuitBreakerSnapshot, CircuitOpenError } from './circuit-breaker';
import { RequestLogService } from '../core/request-log.service';

/**
 * 基础AI提供商抽象类
 * 所有AI提供商都应该实现此接口
 */
@Injectable()
export abstract class BaseAiProvider implements IBaseAiProvider {
    abstract readonly name: string;
    abstract readonly displayName: string;
    abstract readonly capabilities: ProviderCapability[];
    abstract readonly authConfig: AuthConfig;

    protected config: ProviderConfig | null = null;
    protected isInitialized = false;
    protected lastHealthCheck: { status: HealthStatus; timestamp: Date } | null = null;

    /**
     * Per-provider circuit breaker. Trips after N consecutive non-4xx
     * failures and short-circuits subsequent calls for `cooldownMs` so
     * the user doesn't sit through a 14-second exponential-backoff hang
     * on every chat turn while the upstream is down.
     */
    protected readonly breaker = new CircuitBreaker();

    /**
     * Persistent request-log sink. Optional — providers that don't have
     * it set still log to console via the LoggerService below; this is
     * an additional persistent channel for support-debug exports. Set
     * post-construction via `setRequestLog` (the provider manager wires
     * it up so subclasses don't have to touch their constructors).
     */
    protected requestLog?: RequestLogService

    constructor(protected logger: LoggerService) {}

    /**
     * Inject the persistent request-log sink. Called once after DI
     * construction by AiProviderManagerService — keeps the BaseAiProvider
     * constructor signature stable so the 13 subclasses don't need
     * touched.
     */
    setRequestLog (requestLog: RequestLogService): void {
        this.requestLog = requestLog;
    }

    /**
     * 配置提供商
     */
    configure(config: ProviderConfig): void {
        this.config = { ...config };
        this.isInitialized = true;
        this.logger.debug(`Provider ${this.name} configured`, { config: { ...config, apiKey: '***' } });
    }

    /**
     * 聊天功能 - 必须由子类实现
     */
    abstract chat(request: ChatRequest): Promise<ChatResponse>;

    /**
     * 流式聊天功能 - 必须由子类实现
     */
    abstract chatStream(request: ChatRequest): Observable<StreamEvent>;

    /**
     * 生成命令 - 必须由子类实现
     */
    abstract generateCommand(request: CommandRequest): Promise<CommandResponse>;

    /**
     * 解释命令 - 必须由子类实现
     */
    abstract explainCommand(request: ExplainRequest): Promise<ExplainResponse>;

    /**
     * 分析结果 - 必须由子类实现
     */
    abstract analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;

    /**
     * 健康检查 - 默认实现，子类可以重写
     */
    async healthCheck(): Promise<HealthStatus> {
        try {
            // 1. 验证配置
            const validation = this.validateConfig();
            if (!validation.valid) {
                this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
                return HealthStatus.UNHEALTHY;
            }

            // 2. 执行网络健康检查
            const networkStatus = await this.performNetworkHealthCheck();

            this.lastHealthCheck = {
                status: networkStatus,
                timestamp: new Date()
            };

            return networkStatus;

        } catch (error) {
            this.logError(error, { phase: 'healthCheck' });
            this.lastHealthCheck = { status: HealthStatus.UNHEALTHY, timestamp: new Date() };
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * Free upstream probe — typically a GET to `/models` or similar.
     * Override in providers that have a token-free way to verify
     * connectivity + authorization. Returning `null` (the default)
     * tells `performNetworkHealthCheck` to fall back to the
     * chat-based probe below, which costs 1+ tokens per call.
     *
     * Why this exists: with the 60s health-check cache TTL and a
     * typical session, a user who has 5 providers configured was
     * burning ~5 chat tokens / minute on health checks alone. The
     * `/models` GET endpoint is free on every OpenAI-shape provider
     * (OpenAI, Groq, vLLM, openai-compatible, etc.) so the chat
     * probe should be a fallback, not the default path.
     */
    protected async probeUpstream(): Promise<HealthStatus | null> {
        return null;
    }

    /**
     * 执行网络健康检查 - 发送测试请求
     */
    protected async performNetworkHealthCheck(): Promise<HealthStatus> {
        // Try the free probe first. Errors here log-and-fall-through
        // rather than fail the health check — a /models endpoint that
        // doesn't exist or 404s is just "this provider doesn't support
        // the cheap probe", not a real outage.
        try {
            const probe = await this.probeUpstream();
            if (probe !== null) {
                return probe;
            }
        } catch (probeErr) {
            this.logger.debug(`[${this.name}] free probe failed, falling back to chat probe`, {
                error: probeErr instanceof Error ? probeErr.message : String(probeErr),
            });
        }

        try {
            // Fallback: send a 1-token chat request. Burns a token but
            // works against any provider that exposes /chat/completions.
            const testRequest: ChatRequest = {
                messages: [{
                    id: 'health-check',
                    role: MessageRole.USER,
                    content: 'Hi',
                    timestamp: new Date()
                }],
                maxTokens: 1,
                temperature: 0
            };

            const response = await this.withRetry(() => this.sendTestRequest(testRequest));

            if (this.isSuccessfulResponse(response)) {
                return HealthStatus.HEALTHY;
            } else {
                this.logger.warn(`Health check returned unsuccessful response for ${this.name}`, {
                    response: this.sanitizeResponse(response)
                });
                return HealthStatus.DEGRADED;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 根据错误类型判断状态
            if (errorMessage.includes('timeout') || errorMessage.includes('Timed out')) {
                this.logger.warn(`Health check timed out for ${this.name}`);
                return HealthStatus.DEGRADED;
            }

            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') ||
                errorMessage.includes('invalid') || errorMessage.includes('API key')) {
                this.logger.warn(`Health check authentication failed for ${this.name}`);
                return HealthStatus.UNHEALTHY;
            }

            if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
                this.logger.warn(`Health check rate limited for ${this.name}`);
                return HealthStatus.DEGRADED;
            }

            this.logError(error, { phase: 'performNetworkHealthCheck' });
            return HealthStatus.UNHEALTHY;
        }
    }

    /**
     * 发送测试请求 - 子类必须实现
     */
    protected abstract sendTestRequest(request: ChatRequest): Promise<ChatResponse>;

    /**
     * 验证配置 - 默认实现，子类可以重写
     */
    validateConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 检查必需的配置
        if (!this.config) {
            errors.push('Provider not configured');
            return { valid: false, errors, warnings };
        }

        // 检查API密钥
        if (!this.config.apiKey) {
            errors.push('API key is required');
        }

        // 检查模型
        if (!this.config.model) {
            warnings.push('No model specified, using default');
        }

        // 检查基础URL
        if (!this.config.baseURL) {
            warnings.push('No base URL specified, using provider default');
        }

        // 检查令牌限制
        if (this.config.maxTokens && this.config.maxTokens < 1) {
            errors.push('Max tokens must be greater than 0');
        }

        // 检查温度参数
        if (this.config.temperature !== undefined && (this.config.temperature < 0 || this.config.temperature > 2)) {
            warnings.push('Temperature should be between 0 and 2');
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * 检查是否支持指定能力
     */
    supportsCapability(capability: ProviderCapability): boolean {
        return this.capabilities.includes(capability);
    }

    /**
     * 获取提供商信息
     */
    getInfo(): ProviderInfo {
        return {
            name: this.name,
            displayName: this.displayName,
            version: '1.0.0',
            description: `${this.displayName} AI Provider`,
            capabilities: this.capabilities,
            authConfig: this.authConfig,
            supportedModels: this.config?.model ? [this.config.model] : [],
            configured: this.isInitialized,
            lastHealthCheck: this.lastHealthCheck ?? undefined
        };
    }

    /**
     * 获取当前配置
     */
    getConfig(): ProviderConfig | null {
        return this.config;
    }

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean {
        return this.isInitialized && this.config !== null;
    }

    /**
     * 检查是否启用
     */
    isEnabled(): boolean {
        return this.config?.enabled !== false;
    }

    /**
     * 获取认证头
     */
    protected getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        switch (this.authConfig.type) {
            case 'apiKey':
            case 'bearer':
                if (this.config?.apiKey) {
                    headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                }
                break;

            case 'basic':
                if (this.authConfig.credentials.username && this.authConfig.credentials.password) {
                    const credentials = Buffer.from(
                        `${this.authConfig.credentials.username}:${this.authConfig.credentials.password}`
                    ).toString('base64');
                    headers['Authorization'] = `Basic ${credentials}`;
                }
                break;

            case 'oauth':
                // OAuth 认证预留
                // 当前无提供商使用此认证方式
                // 如需实现，可参考 OAuth 2.0 Authorization Code Flow
                this.logger.debug('OAuth authentication not implemented');
                break;
        }

        return headers;
    }

    /**
     * 获取请求超时时间
     */
    protected getTimeout(): number {
        return this.config?.timeout || 30000; // 默认30秒
    }

    /**
     * 获取重试次数
     */
    protected getRetries(): number {
        return this.config?.retries || 3;
    }

    /**
     * 执行重试逻辑
     *
     * Retries transient failures with exponential backoff, but BAILS
     * immediately on 4xx (except 429) because those won't succeed on
     * retry — they're auth/validation/not-found errors. Retrying them
     * just hides the real error under an "attempts exhausted" message.
     * Respects Retry-After header on 429.
     *
     * Also gated by the per-provider circuit breaker: when an upstream
     * has been hard-down for `threshold` consecutive non-4xx failures,
     * subsequent requests fail FAST with `CircuitOpenError` until the
     * cooldown elapses (one half-open probe is then permitted). 4xx
     * errors don't trip the breaker — those are user/config issues, not
     * provider liveness signals.
     */
    protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
        // Fail-fast path: if the breaker is open and the cooldown hasn't
        // elapsed, don't even try the upstream. Saves the 14-second hang
        // that exponential backoff would otherwise impose.
        if (this.breaker.shouldShortCircuit()) {
            const snap = this.breaker.snapshot();
            throw new CircuitOpenError(this.name, snap.remainingCooldownMs);
        }

        let lastError: Error | null = null;
        const retries = this.getRetries();

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const result = await operation();
                // Success — reset breaker if it was tripped (half-open
                // probe succeeded) or just affirm the closed state.
                this.breaker.recordSuccess();
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Non-retriable: 4xx client errors (except 429 rate limit).
                // These will never succeed on retry — surface immediately
                // and DON'T tell the breaker (user-config errors aren't a
                // liveness signal).
                const status = (error as any)?.response?.status;
                const isClientError = typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
                if (isClientError) {
                    this.logger.warn(`Non-retriable ${status} from upstream, aborting retry loop`, {
                        status,
                        message: lastError.message
                    });
                    throw lastError;
                }

                // Real upstream failure (5xx, network, timeout, 429) —
                // tell the breaker. Log only the first time the breaker
                // trips, not on every subsequent failure.
                const tripped = this.breaker.recordFailure();
                if (tripped) {
                    const snap = this.breaker.snapshot();
                    this.logger.warn(
                        `[${this.name}] circuit breaker OPEN — failing subsequent calls fast for ${Math.ceil(snap.remainingCooldownMs / 1000)}s`,
                        { state: snap.state, consecutiveFailures: snap.consecutiveFailures }
                    );
                }

                if (attempt === retries) {
                    break;
                }

                // Exponential backoff, but respect Retry-After on 429.
                let delay = Math.pow(2, attempt) * 1000;
                if (status === 429) {
                    const retryAfter = (error as any)?.response?.headers?.['retry-after'];
                    const retryAfterMs = this.parseRetryAfter(retryAfter);
                    if (retryAfterMs > 0) {
                        delay = Math.max(delay, retryAfterMs);
                    }
                }

                this.logger.warn(
                    `Operation failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`,
                    { error: lastError.message, status }
                );

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Build an internal AbortController that's also linked to an
     * external cancellation signal — typically `request.signal` passed
     * by the caller. Aborts on either source. Pattern:
     *
     *   const ac = this.createLinkedAbortController(request.signal);
     *   ...
     *   return () => ac.abort();
     *
     * The provider gets its own AbortController for the local
     * Observable-unsubscribe teardown path AND honors any external
     * AbortSignal the caller plumbed through `ChatRequest.signal`.
     * Either side firing aborts the in-flight HTTP request promptly.
     */
    protected createLinkedAbortController(externalSignal?: AbortSignal): AbortController {
        const ac = new AbortController();
        if (externalSignal) {
            if (externalSignal.aborted) {
                ac.abort();
            } else {
                externalSignal.addEventListener('abort', () => ac.abort(), { once: true });
            }
        }
        return ac;
    }

    /**
     * Read-only snapshot of the breaker state. Useful for the Settings
     * UI to surface "Provider unavailable" badges, and for the health-
     * check probe to short-circuit when we already know the upstream
     * is down.
     */
    getBreakerSnapshot (): CircuitBreakerSnapshot {
        return this.breaker.snapshot();
    }

    /**
     * Manual reset — for "I just fixed my API key / VPN / whatever,
     * retry now" UI buttons. The breaker is otherwise self-healing via
     * the half-open probe path; this just bypasses the wait.
     */
    resetBreaker (): void {
        this.breaker.reset();
    }

    private parseRetryAfter(header: string | number | undefined): number {
        if (header == null) return 0;
        if (typeof header === 'number') return header * 1000;
        const seconds = parseInt(String(header), 10);
        if (!isNaN(seconds)) return seconds * 1000;
        const dateMs = Date.parse(String(header));
        if (!isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
        return 0;
    }

    /**
     * 记录请求
     */
    protected logRequest(request: any): void {
        const sanitized = this.sanitizeRequest(request);
        this.logger.debug(`[${this.name}] Request`, { request: sanitized });
        // Fire-and-forget — the persistent log shouldn't gate the
        // request path on its own success. The service does its own
        // scrub-at-write (defensive) so even if `sanitized` somehow
        // missed something, the on-disk store is still safe.
        this.requestLog?.record({
            timestamp: Date.now(),
            provider: this.name,
            kind: 'request',
            label: this.kindOf(request),
            payload: sanitized,
        }).catch(() => { /* logging is best-effort */ });
    }

    /**
     * 记录响应
     */
    protected logResponse(response: any): void {
        const sanitized = this.sanitizeResponse(response);
        this.logger.debug(`[${this.name}] Response`, { response: sanitized });
        this.requestLog?.record({
            timestamp: Date.now(),
            provider: this.name,
            kind: 'response',
            payload: sanitized,
        }).catch(() => { /* logging is best-effort */ });
    }

    /**
     * 记录错误
     */
    protected logError(error: any, context?: any): void {
        const raw = error instanceof Error ? error.message : String(error);
        // Use the shared scrubber (in src/services/security/secret-scrubber)
        // rather than maintaining a parallel narrower copy here. The
        // shared one covers Groq, xAI, HuggingFace, Replicate, JWTs, etc.
        // — everything the providers under this base class talk to.
        const scrubbed = {
            error: scrubSecretString(raw),
            stack: error instanceof Error ? scrubSecretString(error.stack ?? '') : undefined,
            context,
        };
        this.logger.error(`[${this.name}] Error`, scrubbed);
        this.requestLog?.record({
            timestamp: Date.now(),
            provider: this.name,
            kind: 'error',
            payload: scrubbed,
        }).catch(() => { /* logging is best-effort */ });
    }

    /**
     * Best-effort label for a request — a short string like "chat",
     * "chatStream", "generateCommand". Used in the persistent log so a
     * dev scanning the export can filter by request type. Falls back
     * to "unknown" when we can't tell — better that than nothing.
     */
    private kindOf(request: any): string | undefined {
        if (!request || typeof request !== 'object') return undefined;
        if (Array.isArray((request as any).messages)) return 'chat';
        if ((request as any).command) return 'explainCommand';
        if ((request as any).prompt) return 'generateCommand';
        if ((request as any).result) return 'analyzeResult';
        return undefined;
    }

    /**
     * Remove credentials from request data before logging. Previously only
     * scrubbed top-level `apiKey` and one header — messages could still
     * carry `curl -H "Authorization: Bearer …"` or equivalent inside the
     * user's prompt, and that would flow to dev consoles untouched. Now
     * runs the full recursive secret scrubber which catches credential
     * patterns regardless of nesting depth.
     */
    protected sanitizeRequest(request: any): any {
        const base = { ...(request || {}) };
        if (base.apiKey) base.apiKey = '***';
        if (base.headers?.Authorization) base.headers = { ...base.headers, Authorization: '***' };
        return scrubSecrets(base);
    }

    /**
     * Remove credentials from response data before logging.
     */
    protected sanitizeResponse(response: any): any {
        const base = { ...(response || {}) };
        if (base.data?.apiKey) base.data = { ...base.data, apiKey: '***' };
        return scrubSecrets(base);
    }

    /**
     * 获取基础URL
     */
    protected getBaseURL(): string {
        if (this.config?.baseURL) {
            return this.config.baseURL;
        }
        // 从统一默认值获取
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.baseURL || '';
    }

    /**
     * 获取默认模型
     */
    protected getDefaultModel(): string {
        if (this.config?.model) {
            return this.config.model;
        }
        // 从统一默认值获取
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.model || 'default';
    }

    /**
     * 获取默认超时时间
     */
    protected getDefaultTimeout(): number {
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.timeout || 30000;
    }

    /**
     * 获取默认重试次数
     */
    protected getDefaultRetries(): number {
        const defaults = PROVIDER_DEFAULTS[this.name];
        return defaults?.retries || 3;
    }

    /**
     * 转换聊天消息格式 - 子类可以重写
     */
    protected transformMessages(messages: any[]): any[] {
        return messages;
    }

    /**
     * 转换响应格式 - 子类可以重写
     */
    protected transformResponse(response: any): ChatResponse {
        // 默认实现，子类应该重写
        return {
            message: {
                id: this.generateId(),
                role: 'assistant' as any,
                content: typeof response === 'string' ? response : JSON.stringify(response),
                timestamp: new Date()
            }
        };
    }

    /**
     * 生成唯一ID
     */
    protected generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 检查响应是否成功
     */
    protected isSuccessfulResponse(response: any): boolean {
        return response && !response.error;
    }

    /**
     * 提取错误信息
     */
    protected extractError(response: any): string {
        if (response.error?.message) {
            return response.error.message;
        }
        if (response.message) {
            return response.message;
        }
        if (typeof response === 'string') {
            return response;
        }
        return 'Unknown error';
    }

    // ==================== 通用命令处理方法 ====================

    /**
     * 构建命令生成提示 - 通用实现
     */
    protected buildCommandPrompt(request: CommandRequest): string {
        let prompt = `Convert the following natural language request into an accurate terminal command:\n\n"${request.naturalLanguage}"\n\n`;

        if (request.context) {
            prompt += `Current environment:\n`;
            if (request.context.currentDirectory) {
                prompt += `- Current directory: ${request.context.currentDirectory}\n`;
            }
            if (request.context.operatingSystem) {
                prompt += `- Operating system: ${request.context.operatingSystem}\n`;
            }
            if (request.context.shell) {
                prompt += `- Shell: ${request.context.shell}\n`;
            }
        }

        prompt += `\nReturn JSON only:\n`;
        prompt += `{\n`;
        prompt += `  "command": "the command",\n`;
        prompt += `  "explanation": "Command explanation",\n`;
        prompt += `  "confidence": 0.95\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 构建Command explanation提示 - 通用实现
     */
    protected buildExplainPrompt(request: ExplainRequest): string {
        let prompt = `Explain the following terminal command in detail:\n\n\`${request.command}\`\n\n`;

        if (request.context?.currentDirectory) {
            prompt += `Current directory: ${request.context.currentDirectory}\n`;
        }
        if (request.context?.operatingSystem) {
            prompt += `Operating system: ${request.context.operatingSystem}\n`;
        }

        prompt += `\nReturn JSON only:\n`;
        prompt += `{\n`;
        prompt += `  "explanation": "overall explanation",\n`;
        prompt += `  "breakdown": [\n`;
        prompt += `    {"part": "command part", "description": "details"}\n`;
        prompt += `  ],\n`;
        prompt += `  "examples": ["example usage"]\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 构建结果分析提示 - 通用实现
     */
    protected buildAnalysisPrompt(request: AnalysisRequest): string {
        let prompt = `Analyze the following command execution result:\n\n`;
        prompt += `Command: ${request.command}\n`;
        prompt += `Exit code: ${request.exitCode}\n`;
        prompt += `Output:\n${request.output}\n\n`;

        if (request.context?.workingDirectory) {
            prompt += `Working directory: ${request.context.workingDirectory}\n`;
        }

        prompt += `\nReturn JSON only:\n`;
        prompt += `{\n`;
        prompt += `  "summary": "summary",\n`;
        prompt += `  "insights": ["insight 1", "insight 2"],\n`;
        prompt += `  "success": true/false,\n`;
        prompt += `  "issues": [\n`;
        prompt += `    {"severity": "warning|error|info", "message": "issue description", "suggestion": "suggestion"}\n`;
        prompt += `  ]\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 解析命令响应 - 通用实现
     */
    protected parseCommandResponse(content: string): CommandResponse {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    command: parsed.command || '',
                    explanation: parsed.explanation || '',
                    confidence: parsed.confidence || 0.5
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse command response as JSON', error);
        }

        // 备用解析
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        return {
            command: lines[0] || '',
            explanation: lines.slice(1).join(' ') || 'AI-generated command',
            confidence: 0.5
        };
    }

    /**
     * 解析解释响应 - 通用实现
     */
    protected parseExplainResponse(content: string): ExplainResponse {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    explanation: parsed.explanation || '',
                    breakdown: parsed.breakdown || [],
                    examples: parsed.examples || []
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse explain response as JSON', error);
        }

        return {
            explanation: content,
            breakdown: []
        };
    }

    /**
     * 解析分析响应 - 通用实现
     */
    protected parseAnalysisResponse(content: string): AnalysisResponse {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    summary: parsed.summary || '',
                    insights: parsed.insights || [],
                    success: parsed.success !== false,
                    issues: parsed.issues || []
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse analysis response as JSON', error);
        }

        return {
            summary: content,
            insights: [],
            success: true
        };
    }

    /**
     * 获取默认系统提示 - 子类可重写
     */
    protected getDefaultSystemPrompt(): string {
        return `You are a professional terminal command assistant, running in Tlink terminal.

## Core capabilities
You can use the following tools to operate the terminal:
- write_to_terminal: write and execute a command
- read_terminal_output: read terminal output
- get_terminal_list: list all terminals
- get_terminal_cwd: get the current working directory
- focus_terminal: switch to a terminal by index (requires terminal_index)
- get_terminal_selection: get selected text in the terminal

## Important rules
1. When the user requests executing a command (e.g., "show current directory", "list files"), you must use write_to_terminal.
2. **When the user requests switching terminals (e.g., "switch to terminal 0", "open terminal 4"), you must use focus_terminal.**
3. Do not just describe what you will do—call the tool directly.
4. After executing a command, use read_terminal_output and report the result.
5. If unsure about the current directory or terminal state, call get_terminal_cwd or get_terminal_list first.
6. **Never pretend to execute actions—always call the tool.**

## Command execution strategy
### Fast commands (no extra wait)
- dir, ls, cd, pwd, echo, cat, type, mkdir, rm, copy, move
- These usually complete within 500ms.

### Slow commands (wait for full output)
- systeminfo, ipconfig, netstat: wait 3-8 seconds
- npm, yarn, pip, docker: wait 5-10 seconds
- git: wait 3+ seconds
- ping, tracert: may need 10+ seconds

**For slow commands**:
1. After executing, the system will wait automatically.
2. If output seems incomplete, call read_terminal_output again.
3. **Do not guess output—always use the actual read output.**

## Examples
User: "List files in the current directory"
Correct: call write_to_terminal with { "command": "dir", "execute": true }
Incorrect: reply "I will run dir"

User: "Switch to terminal 4"
Correct: call focus_terminal with { "terminal_index": 4 }
Incorrect: reply "Switched to terminal 4" (without a tool call)`;
    }
}
