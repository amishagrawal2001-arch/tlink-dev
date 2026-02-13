import { TerminalContext, TerminalContextService } from './terminalContext.service';
/**
 * Suggested command for the current context
 */
export interface CommandSuggestion {
    /** Command text */
    command: string;
    /** Command description */
    description: string;
    /** Confidence level (0-1) */
    confidence: number;
    /** Category of the command */
    category: CommandCategory;
    /** Icon/emoji for the command (optional) */
    icon?: string;
}
/**
 * Command categories
 */
export type CommandCategory = 'file_operations' | 'git_operations' | 'package_management' | 'system_info' | 'process_management' | 'network' | 'development' | 'other';
/**
 * Command analysis result
 */
export interface CommandAnalysis {
    /** Suggested next commands */
    suggestions: CommandSuggestion[];
    /** Optimization tips for recent commands */
    optimizationTips: string[];
    /** Common mistakes detected */
    commonMistakes: string[];
}
export declare class CommandSuggestionEngineService {
    private terminalContext;
    constructor(terminalContext: TerminalContextService);
    /**
     * Get context-aware command suggestions
     */
    getSuggestions(context?: TerminalContext): Promise<CommandSuggestion[]>;
    /**
     * Analyze recent commands for optimization
     */
    analyzeCommands(commands: string[]): Promise<CommandAnalysis>;
    /**
     * Get git-based command suggestions
     */
    private getGitSuggestions;
    /**
     * Get directory-based suggestions
     */
    private getDirectorySuggestions;
    /**
     * Get error recovery suggestions
     */
    private getErrorRecoverySuggestions;
    /**
     * Get file system-based suggestions
     */
    private getFileSystemSuggestions;
    /**
     * Initialize command templates
     */
    private initializeCommandTemplates;
    /**
     * Check if recent output contains errors
     */
    private containsError;
    /**
     * Check if a command pattern is inefficient
     */
    private isInefficientPattern;
    /**
     * Detect common mistakes in commands
     */
    private detectCommonMistake;
    /**
     * Check if current directory looks like a project directory
     */
    private looksLikeProject;
    /**
     * Generate script from natural language description
     */
    generateScript(description: string, context?: TerminalContext): Promise<string | null>;
}
