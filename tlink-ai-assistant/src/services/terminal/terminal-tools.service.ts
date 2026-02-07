import { Injectable } from '@angular/core';
import { TerminalManagerService, TerminalInfo } from './terminal-manager.service';
import { LoggerService } from '../core/logger.service';
import { ConfigProviderService } from '../core/config-provider.service';
import { EditorIntegrationService } from '../editor/editor-integration.service';

/**
 * Terminal tool definitions
 */
export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

/**
 * Tool call request
 */
export interface ToolCall {
    id: string;
    name: string;
    input: Record<string, any>;
}

/**
 * Tool call result
 */
export interface ToolResult {
    tool_use_id: string;
    content: string;
    is_error?: boolean;
    isTaskComplete?: boolean;  // Special marker: task_complete tool call
}

/**
 * Terminal tools service
 * Defines terminal-related tools that AI can call
 */
@Injectable({ providedIn: 'root' })
export class TerminalToolsService {
    // ========== Smart wait configuration ==========
    // Command type to estimated wait time mapping (milliseconds)
    private readonly COMMAND_WAIT_TIMES: Record<string, number> = {
        // Fast commands (< 500ms)
        'cd': 200,
        'pwd': 200,
        'echo': 200,
        'set': 300,
        'export': 200,
        'cls': 100,
        'clear': 100,
        'date': 200,
        'time': 200,

        // Standard commands (500-1500ms)
        'dir': 500,
        'ls': 500,
        'cat': 500,
        'type': 500,
        'mkdir': 300,
        'rm': 500,
        'del': 500,
        'copy': 800,
        'xcopy': 1000,
        'move': 800,
        'ren': 300,
        'rename': 300,
        'tree': 1000,
        'find': 600,
        'grep': 500,
        'head': 200,
        'tail': 200,

        // Slow commands (1500-5000ms)
        'git': 3000,
        'npm': 5000,
        'yarn': 5000,
        'pnpm': 5000,
        'pip': 4000,
        'conda': 3000,
        'docker': 4000,
        'kubectl': 3000,
        'terraform': 4000,
        'make': 2000,
        'cmake': 3000,

        // Very slow commands (> 5000ms)
        'systeminfo': 8000,
        'ipconfig': 2000,
        'ifconfig': 2000,
        'netstat': 3000,
        'ss': 2000,
        'ping': 10000,
        'tracert': 15000,
        'tracepath': 10000,
        'nslookup': 3000,
        'dig': 3000,
        'choco': 5000,
        'scoop': 5000,
        'apt-get': 5000,
        'apt': 4000,
        'yum': 5000,
        'dnf': 5000,
        'brew': 5000,
        'pacman': 5000,

        // Default wait time
        '__default__': 1500
    };

