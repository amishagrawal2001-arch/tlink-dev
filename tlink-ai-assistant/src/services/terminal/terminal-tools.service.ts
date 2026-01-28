import { Injectable } from '@angular/core';
import { TerminalManagerService, TerminalInfo } from './terminal-manager.service';
import { LoggerService } from '../core/logger.service';

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
        }
    ];

    // Terminal output buffer
    private outputBuffer: string[] = [];
    private maxBufferLines = 500;

    constructor(
        private terminalManager: TerminalManagerService,
        private logger: LoggerService
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
}
