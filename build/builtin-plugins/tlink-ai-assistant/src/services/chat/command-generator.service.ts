import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { CommandRequest, CommandResponse, ChatRequest, ChatMessage, MessageRole } from '../../types/ai.types';
import { TerminalContext, TerminalError } from '../../types/terminal.types';
import { AiAssistantService } from '../core/ai-assistant.service';
import { TerminalContextService } from '../terminal/terminal-context.service';
import { SecurityValidatorService } from '../security/security-validator.service';
import { LoggerService } from '../core/logger.service';

@Injectable({ providedIn: 'root' })
export class CommandGeneratorService {
    constructor(
        private aiService: AiAssistantService,
        private terminalContext: TerminalContextService,
        private securityValidator: SecurityValidatorService,
        private logger: LoggerService
    ) {}

    /**
     * 生成命令（基于终端上下文）
     */
    async generateCommand(request: CommandRequest): Promise<CommandResponse> {
        this.logger.info('Generating command', { request });

        try {
            // Get terminal context
            const context = this.terminalContext.getCurrentContext();
            const error = this.terminalContext.getLastError();

            // 构建增强的提示词
            const enhancedPrompt = this.buildEnhancedPrompt(request, context, error);

            // 构建聊天请求
            const chatRequest: ChatRequest = {
                messages: [
                    {
                        id: this.generateId(),
                        role: MessageRole.SYSTEM,
                        content: this.getSystemPrompt(),
                        timestamp: new Date()
                    },
                    {
                        id: this.generateId(),
                        role: MessageRole.USER,
                        content: enhancedPrompt,
                        timestamp: new Date()
                    }
                ],
                maxTokens: 500,
                temperature: 0.3 // 使用较低温度确保命令的准确性
            };

            // 调用AI提供商
            const response = await this.aiService.chat(chatRequest);

            // 解析AI响应
            const commandResponse = this.parseAiResponse(response.message.content);

            // 安全验证
            const validation = await this.securityValidator.validateAndConfirm(
                commandResponse.command,
                commandResponse.explanation,
                context
            );

            if (!validation.approved) {
                throw new Error(`Command blocked by security validator: ${validation.reason}`);
            }

            this.logger.info('Command generated successfully', { commandResponse });
            return commandResponse;

        } catch (error) {
            this.logger.error('Failed to generate command', error);
            throw error;
        }
    }

    /**
     * 从选择文本生成命令
     */
    async generateFromSelection(selection: string): Promise<CommandResponse> {
        const request: CommandRequest = {
            naturalLanguage: selection,
            context: this.buildTerminalContext()
        };

        return this.generateCommand(request);
    }

    /**
     * 从错误生成修复命令
     */
    async generateFixForError(error: TerminalError): Promise<CommandResponse> {
        const context = this.terminalContext.getCurrentContext();

        const request: CommandRequest = {
            naturalLanguage: `Fix this error: ${error.message}`,
            context: {
                currentDirectory: context?.session.cwd,
                operatingSystem: context?.systemInfo.platform,
                shell: context?.session.shell,
                environment: context?.session.environment
            },
            constraints: {
                forbiddenCommands: ['rm -rf /', 'sudo rm -rf /', 'format']
            }
        };

        return this.generateCommand(request);
    }

    /**
     * 生成智能建议
     */
    async generateSuggestions(input: string): Promise<string[]> {
        const context = this.terminalContext.getCurrentContext();

        const prompt = `
Based on the current terminal state, generate 3-5 possible command suggestions for input "${input}".

Current context:
- Directory: ${context?.session.cwd}
- Shell: ${context?.session.shell}
- OS: ${context?.systemInfo.platform}
- Recent commands: ${context?.recentCommands.slice(0, 5).join(', ')}

Return only the command list, one per line, with no explanations.
        `;

        try {
            const response = await this.aiService.chat({
                messages: [
                    {
                        id: this.generateId(),
                        role: MessageRole.USER,
                        content: prompt,
                        timestamp: new Date()
                    }
                ],
                maxTokens: 200,
                temperature: 0.5
            });

            const suggestions = response.message.content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .slice(0, 5);

            return suggestions;

        } catch (error) {
            this.logger.error('Failed to generate suggestions', error);
            return [];
        }
    }

