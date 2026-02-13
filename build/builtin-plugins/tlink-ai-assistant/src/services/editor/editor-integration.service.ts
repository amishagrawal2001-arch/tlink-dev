import { Injectable } from '@angular/core';
import { LoggerService } from '../core/logger.service';

/**
 * Editor Integration Service
 * Provides bridge between AI assistant and code editor (VS Code, or other)
 * Handles editor context, diagnostics, LSP queries, and workspace search
 */
@Injectable({ providedIn: 'root' })
export class EditorIntegrationService {
    private vscodeAPI: any = null;
    private messageHandlers = new Map<string, (data: any) => void>();

    constructor(private logger: LoggerService) {
        this.initializeVSCodeAPI();
        this.setupMessageListener();
    }

    /**
     * Initialize VS Code API if available
     */
    private initializeVSCodeAPI(): void {
        try {
            const win: any = window as any;
            // Try to get VS Code API (works in VS Code webviews)
            // First check if vscode object exists
            if (win.vscode) {
                this.vscodeAPI = win.vscode;
            } else if (typeof win.acquireVsCodeApi === 'function') {
                // Call acquireVsCodeApi if it's a function
                this.vscodeAPI = win.acquireVsCodeApi();
            }

            if (this.vscodeAPI) {
                this.logger.info('VS Code API detected');
            } else {
                this.logger.info('VS Code API not available, editor features will use fallbacks');
            }
        } catch (error) {
            this.logger.warn('Failed to initialize VS Code API', error);
        }
    }

    /**
     * Setup listener for messages from extension host
     */
    private setupMessageListener(): void {
        window.addEventListener('message', (event: MessageEvent) => {
            if (event.data.type === 'vscode-response') {
                const handler = this.messageHandlers.get(event.data.requestId);
                if (handler) {
                    handler(event.data.response);
                    this.messageHandlers.delete(event.data.requestId);
                }
            }
        });
    }

    /**
     * Send command to VS Code extension and wait for response
     */
    private async sendCommand(command: string, data: any, timeout: number = 5000): Promise<any> {
        return new Promise((resolve) => {
            if (!this.vscodeAPI) {
                resolve({ error: 'VS Code API not available' });
                return;
            }

            const requestId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            // Set up response handler with cleanup
            const cleanup = () => {
                this.messageHandlers.delete(requestId);
            };

            this.messageHandlers.set(requestId, (response: any) => {
                clearTimeout(timeoutId);
                cleanup();
                resolve(response);
            });

            // Set timeout with cleanup
            const timeoutId = setTimeout(() => {
                cleanup();
                this.logger.warn(`Command timeout: ${command}`, { requestId });
                resolve({ error: `Request timeout after ${timeout}ms` });
            }, timeout);

            try {
                // Send message
                this.vscodeAPI.postMessage({
                    type: 'vscode-command',
                    command,
                    data,
                    requestId
                });
            } catch (error) {
                clearTimeout(timeoutId);
                cleanup();
                this.logger.error('Failed to send command to VS Code', { command, error });
                resolve({ error: 'Failed to send command: ' + (error instanceof Error ? error.message : 'Unknown error') });
            }
        });
    }

    /**
     * Get active editor context
     */
    async getActiveEditorContext(includeSelection: boolean = true, contextLines: number = 10): Promise<any> {
        const response = await this.sendCommand('getActiveEditorContext', {
            includeSelection,
            contextLines
        });

        if (response.error) {
            // Fallback: try to get info from window
            return this.getActiveEditorContextFallback();
        }

        return response;
    }

    /**
     * Fallback method to get editor context without VS Code API
     */
    private async getActiveEditorContextFallback(): Promise<any> {
        // Try to get current file from various sources
        const win: any = window as any;

        // Check if there's any editor state in window
        if (win.editorState || win.activeEditor) {
            const state = win.editorState || win.activeEditor;
            return {
                file: state.file || state.filename,
                language: state.language || 'unknown',
                lineCount: state.lineCount || 0,
                cursorLine: state.cursorLine || 0,
                cursorColumn: state.cursorColumn || 0
            };
        }

        return { error: 'No active editor found' };
    }

