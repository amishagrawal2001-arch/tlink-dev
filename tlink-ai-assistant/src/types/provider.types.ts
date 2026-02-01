/**
 * AI provider related type definitions
 */

import { Observable } from 'rxjs';
import { ProviderCapability, HealthStatus, ValidationResult } from './ai.types';
import { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse } from './ai.types';

// Re-export related types
export { ProviderCapability, HealthStatus, ValidationResult };
export { ChatRequest, ChatResponse, CommandRequest, CommandResponse, ExplainRequest, ExplainResponse, AnalysisRequest, AnalysisResponse };

// ==================== Authentication Configuration ====================

export type AuthType = 'apiKey' | 'bearer' | 'basic' | 'oauth' | 'none';

export interface AuthConfig {
    type: AuthType;
    credentials: Record<string, string>;
    requiresEncryption?: boolean;
}

// ==================== Provider Configuration ====================

export interface ProviderConfig {
    name: string;
    displayName: string;
    apiKey?: string;
    baseURL?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
    retries?: number;
    authConfig?: AuthConfig;
    enabled?: boolean;
    contextWindow?: number;  // Provider context window limit
    disableStreaming?: boolean;  // Disable streaming response (for OpenAI compatible sites that do not support streaming)
}

// Provider default configuration
export interface ProviderDefaults {
    baseURL: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
    retries: number;
    contextWindow: number;
    authConfig: AuthConfig;
    displayName?: string;
}

// All known providers and their default configurations
export const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
    openai: {
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    anthropic: {
        baseURL: 'https://api.anthropic.com',
        model: 'claude-3-sonnet',
        maxTokens: 1000,
        temperature: 1.0,
        timeout: 30000,
        retries: 3,
        contextWindow: 200000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    minimax: {
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        maxTokens: 1000,
        temperature: 1.0,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    glm: {
        baseURL: 'https://open.bigmodel.cn/api/anthropic',
        model: 'glm-4.6',
        maxTokens: 1000,
        temperature: 0.95,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    ollama: {
        baseURL: 'http://localhost:11434',  // Use native API by default (can be changed to /v1 for OpenAI-compatible)
        model: 'llama3.1',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 8192,
        authConfig: { type: 'none', credentials: {} }
    },
    'ollama-cloud': {
        baseURL: 'https://ollama.com/api',
        model: 'gpt-oss:120b',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} },
        displayName: 'Ollama Cloud'
    },
    vllm: {
        baseURL: 'http://localhost:8000/v1',
        model: 'mistralai/Mistral-7B-Instruct-v0.3',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 8192,
        authConfig: { type: 'bearer', credentials: {} }
    },
    'openai-compatible': {
        baseURL: 'http://localhost:11434/v1',
        model: 'gpt-3.5-turbo',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'bearer', credentials: {} }
    },
    groq: {
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'llama-3.1-8b-instant',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 32768,
        authConfig: { type: 'bearer', credentials: {} }
    },
    'tlink-agentic': {
        baseURL: 'http://localhost:3052/v1',
        model: 'auto',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'none', credentials: {} },  // No API key needed - proxy handles auth
        displayName: 'Tlink Agentic'
    },
    // Separate agent provider (keeps its own config)
    'tlink-agent': {
        baseURL: 'http://localhost:3052/v1',
        model: 'auto',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'none', credentials: {} },
        displayName: 'Tlink Agent'
    },
    // Legacy alias kept for backward compatibility; will be normalized to tlink-agentic
    'tlink-proxy': {
        baseURL: 'http://localhost:3052/v1',
        model: 'auto',
        maxTokens: 1000,
        temperature: 0.7,
        timeout: 30000,
        retries: 3,
        contextWindow: 128000,
        authConfig: { type: 'none', credentials: {} },
        displayName: 'Tlink Agentic (legacy id)'
    }
};

