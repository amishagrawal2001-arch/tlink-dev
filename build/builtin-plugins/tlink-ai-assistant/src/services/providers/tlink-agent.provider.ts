import { Injectable } from '@angular/core';
import { OpenAiCompatibleProviderService } from './openai-compatible.service';

/**
 * Tlink Agent provider (separate from Tlink Agentic).
 * Uses the OpenAI-compatible flow but keeps its own identity/config.
 */
@Injectable()
export class TlinkAgentProviderService extends OpenAiCompatibleProviderService {
    readonly name: string = 'tlink-agent';
    readonly displayName: string = 'Tlink Agent';
}
