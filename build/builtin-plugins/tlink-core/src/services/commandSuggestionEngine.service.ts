import { Injectable } from '@angular/core'
import { TerminalContext, TerminalContextService } from './terminalContext.service'

/**
 * Suggested command for the current context
 */
export interface CommandSuggestion {
    /** Command text */
    command: string
    /** Command description */
    description: string
    /** Confidence level (0-1) */
    confidence: number
    /** Category of the command */
    category: CommandCategory
    /** Icon/emoji for the command (optional) */
    icon?: string
}

/**
 * Command categories
 */
export type CommandCategory =
    | 'file_operations'
    | 'git_operations'
    | 'package_management'
    | 'system_info'
    | 'process_management'
    | 'network'
    | 'development'
    | 'other'

/**
 * Command analysis result
 */
export interface CommandAnalysis {
    /** Suggested next commands */
    suggestions: CommandSuggestion[]
    /** Optimization tips for recent commands */
    optimizationTips: string[]
    /** Common mistakes detected */
    commonMistakes: string[]
}

@Injectable({ providedIn: 'root' })
export class CommandSuggestionEngineService {
    constructor (
        private terminalContext: TerminalContextService,
    ) {
        this.initializeCommandTemplates()
    }

    /**
     * Get context-aware command suggestions
     */
    async getSuggestions (context?: TerminalContext): Promise<CommandSuggestion[]> {
        const ctx = context || this.terminalContext.getActiveContextSnapshot()
        if (!ctx) {
            return []
        }

        const suggestions: CommandSuggestion[] = []

        // Git-based suggestions
        if (ctx.gitStatus) {
            suggestions.push(...this.getGitSuggestions(ctx))
        }

        // Directory-based suggestions
        if (ctx.currentDirectory) {
            suggestions.push(...this.getDirectorySuggestions(ctx))
        }

        // Error-based suggestions (if recent output contains errors)
        if (ctx.recentOutput.length > 0) {
            const recentOutput = ctx.recentOutput.join('\n')
            if (this.containsError(recentOutput)) {
                suggestions.push(...this.getErrorRecoverySuggestions(ctx))
            }
        }

        // File system suggestions
        if (ctx.fileSystem) {
            suggestions.push(...this.getFileSystemSuggestions(ctx))
        }

        // Sort by confidence and return top suggestions
        return suggestions
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10)
    }

    /**
     * Analyze recent commands for optimization
     */
    async analyzeCommands (commands: string[]): Promise<CommandAnalysis> {
        const suggestions: CommandSuggestion[] = []
        const optimizationTips: string[] = []
        const commonMistakes: string[] = []

        // Analyze commands for common patterns and mistakes
        commands.forEach((cmd, index) => {
            // Check for inefficient patterns
            if (this.isInefficientPattern(cmd, commands.slice(0, index))) {
                optimizationTips.push(`Command "${cmd}" might be inefficient. Consider combining with previous commands.`)
            }

            // Check for common mistakes
            const mistake = this.detectCommonMistake(cmd)
            if (mistake) {
                commonMistakes.push(mistake)
            }
        })

        const context = this.terminalContext.getActiveContextSnapshot()
        if (context) {
            const contextSuggestions = await this.getSuggestions(context)
            suggestions.push(...contextSuggestions)
        }

        return {
            suggestions,
            optimizationTips,
            commonMistakes,
        }
    }

    /**
     * Get git-based command suggestions
     */
    private getGitSuggestions (context: TerminalContext): CommandSuggestion[] {
        const suggestions: CommandSuggestion[] = []

        if (!context.gitStatus) {
            return suggestions
        }

        if (!context.gitStatus.clean) {
            if (context.gitStatus.modified.length > 0) {
                suggestions.push({
                    command: 'git status',
                    description: 'View detailed git status',
                    confidence: 0.9,
                    category: 'git_operations',
                    icon: '📊',
                })

                if (context.gitStatus.staged.length === 0) {
                    suggestions.push({
                        command: 'git add .',
                        description: 'Stage all modified files',
                        confidence: 0.8,
                        category: 'git_operations',
                        icon: '➕',
                    })
                } else {
                    suggestions.push({
                        command: 'git commit -m "..."',
                        description: 'Commit staged changes',
                        confidence: 0.9,
                        category: 'git_operations',
                        icon: '💾',
                    })
                }
            }

            if (context.gitStatus.untracked.length > 0) {
                suggestions.push({
                    command: 'git add <untracked-file>',
                    description: 'Add untracked files to staging',
                    confidence: 0.8,
                    category: 'git_operations',
                    icon: '➕',
                })
            }
        } else {
            suggestions.push({
                command: 'git log',
                description: 'View commit history',
                confidence: 0.7,
                category: 'git_operations',
                icon: '📜',
            })
        }

        return suggestions
    }

    /**
     * Get directory-based suggestions
     */
    private getDirectorySuggestions (context: TerminalContext): CommandSuggestion[] {
        const suggestions: CommandSuggestion[] = []

        if (!context.currentDirectory) {
            return suggestions
        }

        // Common directory operations
        suggestions.push({
            command: 'ls -la',
            description: 'List all files with details',
            confidence: 0.8,
            category: 'file_operations',
            icon: '📋',
        })

        suggestions.push({
            command: 'pwd',
            description: 'Show current directory',
            confidence: 0.9,
            category: 'system_info',
            icon: '📍',
        })

        // Check if directory might be a project
        if (this.looksLikeProject(context)) {
            suggestions.push({
                command: 'find . -name "*.json" -o -name "*.yaml" -o -name "*.yml" | head -5',
                description: 'Find configuration files',
                confidence: 0.7,
                category: 'file_operations',
                icon: '🔍',
            })
        }

        return suggestions
    }

    /**
     * Get error recovery suggestions
     */
    private getErrorRecoverySuggestions (context: TerminalContext): CommandSuggestion[] {
        const suggestions: CommandSuggestion[] = []
        const recentOutput = context.recentOutput.join('\n')

        // Permission errors
        if (recentOutput.match(/Permission denied/i)) {
            suggestions.push({
                command: 'ls -la',
                description: 'Check file permissions',
                confidence: 0.8,
                category: 'system_info',
                icon: '🔐',
            })
        }

        // Command not found
        if (recentOutput.match(/command not found/i)) {
            suggestions.push({
                command: 'which <command>',
                description: 'Check if command exists in PATH',
                confidence: 0.9,
                category: 'system_info',
                icon: '🔍',
            })
        }

        // File not found
        if (recentOutput.match(/No such file or directory/i)) {
            suggestions.push({
                command: 'find . -name "<filename>"',
                description: 'Search for the file',
                confidence: 0.8,
                category: 'file_operations',
                icon: '🔍',
            })
        }

        return suggestions
    }

    /**
     * Get file system-based suggestions
     */
    private getFileSystemSuggestions (context: TerminalContext): CommandSuggestion[] {
        const suggestions: CommandSuggestion[] = []

        if (!context.fileSystem) {
            return suggestions
        }

        // If directory has many files, suggest filtering
        if (context.fileSystem.entries.length > 20) {
            suggestions.push({
                command: 'ls | grep <pattern>',
                description: 'Filter files by pattern',
                confidence: 0.7,
                category: 'file_operations',
                icon: '🔍',
            })
        }

        return suggestions
    }

    /**
     * Initialize command templates
     */
    private initializeCommandTemplates (): void {
        // This can be expanded with more sophisticated templates
        // For now, we use pattern matching in getSuggestions methods
        // Templates stored in _commandTemplates for future use
    }

    /**
     * Check if recent output contains errors
     */
    private containsError (output: string): boolean {
        const errorPatterns = [
            /error/i,
            /failed/i,
            /Permission denied/i,
            /command not found/i,
            /No such file/i,
        ]
        return errorPatterns.some(pattern => pattern.test(output))
    }

    /**
     * Check if a command pattern is inefficient
     */
    private isInefficientPattern (cmd: string, previousCommands: string[]): boolean {
        // Detect if commands could be combined (e.g., multiple cd commands)
        const cdPattern = /^cd\s/
        if (cdPattern.test(cmd)) {
            return previousCommands.some(prev => cdPattern.test(prev))
        }

        // Detect if multiple similar commands could be combined
        if (previousCommands.length > 0) {
            const lastCmd = previousCommands[previousCommands.length - 1]
            if (cmd === lastCmd) {
                return true // Repeated command
            }
        }

        return false
    }

    /**
     * Detect common mistakes in commands
     */
    private detectCommonMistake (cmd: string): string | null {
        // Check for common typos
        if (cmd.match(/^cd\s+\.\.\./)) {
            return `"cd ..." should be "cd ../.." (two dots, not three)`
        }

        // Check for dangerous commands
        if (cmd.match(/rm\s+-rf\s+(\/|~|\*)/)) {
            return `Warning: This command may delete important files. Double-check before running.`
        }

        // Check for missing sudo where needed
        if (cmd.match(/^(install|apt-get|yum|brew install)/) && !cmd.match(/^sudo/)) {
            return `This command might require sudo/administrator privileges`
        }

        return null
    }

    /**
     * Check if current directory looks like a project directory
     */
    private looksLikeProject (context: TerminalContext): boolean {
        if (!context.currentDirectory) {
            return false
        }

        // Check for common project files (would need file system context)
        // For now, check directory name patterns
        const projectPatterns = [
            /(project|app|src|lib|bin|node_modules|package\.json|\.git)/,
        ]

        return projectPatterns.some(pattern => pattern.test(context.currentDirectory || ''))
    }

    /**
     * Generate script from natural language description
     */
    async generateScript (description: string, context?: TerminalContext): Promise<string | null> {
        // This would integrate with AI to generate scripts
        // For now, return a placeholder that can be enhanced with AI integration
        // Context parameter reserved for future AI integration
        void context

        // Simple pattern matching for common scripts
        if (description.match(/list.*files/i)) {
            return 'ls -la'
        }
        if (description.match(/find.*file/i)) {
            const fileMatch = description.match(/find\s+(.+?)(?:\s|$)/i)
            return fileMatch ? `find . -name "${fileMatch[1]}"` : 'find . -name "<pattern>"'
        }
        if (description.match(/show.*git.*status/i)) {
            return 'git status'
        }
        if (description.match(/commit.*changes/i)) {
            return 'git add . && git commit -m "Your commit message"'
        }

        // For complex requests, this would use AI
        return null
    }
}

