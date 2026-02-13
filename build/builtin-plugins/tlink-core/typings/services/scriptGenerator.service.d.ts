import { TerminalContext } from './terminalContext.service';
/**
 * Generated script result
 */
export interface GeneratedScript {
    /** Script content */
    content: string;
    /** Script language/type */
    language: ScriptLanguage;
    /** Script description */
    description: string;
    /** Suggested filename */
    filename: string;
    /** Confidence level (0-1) */
    confidence: number;
    /** Script metadata */
    metadata?: {
        interpreter?: string;
        dependencies?: string[];
        estimatedRuntime?: string;
        requiresRoot?: boolean;
    };
}
/**
 * Supported script languages
 */
export type ScriptLanguage = 'bash' | 'zsh' | 'fish' | 'python' | 'powershell' | 'sh';
/**
 * Script generation options
 */
export interface ScriptGenerationOptions {
    /** Natural language description */
    description: string;
    /** Target script language */
    language?: ScriptLanguage;
    /** Include comments */
    includeComments?: boolean;
    /** Include error handling */
    includeErrorHandling?: boolean;
    /** Terminal context for script generation */
    context?: TerminalContext;
    /** Additional context/prompt */
    additionalContext?: string;
}
export declare class ScriptGeneratorService {
    private scriptTemplates;
    constructor();
    /**
     * Generate a script from natural language description
     */
    generateScript(options: ScriptGenerationOptions): Promise<GeneratedScript>;
    /**
     * Generate script from template
     */
    private generateFromTemplate;
    /**
     * Find matching template for a description
     */
    private findMatchingTemplate;
    /**
     * Generate script structure (basic shell script template)
     */
    private generateScriptStructure;
    /**
     * Initialize script templates
     */
    private initializeTemplates;
    /**
     * Get context value for template variable
     */
    private getContextValue;
    /**
     * Generate filename from description
     */
    private generateFilename;
    /**
     * Get file extension for language
     */
    private getFileExtension;
    /**
     * Get shebang for language
     */
    private getShebang;
    /**
     * Get comment prefix for language
     */
    private getCommentPrefix;
    /**
     * Get interpreter command for language
     */
    private getInterpreter;
    /**
     * Detect if script requires root permissions
     */
    private detectRootRequirement;
    /**
     * Format script for AI prompt (for AI-based generation)
     */
    formatScriptPrompt(description: string, language: ScriptLanguage, context?: TerminalContext): string;
    /**
     * Extract script from AI response
     */
    extractScriptFromResponse(response: string, language: ScriptLanguage): string | null;
}