    /**
     * 构建增强提示词
     */
    private buildEnhancedPrompt(
        request: CommandRequest,
        context: TerminalContext | null,
        error: TerminalError | null
    ): string {
        let prompt = `Convert the following natural language request into an accurate command:\n\n"${request.naturalLanguage}"\n\n`;

        // 添加终端上下文
        if (context) {
            prompt += `\nCurrent terminal state:\n`;
            prompt += `- Current directory: ${context.session.cwd}\n`;
            prompt += `- Shell: ${context.session.shell}\n`;
            prompt += `- OS: ${context.systemInfo.platform}\n`;
            prompt += `- User: ${context.session.user}\n`;

            if (context.recentCommands.length > 0) {
                prompt += `- Recent commands: ${context.recentCommands.slice(0, 3).join(', ')}\n`;
            }

            if (context.projectInfo) {
                prompt += `- Detected project type: ${context.projectInfo.type}\n`;
                prompt += `- Project root: ${context.projectInfo.root}\n`;
            }
        }

        // 添加错误信息（如果有）
        if (error) {
            prompt += `\nCurrent error info:\n`;
            prompt += `- Error type: ${error.type}\n`;
            prompt += `- Error message: ${error.message}\n`;
            prompt += `- Failed command: ${error.command}\n`;
            prompt += `- Exit code: ${error.exitCode}\n`;
        }

        // 添加环境变量
        if (context?.session.environment) {
            const importantEnvVars = ['PATH', 'HOME', 'USER', 'PWD', 'SHELL'];
            const envInfo = importantEnvVars
                .filter(key => context.session.environment[key])
                .map(key => `${key}=${context.session.environment[key]}`)
                .join(', ');

            if (envInfo) {
                prompt += `\nImportant environment variables: ${envInfo}\n`;
            }
        }

        // 添加约束
        if (request.constraints) {
            prompt += `\nConstraints:\n`;
            if (request.constraints.maxLength) {
                prompt += `- Max command length: ${request.constraints.maxLength} characters\n`;
            }
            if (request.constraints.allowedCommands?.length) {
                prompt += `- Allowed commands: ${request.constraints.allowedCommands.join(', ')}\n`;
            }
            if (request.constraints.forbiddenCommands?.length) {
                prompt += `- Forbidden commands: ${request.constraints.forbiddenCommands.join(', ')}\n`;
            }
        }

        prompt += `\nPlease respond in the following JSON format:\n`;
        prompt += `{\n`;
        prompt += `  "command": "the command",\n`;
        prompt += `  "explanation": "short explanation",\n`;
        prompt += `  "confidence": 0.95\n`;
        prompt += `}\n`;

        return prompt;
    }

    /**
     * 获取系统提示词
     */
    private getSystemPrompt(): string {
        return `You are a professional terminal command generator. Your tasks:

1. Convert natural language requests into accurate, efficient terminal commands
2. Consider the current OS and shell environment
3. Prefer safe, best-practice commands
4. Provide a clear command explanation
5. Consider the current working directory and context

Always return valid commands and avoid dangerous operations (e.g., deleting system files, formatting disks).
If you cannot determine an accurate command, say so and provide alternatives.`;
    }

    /**
     * 解析AI响应
     */
    private parseAiResponse(content: string): CommandResponse {
        try {
            // 尝试解析JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    command: parsed.command || '',
                    explanation: parsed.explanation || '',
                    confidence: parsed.confidence || 0.5,
                    alternatives: parsed.alternatives || []
                };
            }
        } catch (error) {
            this.logger.warn('Failed to parse JSON response, fallback to text parsing', error);
        }

        // 备用解析：提取命令和解释
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        const command = lines[0] || '';
        const explanation = lines.slice(1).join(' ') || 'AI-generated command suggestion';

        return {
            command,
            explanation,
            confidence: 0.5
        };
    }

    /**
     * 构建终端上下文
     */
    private buildTerminalContext(): CommandRequest['context'] {
        const context = this.terminalContext.getCurrentContext();
        return {
            currentDirectory: context?.session.cwd,
            operatingSystem: context?.systemInfo.platform,
            shell: context?.session.shell,
            environment: context?.session.environment
        };
    }

    /**
     * 生成唯一ID
     */
    private generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
