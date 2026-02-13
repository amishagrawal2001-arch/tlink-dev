/**
 * Analyzed terminal output with error detection and suggestions
 */
export interface AnalyzedOutput {
    /** Whether errors were detected */
    hasErrors: boolean;
    /** Detected errors */
    errors: DetectedError[];
    /** Whether warnings were detected */
    hasWarnings: boolean;
    /** Detected warnings */
    warnings: DetectedWarning[];
    /** Suggested fixes for errors */
    suggestions: ErrorSuggestion[];
    /** Summary of the output */
    summary: string;
}
/**
 * Detected error in terminal output
 */
export interface DetectedError {
    /** Error type/category */
    type: ErrorType;
    /** Error message */
    message: string;
    /** Line number in output (if available) */
    line?: number;
    /** Command that caused the error (if available) */
    command?: string;
    /** Full error context */
    context: string;
}
/**
 * Error types that can be detected
 */
export type ErrorType = 'permission_denied' | 'command_not_found' | 'file_not_found' | 'compilation_error' | 'runtime_error' | 'network_error' | 'syntax_error' | 'dependency_error' | 'configuration_error' | 'other';
/**
 * Detected warning in terminal output
 */
export interface DetectedWarning {
    /** Warning type */
    type: WarningType;
    /** Warning message */
    message: string;
    /** Line number in output */
    line?: number;
    /** Warning context */
    context: string;
}
/**
 * Warning types
 */
export type WarningType = 'deprecation' | 'performance' | 'security' | 'best_practice' | 'other';
/**
 * Suggested fix for an error
 */
export interface ErrorSuggestion {
    /** Error this suggestion addresses */
    errorType: ErrorType;
    /** Suggested fix description */
    fix: string;
    /** Suggested command(s) to run */
    commands?: string[];
    /** Confidence level (0-1) */
    confidence: number;
    /** Link to documentation (optional) */
    documentationUrl?: string;
}
export declare class TerminalOutputAnalyzerService {
    private errorPatterns;
    private warningPatterns;
    constructor();
    /**
     * Analyze terminal output for errors, warnings, and suggestions
     */
    analyzeOutput(output: string, context?: {
        command?: string;
        directory?: string;
        recentOutput?: string[];
    }): Promise<AnalyzedOutput>;
    /**
     * Initialize error and warning detection patterns
     */
    private initializePatterns;
    /**
     * Generate suggestions for detected errors
     */
    private generateSuggestions;
    /**
     * Generate a summary of the analyzed output
     */
    private generateSummary;
}