    // Tool definitions
    private tools: ToolDefinition[] = [
        // ========== Task completion tool ==========
        {
            name: 'task_complete',
            description: `[IMPORTANT] When you have completed all tasks requested by the user, you must call this tool to end the task loop.
After calling this tool, the Agent will stop continuing execution, and your summary will be displayed as the final response to the user.
Use cases:
- All tool calls have been successfully completed
- Encountered an unsolvable problem and need to stop
- User request has been fully satisfied
Note: If there are still incomplete tasks, please complete them first before calling this tool.`,
            input_schema: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: 'Task completion summary, describing what was done and the results'
                    },
                    success: {
                        type: 'boolean',
                        description: 'Whether all tasks were successfully completed'
                    },
                    next_steps: {
                        type: 'string',
                        description: 'Optional, suggested next steps for the user'
                    }
                },
                required: ['summary', 'success']
            }
        },
        // ========== Terminal operation tools ==========
        {
            name: 'read_terminal_output',
            description: 'Read the recent output content of the specified terminal. Used to get command execution results or terminal status.',
            input_schema: {
                type: 'object',
                properties: {
                    lines: {
                        type: 'number',
                        description: 'Number of lines to read, default is 50'
                    },
                    terminal_index: {
                        type: 'number',
                        description: 'Target terminal index. If not specified, reads from the active terminal.'
                    }
                },
                required: []
            }
        },
        {
            name: 'write_to_terminal',
            description: 'Write a command to the terminal. Can specify terminal index or use the current active terminal.',
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'Command to write'
                    },
                    execute: {
                        type: 'boolean',
                        description: 'Whether to execute the command immediately (add Enter), default is true'
                    },
                    terminal_index: {
                        type: 'number',
                        description: 'Target terminal index (starting from 0). If not specified, uses the current active terminal.'
                    }
                },
                required: ['command']
            }
        },
        {
            name: 'get_terminal_list',
            description: 'Get a list of all open terminals, including terminal ID, title, active status, etc.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'get_terminal_cwd',
            description: 'Get the current working directory of the terminal.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'get_terminal_selection',
            description: 'Get the selected text in the current terminal.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'focus_terminal',
            description: 'Switch to the terminal at the specified index, making it the active terminal.',
            input_schema: {
                type: 'object',
                properties: {
                    terminal_index: {
                        type: 'number',
                        description: 'Target terminal index (starting from 0)'
                    }
                },
                required: ['terminal_index']
            }
        },
        {
            name: 'read_file',
            description: 'Read a text file from disk. Use this to inspect code before making changes.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'File path (absolute or relative to workspace root)'
                    }
                },
                required: ['path']
            }
        },
        {
            name: 'list_files',
            description: 'List files in a directory (non-recursive by default).',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Directory path (absolute or relative to workspace root)'
                    },
                    max_entries: {
                        type: 'number',
                        description: 'Maximum entries to return (default 200)'
                    }
                },
                required: ['path']
            }
        },
        {
            name: 'apply_patch',
            description: 'Apply a unified diff patch to files. Use this for all code edits.',
            input_schema: {
                type: 'object',
                properties: {
                    patch: {
                        type: 'string',
                        description: 'Unified diff patch'
                    }
                },
                required: ['patch']
            }
        },
        // ========== Editor Context Tools ==========
        {
            name: 'get_active_editor_context',
            description: 'Get information about the currently active editor including file path, cursor position, selected text, and nearby code. Essential for understanding what the user is working on.',
            input_schema: {
                type: 'object',
                properties: {
                    include_selection: {
                        type: 'boolean',
                        description: 'Include selected text in response (default: true)'
                    },
                    context_lines: {
                        type: 'number',
                        description: 'Number of lines of context around cursor (default: 10)'
                    }
                },
                required: []
            }
        },
        {
            name: 'get_editor_diagnostics',
            description: 'Get compilation errors, warnings, and linting issues in the active editor or a specific file. Use this to understand what needs to be fixed.',
            input_schema: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: 'Optional file path. If not provided, uses active editor.'
                    },
                    severity: {
                        type: 'string',
                        enum: ['error', 'warning', 'info', 'all'],
                        description: 'Filter by severity level (default: all)'
                    }
                },
                required: []
            }
        },
        {
            name: 'insert_at_cursor',
            description: 'Insert text at the current cursor position in the active editor.',
            input_schema: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Text to insert'
                    },
                    move_cursor_to_end: {
                        type: 'boolean',
                        description: 'Move cursor to end of inserted text (default: true)'
                    }
                },
                required: ['text']
            }
        },
        {
            name: 'replace_selection',
            description: 'Replace the currently selected text in the active editor.',
            input_schema: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Text to replace selection with'
                    }
                },
                required: ['text']
            }
        },
        // ========== Workspace & Search Tools ==========
        {
            name: 'search_code_content',
            description: 'Search for text or regex patterns across workspace files. Returns file paths and matching lines with context.',
            input_schema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Search pattern (supports regex)'
                    },
                    file_pattern: {
                        type: 'string',
                        description: 'File glob pattern to search within (e.g., "**/*.ts", "src/**/*.js")'
                    },
                    case_sensitive: {
                        type: 'boolean',
                        description: 'Case sensitive search (default: false)'
                    },
                    max_results: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 50)'
                    }
                },
                required: ['pattern']
            }
        },
        {
            name: 'search_symbols',
            description: 'Search for symbols (functions, classes, variables) across the workspace. Returns symbol definitions with locations.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Symbol name or pattern to search for'
                    },
                    kind: {
                        type: 'string',
                        enum: ['function', 'class', 'variable', 'interface', 'method', 'all'],
                        description: 'Type of symbol to search for (default: all)'
                    }
                },
                required: ['query']
            }
        },
        {
            name: 'get_project_info',
            description: 'Get project metadata including project type, dependencies, configuration files, and structure.',
            input_schema: {
                type: 'object',
                properties: {
                    include_dependencies: {
                        type: 'boolean',
                        description: 'Include list of dependencies from package.json/requirements.txt (default: true)'
                    }
                },
                required: []
            }
        },
        {
            name: 'find_files',
            description: 'Find files matching a glob pattern. Faster than list_files for searching across workspace.',
            input_schema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Glob pattern (e.g., "**/*.tsx", "src/**/test*.js")'
                    },
                    max_results: {
                        type: 'number',
                        description: 'Maximum number of files to return (default: 100)'
                    }
                },
                required: ['pattern']
            }
        },
        // ========== LSP Integration Tools ==========
        {
            name: 'get_type_info',
            description: 'Get type information for a symbol at a specific position in a file (requires LSP support).',
            input_schema: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: 'File path'
                    },
                    line: {
                        type: 'number',
                        description: 'Line number (0-based)'
                    },
                    character: {
                        type: 'number',
                        description: 'Character position in line (0-based)'
                    }
                },
                required: ['file_path', 'line', 'character']
            }
        },
        {
            name: 'get_definition',
            description: 'Get the definition location of a symbol at cursor position. Useful for "Go to Definition" functionality.',
            input_schema: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: 'File path'
                    },
                    line: {
                        type: 'number',
                        description: 'Line number (0-based)'
                    },
                    character: {
                        type: 'number',
                        description: 'Character position in line (0-based)'
                    }
                },
                required: ['file_path', 'line', 'character']
            }
        },
        {
            name: 'get_references',
            description: 'Find all references to a symbol at cursor position. Shows where the symbol is used across the workspace.',
            input_schema: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: 'File path'
                    },
                    line: {
                        type: 'number',
                        description: 'Line number (0-based)'
                    },
                    character: {
                        type: 'number',
                        description: 'Character position in line (0-based)'
                    },
                    include_declaration: {
                        type: 'boolean',
                        description: 'Include the declaration in results (default: true)'
                    }
                },
                required: ['file_path', 'line', 'character']
            }
        },
        {
            name: 'get_hover_info',
            description: 'Get hover information (documentation, type info) for a symbol at cursor position.',
            input_schema: {
                type: 'object',
                properties: {
                    file_path: {
                        type: 'string',
                        description: 'File path'
                    },
                    line: {
                        type: 'number',
                        description: 'Line number (0-based)'
                    },
                    character: {
                        type: 'number',
                        description: 'Character position in line (0-based)'
                    }
                },
                required: ['file_path', 'line', 'character']
            }
        }
    ];

    // Terminal output buffer
    private outputBuffer: string[] = [];
    private maxBufferLines = 500;

    constructor(
        private terminalManager: TerminalManagerService,
        private logger: LoggerService,
        private config: ConfigProviderService,
        private editorIntegration: EditorIntegrationService
    ) {
        // No longer need static subscription to output, read directly from xterm buffer dynamically
    }

    /**
     * Get all tool definitions (including MCP tools)
     */
    getToolDefinitions(): ToolDefinition[] {
        return [...this.tools];
    }

    /**
     * Execute tool call
     */
    async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
        // Validate tool call
        if (!toolCall.name || toolCall.name.trim() === '') {
            const errorMsg = 'Tool call has empty or missing name';
            this.logger.error(errorMsg, { toolCall: JSON.stringify(toolCall) });
            throw new Error(errorMsg);
        }

        // Validate tool name is in available tools list
        const availableTools = this.getToolDefinitions();
        const toolExists = availableTools.some(t => t.name === toolCall.name);
        
        if (!toolExists) {
            const errorMsg = `Unknown tool: "${toolCall.name}". Available tools: ${availableTools.map(t => t.name).join(', ')}`;
            this.logger.warn('Invalid tool call attempted', { 
                toolName: toolCall.name, 
                availableTools: availableTools.map(t => t.name),
                toolCall: JSON.stringify(toolCall)
            });
            throw new Error(errorMsg);
        }

        this.logger.info('Executing tool call', { name: toolCall.name, input: toolCall.input });

        try {
            let result: string;
            let isTaskComplete = false;

            switch (toolCall.name) {
                // ========== Task completion tool ==========
                case 'task_complete': {
                    const input = toolCall.input;
                    const successStatus = input.success ? 'successfully' : 'failed to';
                    const nextStepsText = input.next_steps
                        ? `\n\nSuggested next steps: ${input.next_steps}`
                        : '';
                    result = `Task ${successStatus} completed.\n\n${input.summary}${nextStepsText}`;
                    isTaskComplete = true;
                    this.logger.info('Task completed via task_complete tool', { success: input.success });
                    break;
                }
                // ========== Terminal operation tools ==========
                case 'read_terminal_output':
                    result = this.readTerminalOutput(
                        toolCall.input.lines || 50,
                        toolCall.input.terminal_index
                    );
                    break;
                case 'write_to_terminal':
                    result = await this.writeToTerminal(
                        toolCall.input.command,
                        toolCall.input.execute ?? true,
                        toolCall.input.terminal_index
                    );
                    break;
                case 'get_terminal_list':
                    result = this.getTerminalList();
                    break;
                case 'get_terminal_cwd':
                    result = this.getTerminalCwd();
                    break;
                case 'get_terminal_selection':
                    result = this.getTerminalSelection();
                    break;
                case 'focus_terminal':
                    result = this.focusTerminal(toolCall.input.terminal_index);
                    break;
                case 'read_file':
                    result = this.readFile(toolCall.input.path);
                    break;
                case 'list_files':
                    result = this.listFiles(toolCall.input.path, toolCall.input.max_entries);
                    break;
                case 'apply_patch':
                    result = this.applyPatch(this.normalizePatchInput(toolCall.input));
                    break;
                // ========== Editor Context Tools ==========
                case 'get_active_editor_context':
                    result = await this.getActiveEditorContext(
                        toolCall.input.include_selection ?? true,
                        toolCall.input.context_lines || 10
                    );
                    break;
                case 'get_editor_diagnostics':
                    result = await this.getEditorDiagnostics(
                        toolCall.input.file_path,
                        toolCall.input.severity || 'all'
                    );
                    break;
                case 'insert_at_cursor':
                    result = await this.insertAtCursor(
                        toolCall.input.text,
                        toolCall.input.move_cursor_to_end ?? true
                    );
                    break;
                case 'replace_selection':
                    result = await this.replaceSelection(toolCall.input.text);
                    break;
                // ========== Workspace & Search Tools ==========
                case 'search_code_content':
                    result = await this.searchCodeContent(
                        toolCall.input.pattern,
                        toolCall.input.file_pattern,
                        toolCall.input.case_sensitive ?? false,
                        toolCall.input.max_results || 50
                    );
                    break;
                case 'search_symbols':
                    result = await this.searchSymbols(
                        toolCall.input.query,
                        toolCall.input.kind || 'all'
                    );
                    break;
                case 'get_project_info':
                    result = await this.getProjectInfo(
                        toolCall.input.include_dependencies ?? true
                    );
                    break;
                case 'find_files':
                    result = await this.findFiles(
                        toolCall.input.pattern,
                        toolCall.input.max_results || 100
                    );
                    break;
                // ========== LSP Integration Tools ==========
                case 'get_type_info':
                    result = await this.getTypeInfo(
                        toolCall.input.file_path,
                        toolCall.input.line,
                        toolCall.input.character
                    );
                    break;
                case 'get_definition':
                    result = await this.getDefinition(
                        toolCall.input.file_path,
                        toolCall.input.line,
                        toolCall.input.character
                    );
                    break;
                case 'get_references':
                    result = await this.getReferences(
                        toolCall.input.file_path,
                        toolCall.input.line,
                        toolCall.input.character,
                        toolCall.input.include_declaration ?? true
                    );
                    break;
                case 'get_hover_info':
                    result = await this.getHoverInfo(
                        toolCall.input.file_path,
                        toolCall.input.line,
                        toolCall.input.character
                    );
                    break;
                default:
                    throw new Error(`Unknown tool: ${toolCall.name}`);
            }

            this.logger.info('Tool call completed', { name: toolCall.name, resultLength: result.length });

            return {
                tool_use_id: toolCall.id,
                content: result,
                isTaskComplete
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Tool call failed', { name: toolCall.name, error: errorMessage });

            return {
                tool_use_id: toolCall.id,
                content: `Error: ${errorMessage}`,
                is_error: true
            };
        }
    }

    private getFs(): any {
        const win: any = window as any;
        return win?.require?.('fs');
    }

    private getPath(): any {
        const win: any = window as any;
        return win?.require?.('path');
    }

    private resolvePath(inputPath: string): string {
        const path = this.getPath();
        const win: any = window as any;
        const configuredRoot = (this.config.get<string>('agentWorkingDir', '') || '').trim();
        const cwd = configuredRoot || win?.process?.cwd?.() || '';
        if (!path) return inputPath;
        return path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);
    }

    private readFile(pathInput: string): string {
        const fs = this.getFs();
        if (!fs) {
            throw new Error('File system not available');
        }
        if (!pathInput) {
            throw new Error('Missing path');
        }
        const resolved = this.resolvePath(pathInput);
        const content = fs.readFileSync(resolved, 'utf-8');
        return `=== ${pathInput} ===\n${content}`;
    }

    private listFiles(pathInput: string, maxEntries: number = 200): string {
        const fs = this.getFs();
        const path = this.getPath();
        if (!fs || !path) {
            throw new Error('File system not available');
        }
        if (!pathInput) {
            throw new Error('Missing path');
        }
        const resolved = this.resolvePath(pathInput);
        const entries = fs.readdirSync(resolved, { withFileTypes: true })
            .slice(0, Math.max(1, maxEntries))
            .map((entry: any) => entry.isDirectory() ? `${entry.name}/` : entry.name);
        return `=== ${pathInput} ===\n${entries.join('\n')}`;
    }

    private applyPatch(patch: string): string {
        if (!patch || typeof patch !== 'string') {
            throw new Error('Patch is empty');
        }
        const fs = this.getFs();
        const path = this.getPath();
        if (!fs || !path) {
            throw new Error('File system not available');
        }
        const configuredRoot = (this.config.get<string>('agentWorkingDir', '') || '').trim();
        const root = configuredRoot ? this.resolvePath(configuredRoot) : '';
        const files = this.parseUnifiedDiff(patch);
        const results: string[] = [];
        for (const file of files) {
            const resolved = this.resolvePath(file.path);
            if (root) {
                const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
                if (!(resolved === root || resolved.startsWith(normalizedRoot))) {
                    throw new Error(`Patch target خارج working dir: ${file.path}`);
                }
            }
            const original = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf-8') : '';
            const updated = this.applyHunksToContent(original, file.hunks, file.path);
            fs.writeFileSync(resolved, updated, 'utf-8');
            results.push(`Patched ${file.path}`);
        }
        return results.join('\n');
    }

    private normalizePatchInput(input: any): string {
        let patch: string | undefined;

        if (typeof input === 'string') {
            patch = input;
        } else if (input && typeof input.patch === 'string') {
            patch = input.patch;
        } else if (input && Array.isArray(input.cmd)) {
            const cmd = input.cmd;
            const applyIndex = cmd.findIndex((item: any) => item === 'apply_patch');
            const patchIndex = cmd.findIndex((item: any) => item === 'patch');
            if (applyIndex !== -1) {
                if (patchIndex !== -1 && typeof cmd[patchIndex + 1] === 'string') {
                    patch = cmd[patchIndex + 1];
                } else {
                    const lastString = [...cmd].reverse().find((item: any) => typeof item === 'string');
                    if (lastString) {
                        patch = lastString;
                    }
                }
            }
        }

        if (!patch) {
            throw new Error('Missing patch input. Provide { "patch": "unified diff" }.');
        }

        const trimmed = patch.trim();
        if (trimmed.startsWith('*** Begin Patch')) {
            const converted = this.convertBeginPatchToUnified(trimmed);
            if (!converted) {
                throw new Error('Unsupported patch format. Use unified diff with ---/+++ headers.');
            }
            patch = converted;
        }

        if (patch.includes('--- /dev/null')) {
            const normalized = this.normalizeNewFilePatch(patch);
            if (normalized) {
                patch = normalized;
            }
        }

        return patch;
    }

    private convertBeginPatchToUnified(patch: string): string | null {
        const lines = patch.split('\n');
        let currentFile: string | null = null;
        let isAddFile = false;
        const additions: string[] = [];

        for (const line of lines) {
            if (line.startsWith('*** Add File:')) {
                currentFile = line.replace('*** Add File:', '').trim();
                isAddFile = true;
                continue;
            }
            if (line.startsWith('*** End Patch')) {
                break;
            }
            if (isAddFile && currentFile) {
                if (line.startsWith('+')) {
                    additions.push(line.slice(1));
                } else if (line.startsWith(' ')) {
                    additions.push(line.slice(1));
                }
            }
        }

        if (!currentFile || additions.length === 0) {
            return null;
        }

        return [
            '--- /dev/null',
            `+++ ${currentFile}`,
            `@@ -0,0 +1,${additions.length} @@`,
            ...additions.map(line => `+${line}`),
            ''
        ].join('\n');
    }

    private normalizeNewFilePatch(patch: string): string | null {
        const lines = patch.split('\n');
        const toLine = lines.find(l => l.startsWith('+++ '));
        if (!toLine) return null;
        const rawPath = toLine.slice(4).trim();
        const path = rawPath.replace(/^b\//, '').replace(/^a\//, '');
        if (!path || path === '/dev/null') return null;

        const additions: string[] = [];
        let inHunk = false;
        for (const line of lines) {
            if (line.startsWith('@@')) {
                inHunk = true;
                continue;
            }
            if (!inHunk) continue;
            if (line.startsWith('+') && !line.startsWith('+++')) {
                additions.push(line.slice(1));
            }
        }

        if (additions.length === 0) return null;

        return [
            '--- /dev/null',
            `+++ ${path}`,
            `@@ -0,0 +1,${additions.length} @@`,
            ...additions.map(line => `+${line}`),
            ''
        ].join('\n');
    }

    private parseUnifiedDiff(patch: string): { path: string; hunks: string[] }[] {
        const lines = patch.split('\n');
        const files: { path: string; hunks: string[] }[] = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (line.startsWith('--- ')) {
                const next = lines[i + 1] || '';
                if (!next.startsWith('+++ ')) {
                    throw new Error('Invalid patch format: missing +++ header');
                }
                const fromLine = line.slice(4).trim();
                const toLine = next.slice(4).trim();
                const fromPath = fromLine.replace(/^b\//, '').replace(/^a\//, '');
                const toPath = toLine.replace(/^b\//, '').replace(/^a\//, '');
                const path = (toPath === '/dev/null') ? fromPath : toPath;
                if (!path) {
                    throw new Error('Invalid patch: empty file path');
                }
                if (path === '/dev/null') {
                    i += 2;
                    continue;
                }
                i += 2;
                const hunks: string[] = [];
                while (i < lines.length && !lines[i].startsWith('--- ')) {
                    if (lines[i].startsWith('@@')) {
                        const hunkLines: string[] = [lines[i]];
                        i++;
                        while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('--- ')) {
                            hunkLines.push(lines[i]);
                            i++;
                        }
                        hunks.push(hunkLines.join('\n'));
                        continue;
                    }
                    i++;
                }
                if (hunks.length === 0) {
                    throw new Error(`No hunks found for ${path}`);
                }
                files.push({ path, hunks });
                continue;
            }
            i++;
        }
        if (files.length === 0) {
            throw new Error('No file changes found in patch');
        }
        return files;
    }

    private applyHunksToContent(original: string, hunks: string[], filePath: string): string {
        let lines = original.split('\n');
        let lineOffset = 0;
        for (const hunk of hunks) {
            const hunkLines = hunk.split('\n');
            const header = hunkLines.shift();
            if (!header) continue;
            const match = /@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/.exec(header);
            if (!match) {
                throw new Error(`Invalid hunk header in ${filePath}: ${header}`);
            }
            // Clamp to 0 so new-file hunks "-0,0" don't become -1
            const oldStartRaw = parseInt(match[1], 10) - 1 + lineOffset;
            const oldStart = Math.max(0, oldStartRaw);
            let idx = oldStart;
            for (const line of hunkLines) {
                if (line.startsWith(' ')) {
                    const expected = line.slice(1);
                    if (lines[idx] !== expected) {
                        throw new Error(`Hunk context mismatch in ${filePath} at line ${idx + 1}`);
                    }
                    idx++;
                } else if (line.startsWith('-')) {
                    const expected = line.slice(1);
                    if (lines[idx] !== expected) {
                        throw new Error(`Hunk removal mismatch in ${filePath} at line ${idx + 1}`);
                    }
                    lines.splice(idx, 1);
                    lineOffset -= 1;
                } else if (line.startsWith('+')) {
                    const addition = line.slice(1);
                    lines.splice(idx, 0, addition);
                    idx++;
                    lineOffset += 1;
                } else if (line.startsWith('\\')) {
                    // Ignore "\ No newline" markers
                }
            }
        }
        return lines.join('\n');
    }

    /**
     * Read content from xterm buffer
     * Contains detailed debug logs to locate white screen issues
     */
    private readFromXtermBuffer(terminal: any, lines: number): string {
        try {
            // === Debug code: record terminal structure ===
            this.logger.info('[DEBUG] Terminal structure debug', {
                hasTerminal: !!terminal,
                terminalType: terminal?.constructor?.name,
                hasFrontend: !!terminal?.frontend,
                frontendType: terminal?.frontend?.constructor?.name,
                frontendKeys: terminal?.frontend ? Object.keys(terminal.frontend).slice(0, 15) : [],
                hasXterm: !!terminal?.frontend?.xterm,
                xtermType: terminal?.frontend?.xterm?.constructor?.name,
                hasBuffer: !!terminal?.frontend?.xterm?.buffer,
                bufferActive: !!terminal?.frontend?.xterm?.buffer?.active
            });

            // Try multiple possible xterm buffer access paths
            let buffer: any = null;
            let bufferSource = '';

            // Path 1: frontend.xterm.buffer.active (xterm.js standard)
            if (terminal.frontend?.xterm?.buffer?.active) {
                buffer = terminal.frontend.xterm.buffer.active;
                bufferSource = 'frontend.xterm.buffer.active';
                this.logger.info('[DEBUG] Using buffer path: ' + bufferSource);
            }
            // Path 2: frontend.buffer (may be directly exposed)
            else if (terminal.frontend?.buffer?.active) {
                buffer = terminal.frontend.buffer.active;
                bufferSource = 'frontend.buffer.active';
                this.logger.info('[DEBUG] Using buffer path: ' + bufferSource);
            }
            // Path 3: frontend._core.buffer (private property)
            else if (terminal.frontend?._core?.buffer?.active) {
                buffer = terminal.frontend._core.buffer.active;
                bufferSource = 'frontend._core.buffer.active';
                this.logger.info('[DEBUG] Using buffer path: ' + bufferSource);
            }
            // Path 4: Try other properties on terminal
            else {
                this.logger.warn('[DEBUG] No standard buffer path found, trying alternatives', {
                    hasContent: !!terminal.content,
                    hasContent$: !!terminal.content$,
                    hasSession: !!terminal.session,
                    allFrontendKeys: terminal?.frontend ? Object.keys(terminal.frontend) : []
                });

                // If there's a content property, try using it
                if (terminal.content) {
                    return `[DEBUG] Terminal content:\n${terminal.content}`;
                }

                return '(Cannot access terminal buffer, please check if terminal is ready)';
            }

            if (!buffer) {
                this.logger.warn('[DEBUG] Buffer is null after all path attempts');
                return '(Cannot access terminal buffer, buffer is empty)';
            }

            const totalLines = buffer.length || 0;
            this.logger.info('【DEBUG】Buffer info', {
                totalLines,
                requestedLines: lines,
                bufferSource
            });

            if (totalLines === 0) {
                return '(终端 buffer 为空)';
            }

            const startLine = Math.max(0, totalLines - lines);
            const result: string[] = [];

            for (let i = startLine; i < totalLines; i++) {
                try {
                    const line = buffer.getLine(i);
                    if (line && typeof line.translateToString === 'function') {
                        result.push(line.translateToString(true));
                    }
                } catch (e) {
                    this.logger.warn('【DEBUG】Failed to read line ' + i, e);
                    // 跳过无法读取的行
                }
            }

            const finalOutput = result.join('\n') || '(终端输出为空)';
            this.logger.info('【DEBUG】Read completed', {
                linesRead: result.length,
                outputLength: finalOutput.length
            });

            return finalOutput;
        } catch (error) {
            this.logger.error('【DEBUG】Failed to read xterm buffer', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : ''
            });
            return '(读取终端失败，请重试)';
        }
    }

    /**
     * 读取终端输出
     */
    private readTerminalOutput(lines: number, terminalIndex?: number): string {
        // 尝试从缓冲区获取
        if (this.outputBuffer.length > 0) {
            const recentLines = this.outputBuffer.slice(-lines);
            return recentLines.join('\n');
        }

        // 直接从指定终端的 xterm buffer 读取
        const terminals = this.terminalManager.getAllTerminals();
        const terminal = terminalIndex !== undefined
            ? terminals[terminalIndex]
            : this.terminalManager.getActiveTerminal();

        if (!terminal) {
            return '(无可用终端)';
        }

        return this.readFromXtermBuffer(terminal, lines);
    }

    /**
     * 写入终端 - 带执行反馈和智能等待
     */
    private async writeToTerminal(command: string, execute: boolean, terminalIndex?: number): Promise<string> {
        this.logger.info('writeToTerminal called', { command, execute, terminalIndex });

        let success: boolean;
        let targetTerminalIndex: number;

        if (terminalIndex !== undefined) {
            // 向指定索引的终端写入
            this.logger.info('Sending command to terminal index', { terminalIndex });
            success = this.terminalManager.sendCommandToIndex(terminalIndex, command, execute);
            targetTerminalIndex = terminalIndex;
            this.logger.info('sendCommandToIndex result', { success });
        } else {
            // 向当前活动终端写入
            this.logger.info('Sending command to active terminal');
            success = this.terminalManager.sendCommand(command, execute);
            targetTerminalIndex = 0; // 默认活动终端
            this.logger.info('sendCommand result', { success });
        }

        if (!success) {
            throw new Error(terminalIndex !== undefined
                ? `Cannot write to terminal ${terminalIndex}, index is invalid or terminal is unavailable`
                : 'Cannot write to terminal, please ensure there is an active terminal window');
        }

        // ========== Smart wait mechanism ==========
        const baseCommand = this.extractBaseCommand(command);
        const waitTime = this.getWaitTimeForCommand(baseCommand);

        this.logger.info('Smart wait for command', { command, baseCommand, waitTime });

        // Initial wait
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Read directly from xterm buffer
        const terminals = this.terminalManager.getAllTerminals();
        const terminal = terminalIndex !== undefined
            ? terminals[terminalIndex]
            : this.terminalManager.getActiveTerminal();

        let output = '(Terminal output is empty)';
        if (terminal) {
            output = this.readFromXtermBuffer(terminal, 50);

            // For slow commands, poll to check if completed
            if (waitTime >= 3000) {
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries && !this.isCommandComplete(output)) {
                    this.logger.info(`Command still running, retry ${retryCount + 1}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    output = this.readFromXtermBuffer(terminal, 50);
                    retryCount++;
                }
            }
        }

        // Return execution result
        return [
            `✅ Command executed: ${command}`,
            `⏱️ Wait time: ${waitTime}ms`,
            '',
            '=== Terminal Output ===',
            output,
            '=== End of Output ==='
        ].join('\n');
    }

    /**
     * Extract command base name
     */
    private extractBaseCommand(command: string): string {
        const trimmed = command.trim().toLowerCase();
        // Handle Windows paths (e.g., C:\Windows\System32\systeminfo.exe)
        const parts = trimmed.split(/[\s\/\\]+/);
        const executable = parts[0].replace(/\.exe$/i, '');
        // Remove common prefixes
        return executable.replace(/^(winpty|busybox|gtimeout|command|-)/, '');
    }

    /**
     * Get command wait time
     */
    private getWaitTimeForCommand(baseCommand: string): number {
        return this.COMMAND_WAIT_TIMES[baseCommand] || this.COMMAND_WAIT_TIMES['__default__'];
    }

    /**
     * Check if command is complete (Detect prompt)
     */
    private isCommandComplete(output: string): boolean {
        const promptPatterns = [
            /\n[A-Za-z]:.*>\s*$/,           // Windows: C:\Users\xxx>
            /\$\s*$/,                       // Linux/Mac: $
            /\n#\s*$/,                      // Root: #
            /\n.*@.*:\~.*\$\s*$/,           // bash: user@host:~$
            /PS\s+[A-Za-z]:.*>\s*$/,        // PowerShell: PS C:\>
            /\[.*@\S+\s+.*\]\$\s*$/,        // modern bash
        ];

        return promptPatterns.some(pattern => pattern.test(output));
    }

    /**
     * Get terminal list
     */
    private getTerminalList(): string {
        const terminals: TerminalInfo[] = this.terminalManager.getAllTerminalInfo();
        if (terminals.length === 0) {
            return '(No open terminals)';
        }

        // Detect operating system
        const platform = process.platform;
        const isWindows = platform === 'win32';
        const osInfo = isWindows ? 'Windows' : (platform === 'darwin' ? 'macOS' : 'Linux');

        const list = terminals.map((t, i) =>
            `[${i}] ${t.title}${t.isActive ? ' (Active)' : ''}${t.cwd ? ` - ${t.cwd}` : ''}`
        ).join('\n');

        return `Operating System: ${osInfo}\nTotal ${terminals.length} terminal(s):\n${list}\n\nNote: ${isWindows ? 'Please use Windows commands (e.g., dir, cd, type, etc.)' : 'Please use Unix commands (e.g., ls, cd, cat, etc.)'}`;
    }



    /**
     * Get terminal working directory
     */
    private getTerminalCwd(): string {
        const cwd = this.terminalManager.getTerminalCwd();
        if (cwd) {
            return `Current working directory: ${cwd}`;
        } else {
            return '(Cannot get working directory)';
        }
    }

    /**
     * Get terminal selected text
     */
    private getTerminalSelection(): string {
        const selection = this.terminalManager.getSelection();
        if (selection) {
            return selection;
        } else {
            return '(No selected text)';
        }
    }

    /**
     * Switch terminal focus
     */
    private focusTerminal(index: number): string {
        const success = this.terminalManager.focusTerminal(index);
        if (success) {
            return `✅ Switched to terminal ${index}`;
        } else {
            return `❌ Failed to switch to terminal ${index}, invalid index`;
        }
    }

    // ========== Editor Context Tools Implementation ==========

    /**
     * Get active editor context
     */
    private async getActiveEditorContext(includeSelection: boolean, contextLines: number): Promise<string> {
        try {
            const response = await this.editorIntegration.getActiveEditorContext(includeSelection, contextLines);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.file) {
                return '(No active editor)';
            }

            const parts: string[] = [];
            parts.push('=== Active Editor Context ===');
            parts.push(`File: ${response.file}`);
            parts.push(`Language: ${response.language || 'unknown'}`);
            parts.push(`Lines: ${response.lineCount || 0}`);
            parts.push(`Cursor: Line ${response.cursorLine + 1}, Column ${response.cursorColumn + 1}`);

            if (response.selectedText && includeSelection) {
                parts.push('\n=== Selected Text ===');
                parts.push(response.selectedText);
            }

            if (response.contextBefore || response.contextAfter) {
                parts.push('\n=== Context Around Cursor ===');
                if (response.contextBefore) {
                    parts.push('--- Before ---');
                    parts.push(response.contextBefore);
                }
                parts.push(`>>> CURSOR AT LINE ${response.cursorLine + 1} <<<`);
                if (response.contextAfter) {
                    parts.push('--- After ---');
                    parts.push(response.contextAfter);
                }
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting editor context: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Get editor diagnostics (errors, warnings)
     */
    private async getEditorDiagnostics(filePath?: string, severity: string = 'all'): Promise<string> {
        try {
            const response = await this.editorIntegration.getEditorDiagnostics(filePath, severity);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.diagnostics || response.diagnostics.length === 0) {
                return '(No diagnostics found)';
            }

            const parts: string[] = [];
            parts.push('=== Diagnostics ===');
            parts.push(`File: ${response.file || filePath || 'active editor'}`);
            parts.push(`Total: ${response.diagnostics.length} issue(s)\n`);

            for (const diag of response.diagnostics) {
                const severityIcon = diag.severity === 'error' ? '❌' :
                                    diag.severity === 'warning' ? '⚠️' : 'ℹ️';
                parts.push(`${severityIcon} Line ${diag.line + 1}, Col ${diag.column + 1}: ${diag.message}`);
                if (diag.code) {
                    parts.push(`   Code: ${diag.code}`);
                }
                parts.push('');
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting diagnostics: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Insert text at cursor position
     */
    private async insertAtCursor(text: string, moveCursorToEnd: boolean): Promise<string> {
        try {
            const response = await this.editorIntegration.insertAtCursor(text, moveCursorToEnd);

            if (response && response.error) {
                return `❌ ${response.error}`;
            }

            if (response && response.success) {
                return `✅ Inserted ${text.length} characters at cursor position`;
            }

            return '❌ Failed to insert text';
        } catch (error) {
            return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }

    /**
     * Replace selected text
     */
    private async replaceSelection(text: string): Promise<string> {
        try {
            const response = await this.editorIntegration.replaceSelection(text);

            if (response && response.error) {
                return `❌ ${response.error}`;
            }

            if (response && response.success) {
                return `✅ Replaced selection with ${text.length} characters`;
            }

            return '❌ Failed to replace selection';
        } catch (error) {
            return `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }

    // ========== Workspace & Search Tools Implementation ==========

    /**
     * Search code content across workspace
     */
    private async searchCodeContent(
        pattern: string,
        filePattern?: string,
        caseSensitive: boolean = false,
        maxResults: number = 50
    ): Promise<string> {
        try {
            const response = await this.editorIntegration.searchCodeContent(
                pattern,
                filePattern,
                caseSensitive,
                maxResults
            );

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.results || response.results.length === 0) {
                return `(No matches found for pattern: ${pattern})`;
            }

            const parts: string[] = [];
            parts.push('=== Search Results ===');
            parts.push(`Pattern: ${pattern}`);
            if (filePattern) {
                parts.push(`File Pattern: ${filePattern}`);
            }
            parts.push(`Found: ${response.results.length} match(es)\n`);

            for (const result of response.results) {
                parts.push(`📄 ${result.file}`);
                parts.push(`   Line ${result.line + 1}: ${result.text.trim()}`);
                if (result.context) {
                    parts.push(`   Context: ${result.context}`);
                }
                parts.push('');
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error searching code: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Search for symbols in workspace
     */
    private async searchSymbols(query: string, kind: string = 'all'): Promise<string> {
        try {
            const response = await this.editorIntegration.searchSymbols(query, kind);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.symbols || response.symbols.length === 0) {
                return `(No symbols found for: ${query})`;
            }

            const parts: string[] = [];
            parts.push('=== Symbol Search Results ===');
            parts.push(`Query: ${query}`);
            parts.push(`Kind: ${kind}`);
            parts.push(`Found: ${response.symbols.length} symbol(s)\n`);

            for (const symbol of response.symbols) {
                const kindIcon = this.getSymbolIcon(symbol.kind);
                parts.push(`${kindIcon} ${symbol.name} (${symbol.kind})`);
                parts.push(`   Location: ${symbol.file}:${symbol.line + 1}`);
                if (symbol.containerName) {
                    parts.push(`   Container: ${symbol.containerName}`);
                }
                parts.push('');
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error searching symbols: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Get project information
     */
    private async getProjectInfo(includeDependencies: boolean): Promise<string> {
        try {
            const response = await this.editorIntegration.getProjectInfo(includeDependencies);

            if (response && response.error) {
                return `(${response.error})`;
            }

            const parts: string[] = [];
            parts.push('=== Project Information ===');

            if (response.projectType) {
                parts.push(`Type: ${response.projectType}`);
            }

            if (response.workspaceRoot) {
                parts.push(`Workspace: ${response.workspaceRoot}`);
            }

            if (response.configFiles && response.configFiles.length > 0) {
                parts.push('\nConfiguration Files:');
                for (const file of response.configFiles) {
                    parts.push(`  - ${file}`);
                }
            }

            if (includeDependencies && response.dependencies) {
                parts.push('\nDependencies:');
                if (response.dependencies.production && response.dependencies.production.length > 0) {
                    parts.push('  Production:');
                    for (const dep of response.dependencies.production.slice(0, 20)) {
                        parts.push(`    - ${dep}`);
                    }
                    if (response.dependencies.production.length > 20) {
                        parts.push(`    ... and ${response.dependencies.production.length - 20} more`);
                    }
                }
                if (response.dependencies.development && response.dependencies.development.length > 0) {
                    parts.push('  Development:');
                    for (const dep of response.dependencies.development.slice(0, 10)) {
                        parts.push(`    - ${dep}`);
                    }
                    if (response.dependencies.development.length > 10) {
                        parts.push(`    ... and ${response.dependencies.development.length - 10} more`);
                    }
                }
            }

            if (response.scripts && Object.keys(response.scripts).length > 0) {
                parts.push('\nAvailable Scripts:');
                for (const [name, command] of Object.entries(response.scripts).slice(0, 10)) {
                    parts.push(`  ${name}: ${command}`);
                }
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting project info: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Find files matching glob pattern
     */
    private async findFiles(pattern: string, maxResults: number): Promise<string> {
        try {
            const response = await this.editorIntegration.findFiles(pattern, maxResults);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.files || response.files.length === 0) {
                return `(No files found matching: ${pattern})`;
            }

            const parts: string[] = [];
            parts.push('=== File Search Results ===');
            parts.push(`Pattern: ${pattern}`);
            parts.push(`Found: ${response.files.length} file(s)\n`);

            for (const file of response.files) {
                parts.push(`📄 ${file}`);
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error finding files: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    // ========== LSP Integration Tools Implementation ==========

    /**
     * Get type information at position
     */
    private async getTypeInfo(filePath: string, line: number, character: number): Promise<string> {
        try {
            const response = await this.editorIntegration.getTypeInfo(filePath, line, character);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.typeInfo) {
                return '(No type information available at this position)';
            }

            const parts: string[] = [];
            parts.push('=== Type Information ===');
            parts.push(`Location: ${filePath}:${line + 1}:${character + 1}\n`);

            if (response.typeInfo.contents) {
                parts.push(response.typeInfo.contents);
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting type info: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Get definition location
     */
    private async getDefinition(filePath: string, line: number, character: number): Promise<string> {
        try {
            const response = await this.editorIntegration.getDefinition(filePath, line, character);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.definitions || response.definitions.length === 0) {
                return '(No definition found)';
            }

            const parts: string[] = [];
            parts.push('=== Definition ===');
            parts.push(`Search Location: ${filePath}:${line + 1}:${character + 1}\n`);

            for (const def of response.definitions) {
                parts.push(`📍 ${def.file}:${def.line + 1}:${def.column + 1}`);
                if (def.text) {
                    parts.push(`   ${def.text}`);
                }
                parts.push('');
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting definition: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Get references to symbol
     */
    private async getReferences(
        filePath: string,
        line: number,
        character: number,
        includeDeclaration: boolean
    ): Promise<string> {
        try {
            const response = await this.editorIntegration.getReferences(
                filePath,
                line,
                character,
                includeDeclaration
            );

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.references || response.references.length === 0) {
                return '(No references found)';
            }

            const parts: string[] = [];
            parts.push('=== References ===');
            parts.push(`Symbol Location: ${filePath}:${line + 1}:${character + 1}`);
            parts.push(`Found: ${response.references.length} reference(s)\n`);

            for (const ref of response.references) {
                parts.push(`📍 ${ref.file}:${ref.line + 1}:${ref.column + 1}`);
                if (ref.text) {
                    parts.push(`   ${ref.text}`);
                }
                parts.push('');
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting references: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    /**
     * Get hover information
     */
    private async getHoverInfo(filePath: string, line: number, character: number): Promise<string> {
        try {
            const response = await this.editorIntegration.getHoverInfo(filePath, line, character);

            if (response && response.error) {
                return `(${response.error})`;
            }

            if (!response || !response.hover) {
                return '(No hover information available)';
            }

            const parts: string[] = [];
            parts.push('=== Hover Information ===');
            parts.push(`Location: ${filePath}:${line + 1}:${character + 1}\n`);

            if (response.hover.contents) {
                parts.push(response.hover.contents);
            }

            return parts.join('\n');
        } catch (error) {
            return `(Error getting hover info: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
    }

    // ========== Helper Methods ==========

    /**
     * Get icon for symbol kind
     */
    private getSymbolIcon(kind: string): string {
        const icons: Record<string, string> = {
            'function': '🔧',
            'method': '⚙️',
            'class': '📦',
            'interface': '🔷',
            'variable': '📌',
            'constant': '🔒',
            'property': '🏷️',
            'enum': '📋',
            'module': '📚',
            'namespace': '📁'
        };
        return icons[kind.toLowerCase()] || '•';
    }
}
