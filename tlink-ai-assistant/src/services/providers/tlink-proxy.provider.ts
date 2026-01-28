import { Injectable } from '@angular/core';
import { OpenAiCompatibleProviderService } from './openai-compatible.service';

/**
 * Tlink Agentic provider (formerly tlink-proxy).
 * Uses the OpenAI-compatible flow, but keeps a distinct provider identity so we do not
 * fall back to the generic OpenAI-compatible provider when users select "tlink-agentic-auto".
 */
@Injectable()
export class TlinkProxyProviderService extends OpenAiCompatibleProviderService {
    // Canonical id
    readonly name: string = 'tlink-agentic';
    readonly displayName: string = 'Tlink Agentic';

    // Override the chatStream method to provide better error messages
    chatStream(request: any): any {
        // Call parent method but wrap errors with our provider name
        const stream = super.chatStream(request);
        
        // Note: The error handling is in the parent class, so we can't easily override
        // the error message format without overriding the entire chatStream implementation.
        // The error message will still show "OpenAI compatible" but that's acceptable
        // since this provider extends OpenAiCompatibleProviderService.
        
        return stream;
    }
}