    /**
     * Get diagnostics (errors/warnings) for a file
     */
    async getEditorDiagnostics(filePath?: string, severity: string = 'all'): Promise<any> {
        return await this.sendCommand('getEditorDiagnostics', {
            filePath,
            severity
        });
    }

    /**
     * Insert text at cursor position
     */
    async insertAtCursor(text: string, moveCursorToEnd: boolean = true): Promise<any> {
        return await this.sendCommand('insertAtCursor', {
            text,
            moveCursorToEnd
        });
    }

    /**
     * Replace currently selected text
     */
    async replaceSelection(text: string): Promise<any> {
        return await this.sendCommand('replaceSelection', { text });
    }

    /**
     * Search code content across workspace
     */
    async searchCodeContent(
        pattern: string,
        filePattern?: string,
        caseSensitive: boolean = false,
        maxResults: number = 50
    ): Promise<any> {
        const response = await this.sendCommand('searchCodeContent', {
            pattern,
            filePattern,
            caseSensitive,
            maxResults
        });

        if (response.error) {
            // Fallback: use file system search
            return this.searchCodeContentFallback(pattern, filePattern, caseSensitive, maxResults);
        }

        return response;
    }

    /**
     * Fallback search using file system
     */
    private async searchCodeContentFallback(
        pattern: string,
        filePattern?: string,
        caseSensitive: boolean = false,
        maxResults: number = 50
    ): Promise<any> {
        try {
            const fs = (window as any).require?.('fs');
            const path = (window as any).require?.('path');
            const glob = (window as any).require?.('glob');

            if (!fs || !path || !glob) {
                return { error: 'File system not available' };
            }

            // Get workspace root
            const cwd = (window as any).process?.cwd?.() || '.';

            // Find files with exclusions
            const searchPattern = filePattern || '**/*.{ts,js,tsx,jsx,py,java,go,rs}';
            const files = glob.sync(searchPattern, {
                cwd,
                absolute: true,
                nodir: true,
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**']
            });

            if (!files || files.length === 0) {
                return { results: [] };
            }

            const results: any[] = [];

            for (const file of files) {
                if (results.length >= maxResults) break;

                try {
                    const content = fs.readFileSync(file, 'utf-8');
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        // Create fresh regex for each test to avoid state issues
                        const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
                        if (regex.test(lines[i])) {
                            results.push({
                                file: path.relative(cwd, file),
                                line: i,
                                text: lines[i]
                            });

                            if (results.length >= maxResults) break;
                        }
                    }
                } catch (err) {
                    // Skip files that can't be read (binary files, permission issues, etc.)
                    this.logger.debug('Failed to read file during search', { file, error: err });
                }
            }

            return { results };
        } catch (error) {
            this.logger.error('Search fallback failed', error);
            return { error: 'Search failed: ' + (error instanceof Error ? error.message : 'Unknown error') };
        }
    }

    /**
     * Search for symbols in workspace
     */
    async searchSymbols(query: string, kind: string = 'all'): Promise<any> {
        return await this.sendCommand('searchSymbols', {
            query,
            kind
        });
    }

    /**
     * Get project information
     */
    async getProjectInfo(includeDependencies: boolean = true): Promise<any> {
        const response = await this.sendCommand('getProjectInfo', {
            includeDependencies
        });

        if (response.error) {
            // Fallback: try to read package.json or similar
            return this.getProjectInfoFallback(includeDependencies);
        }

        return response;
    }

    /**
     * Fallback method to get project info
     */
    private async getProjectInfoFallback(includeDependencies: boolean): Promise<any> {
        try {
            const fs = (window as any).require?.('fs');
            const path = (window as any).require?.('path');

            if (!fs || !path) {
                return { error: 'File system not available' };
            }

            const cwd = (window as any).process?.cwd?.() || '.';
            const result: any = {
                workspaceRoot: cwd,
                configFiles: []
            };

            // Check for various config files
            const configFilesToCheck = [
                'package.json',
                'tsconfig.json',
                'requirements.txt',
                'Cargo.toml',
                'go.mod',
                'pom.xml',
                'build.gradle',
                'Makefile'
            ];

            for (const configFile of configFilesToCheck) {
                try {
                    const configPath = path.join(cwd, configFile);
                    if (fs.existsSync(configPath)) {
                        result.configFiles.push(configFile);

                        // Detect project type
                        if (configFile === 'package.json' && !result.projectType) {
                            result.projectType = 'Node.js / JavaScript';

                            if (includeDependencies) {
                                try {
                                    const packageJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                                    result.dependencies = {
                                        production: Object.keys(packageJson.dependencies || {}),
                                        development: Object.keys(packageJson.devDependencies || {})
                                    };
                                    result.scripts = packageJson.scripts || {};
                                } catch (err) {
                                    this.logger.warn('Failed to parse package.json', err);
                                }
                            }
                        } else if (configFile === 'requirements.txt' && !result.projectType) {
                            result.projectType = 'Python';
                        } else if (configFile === 'Cargo.toml' && !result.projectType) {
                            result.projectType = 'Rust';
                        } else if (configFile === 'go.mod' && !result.projectType) {
                            result.projectType = 'Go';
                        } else if ((configFile === 'pom.xml' || configFile === 'build.gradle') && !result.projectType) {
                            result.projectType = 'Java';
                        }
                    }
                } catch (err) {
                    // Skip this config file if there's an error
                    this.logger.debug(`Error checking config file ${configFile}`, err);
                }
            }

            return result;
        } catch (error) {
            this.logger.error('Project info fallback failed', error);
            return { error: 'Failed to get project info: ' + (error instanceof Error ? error.message : 'Unknown error') };
        }
    }

    /**
     * Find files matching pattern
     */
    async findFiles(pattern: string, maxResults: number = 100): Promise<any> {
        const response = await this.sendCommand('findFiles', {
            pattern,
            maxResults
        });

        if (response.error) {
            return this.findFilesFallback(pattern, maxResults);
        }

        return response;
    }

    /**
     * Fallback file finder using glob
     */
    private async findFilesFallback(pattern: string, maxResults: number): Promise<any> {
        try {
            const glob = (window as any).require?.('glob');
            const path = (window as any).require?.('path');

            if (!glob || !path) {
                return { error: 'Glob not available' };
            }

            const cwd = (window as any).process?.cwd?.() || '.';
            const files = glob.sync(pattern, {
                cwd,
                absolute: false,
                nodir: true,
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**']
            });

            if (!files || files.length === 0) {
                return { files: [] };
            }

            return {
                files: files.slice(0, maxResults)
            };
        } catch (error) {
            this.logger.error('Find files fallback failed', error);
            return { error: 'Find files failed: ' + (error instanceof Error ? error.message : 'Unknown error') };
        }
    }

    /**
     * Get type information at position (LSP)
     */
    async getTypeInfo(filePath: string, line: number, character: number): Promise<any> {
        return await this.sendCommand('getTypeInfo', {
            filePath,
            line,
            character
        });
    }

    /**
     * Get definition location (LSP)
     */
    async getDefinition(filePath: string, line: number, character: number): Promise<any> {
        return await this.sendCommand('getDefinition', {
            filePath,
            line,
            character
        });
    }

    /**
     * Get references to symbol (LSP)
     */
    async getReferences(
        filePath: string,
        line: number,
        character: number,
        includeDeclaration: boolean = true
    ): Promise<any> {
        return await this.sendCommand('getReferences', {
            filePath,
            line,
            character,
            includeDeclaration
        });
    }

    /**
     * Get hover information (LSP)
     */
    async getHoverInfo(filePath: string, line: number, character: number): Promise<any> {
        return await this.sendCommand('getHoverInfo', {
            filePath,
            line,
            character
        });
    }

    /**
     * Check if VS Code API is available
     */
    isVSCodeAPIAvailable(): boolean {
        return this.vscodeAPI !== null;
    }
}
