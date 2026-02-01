import { Injectable } from '@angular/core';
import { OllamaProviderService } from './ollama-provider.service';
import { ValidationResult, AuthConfig } from '../../types/provider.types';

/**
 * Ollama Cloud AI provider
 * Uses Ollama cloud API with bearer token auth
 */
@Injectable()
export class OllamaCloudProviderService extends OllamaProviderService {
    readonly name: string = 'ollama-cloud';
    readonly displayName: string = 'Ollama Cloud';
    readonly authConfig: AuthConfig = {
        type: 'bearer' as const,
        credentials: {}
    };

    /**
     * Validate config - API key required for cloud
     */
    override validateConfig(): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!this.config?.apiKey) {
            errors.push('API key is required');
        }

        if (!this.config?.model) {
            warnings.push('No model specified, using default');
        }

        if (!this.config?.baseURL) {
            warnings.push('No base URL specified, using provider default');
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
}
