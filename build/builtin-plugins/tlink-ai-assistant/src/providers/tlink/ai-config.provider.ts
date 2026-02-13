import { Injectable } from '@angular/core';
import { ConfigProvider, Platform } from 'tlink-core';
import { ConfigProviderService } from '../../services/core/config-provider.service';

/**
 * Tlink configuration provider
 * Provides AI assistant configuration management for Tlink
 */
@Injectable()
export class AiConfigProvider extends ConfigProvider {
    /**
     * Default configuration
     */
    defaults = {
        hotkeys: {
            'ai-assistant-toggle': ['Ctrl-Shift-A'],
            'ai-command-generation': ['Ctrl-Shift-G'],
            'ai-explain-command': ['Ctrl-Shift-E'],
        },
        aiAssistant: {
            enabled: true,
            defaultProvider: 'ollama', // Use local Ollama by default (no API key needed)
            autoSuggestCommands: true,
            enableSecurityChecks: true,
            providers: {
                openai: {
                    apiKey: '',
                    model: 'gpt-3.5-turbo',
                    baseURL: 'https://api.openai.com/v1'
                },
                anthropic: {
                    apiKey: '',
                    model: 'claude-3-sonnet',
                    baseURL: 'https://api.anthropic.com'
                },
                minimax: {
                    apiKey: '',
                    model: 'deepseek-chat',
                    baseURL: 'https://api.deepseek.com'
                },
                glm: {
                    apiKey: '',
                    model: 'glm-4',
                    baseURL: 'https://open.bigmodel.cn/api/paas/v4'
                },
                openaiCompatible: {
                    apiKey: '',
                    model: 'gpt-3.5-turbo',
                    baseURL: ''
                },
                groq: {
                    apiKey: '', // User must provide their own API key
                    model: 'llama-3.1-8b-instant',
                    baseURL: 'https://api.groq.com/openai/v1'
                },
                ollama: {
                    apiKey: '', // Not needed for local Ollama
                    model: 'llama3.1:8b',
                    baseURL: 'http://localhost:11434/v1'
                },
                'tlink-agentic': {
                    apiKey: '', // Not needed - proxy handles auth
                    model: 'auto',
                    baseURL: 'http://localhost:3052/v1' // Local proxy for testing
                },
                'tlink-agent': {
                    apiKey: '',
                    model: 'auto',
                    baseURL: 'http://localhost:3052/v1'
                },
                // Legacy alias for backward compatibility; will be migrated to tlink-agentic at runtime
                'tlink-proxy': {
                    apiKey: '',
                    model: 'auto',
                    baseURL: 'http://localhost:3052/v1'
                }
            },
            security: {
                passwordProtection: false,
                riskAssessmentLevel: 'medium',
                consentPersistenceDays: 30
            }
        }
    };

    /**
     * Platform-specific default configuration
     */
    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                'ai-assistant-toggle': ['⌘-Shift-A'],
                'ai-command-generation': ['⌘-Shift-G'],
                'ai-explain-command': ['⌘-Shift-E'],
            }
        }
    };

    constructor(
        private configService: ConfigProviderService
    ) {
        super();
    }
}