// Configuration utility functions
export namespace ProviderConfigUtils {
    /**
     * Fill configuration with default values
     */
    export function fillDefaults(config: Partial<ProviderConfig>, providerName: string): ProviderConfig {
        // Normalize legacy ids
        const canonicalName = (providerName === 'tlink-proxy')
            ? 'tlink-agentic'
            : providerName;
        const defaults = PROVIDER_DEFAULTS[canonicalName] || PROVIDER_DEFAULTS[providerName];
        if (!defaults) {
            throw new Error(`Unknown provider: ${providerName}`);
        }

        // Normalize legacy display names for tlink Agentic
        let displayName = config.displayName || defaults.displayName || canonicalName;
        if (providerName === 'tlink-proxy' || canonicalName === 'tlink-agentic') {
            const legacy = displayName?.toLowerCase() || '';
            if (!displayName || legacy.includes('tlink edge')) {
                displayName = 'Tlink Agentic';
            }
        }

        return {
            name: config.name || canonicalName,
            displayName,
            apiKey: config.apiKey,
            baseURL: config.baseURL || defaults.baseURL,
            model: config.model || defaults.model,
            maxTokens: config.maxTokens ?? defaults.maxTokens,
            temperature: config.temperature ?? defaults.temperature,
            timeout: config.timeout ?? defaults.timeout,
            retries: config.retries ?? defaults.retries,
            authConfig: config.authConfig || defaults.authConfig,
            enabled: config.enabled ?? true,
            contextWindow: config.contextWindow ?? defaults.contextWindow
        };
    }

    /**
     * Check if configuration is complete (can be used for API calls)
     */
    export function isConfigComplete(config: ProviderConfig): boolean {
        return !!(
            config.name &&
            config.displayName &&
            // API key is not required (e.g., local services)
            (config.apiKey || config.authConfig?.type === 'none') &&
            config.baseURL
        );
    }

    /**
     * Clone configuration (deep copy, optionally remove sensitive information)
     */
    export function cloneConfig(config: ProviderConfig, maskApiKey = true): ProviderConfig {
        const clone = { ...config };
        if (maskApiKey && clone.apiKey) {
            clone.apiKey = '***MASKED***';
        }
        return clone;
    }

    /**
     * Get provider default configuration
     */
    export function getDefaults(providerName: string): ProviderDefaults | undefined {
        return PROVIDER_DEFAULTS[providerName];
    }

    /**
     * Get all known provider names
     */
    export function getKnownProviders(): string[] {
        return Object.keys(PROVIDER_DEFAULTS);
    }

    /**
     * Check if it's a known provider
     */
    export function isKnownProvider(name: string): boolean {
        return name in PROVIDER_DEFAULTS;
    }
}

// ==================== Provider Information ====================

export interface ProviderPricing {
    type: 'free' | 'paid' | 'freemium';
    currency: string;
    unit: string;
    costPerUnit?: number;
}

export interface ProviderInfo {
    name: string;
    displayName: string;
    version: string;
    description: string;
    capabilities: ProviderCapability[];
    authConfig: AuthConfig;
    supportedModels: string[];
    configured?: boolean;
    lastHealthCheck?: { status: HealthStatus; timestamp: Date };
    pricing?: ProviderPricing;
    documentation?: string;
    defaults?: ProviderDefaults;
}

// ==================== Base AI Provider Interface ====================

export interface IBaseAiProvider {
    readonly name: string;
    readonly displayName: string;
    readonly capabilities: ProviderCapability[];
    readonly authConfig: AuthConfig;

    // Configuration & Status
    configure(config: ProviderConfig): void;
    getConfig(): ProviderConfig | null;
    isConfigured(): boolean;
    isEnabled(): boolean;

    // Core Features
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatStream(request: ChatRequest): Observable<any>;
    generateCommand(request: CommandRequest): Promise<CommandResponse>;
    explainCommand(request: ExplainRequest): Promise<ExplainResponse>;
    analyzeResult(request: AnalysisRequest): Promise<AnalysisResponse>;

    // Health & Validation
    healthCheck(): Promise<HealthStatus>;
    validateConfig(): ValidationResult;

    // Information Query
    getInfo(): ProviderInfo;
    supportsCapability(capability: ProviderCapability): boolean;
}

// ==================== Provider Manager ====================

export interface ProviderManager {
    registerProvider(provider: IBaseAiProvider): void;
    unregisterProvider(name: string): void;
    getProvider(name: string): IBaseAiProvider | undefined;
    getAllProviders(): IBaseAiProvider[];
    getActiveProvider(): IBaseAiProvider | undefined;
    setActiveProvider(name: string): boolean;
    getProviderInfo(name: string): ProviderInfo | undefined;
    getAllProviderInfo(): ProviderInfo[];
}

// ==================== Provider Events ====================

export interface ProviderEvent {
    type: 'connected' | 'disconnected' | 'error' | 'config_changed' | 'health_changed';
    provider: string;
    timestamp: Date;
    data?: any;
}

export type ProviderEventListener = (event: ProviderEvent) => void;

// ==================== Convenience Types ====================

export type BaseAiProvider = IBaseAiProvider;
