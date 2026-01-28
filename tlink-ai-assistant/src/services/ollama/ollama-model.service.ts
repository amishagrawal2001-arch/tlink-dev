import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { LoggerService } from '../core/logger.service';

/**
 * Ollama model information
 */
export interface OllamaModel {
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details?: {
        parent_model?: string;
        format?: string;
        family?: string;
        families?: string[];
        parameter_size?: string;
        quantization_level?: string;
    };
}

/**
 * Model pull progress
 */
export interface ModelPullProgress {
    model: string;
    status: 'pulling' | 'downloading' | 'verifying' | 'complete' | 'error';
    progress?: number;
    total?: number;
    completed?: number;
    message?: string;
}

/**
 * Service for managing Ollama models
 */
@Injectable({ providedIn: 'root' })
export class OllamaModelService {
    private baseURL = 'http://localhost:11434';

    constructor(private logger: LoggerService) {}

    /**
     * Get base URL from Ollama provider config or use default
     */
    setBaseURL(url: string): void {
        // Normalize URL - remove /v1, /api/chat, etc.
        this.baseURL = url
            .replace(/\/v1\/chat\/completions.*$/i, '')
            .replace(/\/api\/chat.*$/i, '')
            .replace(/\/v1\/?$/i, '')
            .replace(/\/+$/, '') || 'http://localhost:11434';
    }

    /**
     * Get all installed models
     */
    async getInstalledModels(): Promise<OllamaModel[]> {
        try {
            const response = await fetch(`${this.baseURL}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            return data.models || [];
        } catch (error) {
            this.logger.error('Failed to get installed models', error);
            throw error;
        }
    }

    /**
     * Pull a model from Ollama
     * Returns an Observable that emits progress updates
     */
    pullModel(modelName: string): Observable<ModelPullProgress> {
        const progressSubject = new Subject<ModelPullProgress>();

        (async () => {
            try {
                this.logger.info('Starting model pull', { model: modelName });

                // Emit initial status
                progressSubject.next({
                    model: modelName,
                    status: 'pulling',
                    message: 'Initializing...'
                });

                const response = await fetch(`${this.baseURL}/api/pull`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: modelName }),
                    signal: AbortSignal.timeout(3600000) // 1 hour timeout
                });

                if (!response.ok) {
                    throw new Error(`Failed to pull model: ${response.status}`);
                }

                // Handle streaming response
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();

                if (!reader) {
                    throw new Error('No response body');
                }

                let buffer = '';
                let totalBytes = 0;
                let completedBytes = 0;
                let currentLayerProgress = 0;
                let currentLayerTotal = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        try {
                            const data = JSON.parse(line);
                            
                            // Handle errors
                            if (data.error) {
                                throw new Error(data.error);
                            }
                            
                            // Parse progress information
                            if (data.status) {
                                let progressStatus: ModelPullProgress['status'] = 'pulling';
                                let progress = 0;
                                let total = 0;
                                let completed = 0;
                                let message = data.status;

                                // Determine status type
                                if (data.status.includes('pulling manifest')) {
                                    progressStatus = 'pulling';
                                    message = 'Pulling manifest...';
                                } else if (data.status.startsWith('pulling ') && data.digest) {
                                    // This is a layer being pulled
                                    progressStatus = 'downloading';
                                    currentLayerTotal = data.total || 0;
                                    currentLayerProgress = data.completed || 0;
                                    
                                    // Update overall progress (estimate based on current layer)
                                    if (currentLayerTotal > 0) {
                                        // For now, use current layer progress as overall estimate
                                        // In reality, we'd need to know total layers, but this gives a better UX
                                        total = currentLayerTotal;
                                        completed = currentLayerProgress;
                                        progress = Math.round((completed / total) * 100);
                                        message = `Downloading layer... ${progress}%`;
                                    } else {
                                        message = `Pulling layer ${data.digest.substring(0, 12)}...`;
                                    }
                                } else if (data.status.includes('downloading')) {
                                    progressStatus = 'downloading';
                                    if (data.completed && data.total) {
                                        completed = data.completed;
                                        total = data.total;
                                        progress = Math.round((completed / total) * 100);
                                        message = `Downloading... ${progress}%`;
                                    }
                                } else if (data.status.includes('verifying')) {
                                    progressStatus = 'verifying';
                                    message = 'Verifying download...';
                                } else if (data.status.includes('writing')) {
                                    progressStatus = 'verifying';
                                    message = 'Writing files...';
                                }

                                // Emit progress update
                                progressSubject.next({
                                    model: modelName,
                                    status: progressStatus,
                                    progress,
                                    total,
                                    completed,
                                    message: message
                                });
                            }

                            // Check if complete
                            if (data.status === 'success') {
                                progressSubject.next({
                                    model: modelName,
                                    status: 'complete',
                                    progress: 100,
                                    message: 'Model downloaded successfully'
                                });
                                progressSubject.complete();
                                this.logger.info('Model pull completed', { model: modelName });
                                return;
                            }
                        } catch (parseError) {
                            // Skip invalid JSON lines
                            if (parseError instanceof SyntaxError) {
                                continue;
                            }
                            // Re-throw non-JSON errors
                            throw parseError;
                        }
                    }
                }

                // If we get here, mark as complete
                progressSubject.next({
                    model: modelName,
                    status: 'complete',
                    progress: 100,
                    message: 'Model downloaded successfully'
                });
                progressSubject.complete();

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error('Model pull failed', { model: modelName, error: errorMessage });
                progressSubject.next({
                    model: modelName,
                    status: 'error',
                    message: errorMessage
                });
                progressSubject.error(error);
            }
        })();

        return progressSubject.asObservable();
    }

    /**
     * Delete a model
     */
    async deleteModel(modelName: string): Promise<void> {
        try {
            const response = await fetch(`${this.baseURL}/api/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName }),
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete model: ${response.status} - ${errorText}`);
            }

            this.logger.info('Model deleted', { model: modelName });
        } catch (error) {
            this.logger.error('Failed to delete model', { model: modelName, error });
            throw error;
        }
    }

    /**
     * Get model information
     */
    async getModelInfo(modelName: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseURL}/api/show`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName }),
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Failed to get model info: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            this.logger.error('Failed to get model info', { model: modelName, error });
            throw error;
        }
    }

    /**
     * Format model size for display
     */
    formatModelSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
}
