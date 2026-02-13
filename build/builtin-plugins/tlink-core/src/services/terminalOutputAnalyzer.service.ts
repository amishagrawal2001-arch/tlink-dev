import { Injectable } from '@angular/core'

/**
 * Analyzed terminal output with error detection and suggestions
 */
export interface AnalyzedOutput {
    /** Whether errors were detected */
    hasErrors: boolean
    /** Detected errors */
    errors: DetectedError[]
    /** Whether warnings were detected */
    hasWarnings: boolean
    /** Detected warnings */
    warnings: DetectedWarning[]
    /** Suggested fixes for errors */
    suggestions: ErrorSuggestion[]
    /** Summary of the output */
    summary: string
}

/**
 * Detected error in terminal output
 */
export interface DetectedError {
    /** Error type/category */
    type: ErrorType
    /** Error message */
    message: string
    /** Line number in output (if available) */
    line?: number
    /** Command that caused the error (if available) */
    command?: string
    /** Full error context */
    context: string
}

/**
 * Error types that can be detected
 */
export type ErrorType =
    | 'permission_denied'
    | 'command_not_found'
    | 'file_not_found'
    | 'compilation_error'
    | 'runtime_error'
    | 'network_error'
    | 'syntax_error'
    | 'dependency_error'
    | 'configuration_error'
    | 'other'

/**
 * Detected warning in terminal output
 */
export interface DetectedWarning {
    /** Warning type */
    type: WarningType
    /** Warning message */
    message: string
    /** Line number in output */
    line?: number
    /** Warning context */
    context: string
}

/**
 * Warning types
 */
export type WarningType =
    | 'deprecation'
    | 'performance'
    | 'security'
    | 'best_practice'
    | 'other'

/**
 * Suggested fix for an error
 */
export interface ErrorSuggestion {
    /** Error this suggestion addresses */
    errorType: ErrorType
    /** Suggested fix description */
    fix: string
    /** Suggested command(s) to run */
    commands?: string[]
    /** Confidence level (0-1) */
    confidence: number
    /** Link to documentation (optional) */
    documentationUrl?: string
}

@Injectable({ providedIn: 'root' })
export class TerminalOutputAnalyzerService {
    // Error patterns for detection
    private errorPatterns: Array<{
        type: ErrorType
        patterns: RegExp[]
        extractor: (match: RegExpMatchArray, context: string) => DetectedError
    }> = []

    // Warning patterns
    private warningPatterns: Array<{
        type: WarningType
        patterns: RegExp[]
        extractor: (match: RegExpMatchArray, context: string) => DetectedWarning
    }> = []

    constructor () {
        this.initializePatterns()
    }

    /**
     * Analyze terminal output for errors, warnings, and suggestions
     */
    async analyzeOutput (output: string, context?: {
        command?: string
        directory?: string
        recentOutput?: string[]
    }): Promise<AnalyzedOutput> {
        const lines = output.split('\n')
        const errors: DetectedError[] = []
        const warnings: DetectedWarning[] = []

        // Analyze each line for errors and warnings
        lines.forEach((line, index) => {
            // Check for errors
            for (const errorDef of this.errorPatterns) {
                for (const pattern of errorDef.patterns) {
                    const match = line.match(pattern)
                    if (match) {
                        const error = errorDef.extractor(match, line)
                        error.line = index + 1
                        if (context?.command) {
                            error.command = context.command
                        }
                        errors.push(error)
                        break
                    }
                }
            }

            // Check for warnings
            for (const warningDef of this.warningPatterns) {
                for (const pattern of warningDef.patterns) {
                    const match = line.match(pattern)
                    if (match) {
                        const warning = warningDef.extractor(match, line)
                        warning.line = index + 1
                        warnings.push(warning)
                        break
                    }
                }
            }
        })

        // Generate suggestions for detected errors
        const suggestions = await this.generateSuggestions(errors, context)

        // Generate summary
        const summary = this.generateSummary(output, errors, warnings, suggestions)

        return {
            hasErrors: errors.length > 0,
            errors,
            hasWarnings: warnings.length > 0,
            warnings,
            suggestions,
            summary,
        }
    }

    /**
     * Initialize error and warning detection patterns
     */
    private initializePatterns (): void {
        // Permission denied errors
        this.errorPatterns.push({
            type: 'permission_denied',
            patterns: [
                /Permission denied/i,
                /EACCES/i,
                /Access denied/i,
                /Operation not permitted/i,
            ],
            extractor: (match, context) => ({
                type: 'permission_denied',
                message: match[0],
                context,
            }),
        })

        // Command not found errors
        this.errorPatterns.push({
            type: 'command_not_found',
            patterns: [
                /command not found/i,
                /CommandNotFoundException/i,
                /No such file or directory.*command/i,
            ],
            extractor: (match, context) => {
                const cmdMatch = context.match(/(?:^|\s)([a-zA-Z0-9_-]+)(?::|$|\s)/)
                return {
                    type: 'command_not_found',
                    message: `Command not found: ${cmdMatch?.[1] || 'unknown'}`,
                    context,
                }
            },
        })

        // File not found errors
        this.errorPatterns.push({
            type: 'file_not_found',
            patterns: [
                /No such file or directory/i,
                /FileNotFoundError/i,
                /Cannot find.*file/i,
                /ENOENT/i,
            ],
            extractor: (match, context) => {
                const fileMatch = context.match(/['"`]([^'"`]+)['"`]/)
                return {
                    type: 'file_not_found',
                    message: `File not found: ${fileMatch?.[1] || 'unknown'}`,
                    context,
                }
            },
        })

        // Compilation errors
        this.errorPatterns.push({
            type: 'compilation_error',
            patterns: [
                /error:.*expected/i,
                /SyntaxError/i,
                /Compilation failed/i,
                /error TS\d+/i, // TypeScript errors
                /error:.*undefined reference/i,
            ],
            extractor: (match, context) => ({
                type: 'compilation_error',
                message: match[0],
                context,
            }),
        })

        // Network errors
        this.errorPatterns.push({
            type: 'network_error',
            patterns: [
                /Connection refused/i,
                /Connection timeout/i,
                /Network is unreachable/i,
                /ECONNREFUSED/i,
                /ETIMEDOUT/i,
                /ENETUNREACH/i,
            ],
            extractor: (match, context) => ({
                type: 'network_error',
                message: match[0],
                context,
            }),
        })

        // Dependency errors
        this.errorPatterns.push({
            type: 'dependency_error',
            patterns: [
                /Module.*not found/i,
                /Cannot find module/i,
                /Package.*not found/i,
                /Dependency.*not found/i,
                /npm ERR/i,
                /yarn error/i,
            ],
            extractor: (match, context) => {
                const moduleMatch = context.match(/['"`]([^'"`]+)['"`]/)
                return {
                    type: 'dependency_error',
                    message: `Dependency not found: ${moduleMatch?.[1] || 'unknown'}`,
                    context,
                }
            },
        })

        // Configuration errors
        this.errorPatterns.push({
            type: 'configuration_error',
            patterns: [
                /Configuration error/i,
                /Invalid configuration/i,
                /Config file.*not found/i,
                /Invalid config/i,
            ],
            extractor: (match, context) => ({
                type: 'configuration_error',
                message: match[0],
                context,
            }),
        })

        // Warning patterns
        this.warningPatterns.push({
            type: 'deprecation',
            patterns: [
                /deprecated/i,
                /deprecation warning/i,
                /DEPRECATED/i,
            ],
            extractor: (match, context) => ({
                type: 'deprecation',
                message: match[0],
                context,
            }),
        })

        this.warningPatterns.push({
            type: 'performance',
            patterns: [
                /performance warning/i,
                /slow.*performance/i,
                /optimization/i,
            ],
            extractor: (match, context) => ({
                type: 'performance',
                message: match[0],
                context,
            }),
        })

        this.warningPatterns.push({
            type: 'security',
            patterns: [
                /security warning/i,
                /insecure/i,
                /vulnerability/i,
                /CVE-/i,
            ],
            extractor: (match, context) => ({
                type: 'security',
                message: match[0],
                context,
            }),
        })
    }

    /**
     * Generate suggestions for detected errors
     */
    private async generateSuggestions (
        errors: DetectedError[],
        context?: {
            command?: string
            directory?: string
            recentOutput?: string[]
        },
    ): Promise<ErrorSuggestion[]> {
        const suggestions: ErrorSuggestion[] = []

        for (const error of errors) {
            switch (error.type) {
                case 'permission_denied':
                    suggestions.push({
                        errorType: 'permission_denied',
                        fix: 'Check file permissions or use sudo/run as administrator',
                        commands: error.command ? [`sudo ${error.command}`] : ['chmod +x <file>', 'sudo <command>'],
                        confidence: 0.8,
                        documentationUrl: 'https://en.wikipedia.org/wiki/File_system_permissions',
                    })
                    break

                case 'command_not_found':
                    const cmdName = error.context.match(/(?:^|\s)([a-zA-Z0-9_-]+)/)?.[1]
                    if (cmdName) {
                        suggestions.push({
                            errorType: 'command_not_found',
                            fix: `Install the package containing "${cmdName}" or check if it's in your PATH`,
                            commands: [
                                `which ${cmdName}`,
                                `brew install ${cmdName}`,
                                `apt-get install ${cmdName}`,
                                `yum install ${cmdName}`,
                            ],
                            confidence: 0.7,
                        })
                    }
                    break

                case 'file_not_found':
                    const fileName = error.context.match(/['"`]([^'"`]+)['"`]/)?.[1]
                    if (fileName) {
                        suggestions.push({
                            errorType: 'file_not_found',
                            fix: `Check if the file exists or verify the path`,
                            commands: [`ls -la ${fileName}`, `find . -name "${fileName}"`, `ls -la $(dirname "${fileName}")`],
                            confidence: 0.9,
                        })
                    }
                    break

                case 'network_error':
                    suggestions.push({
                        errorType: 'network_error',
                        fix: 'Check network connectivity, firewall settings, or service availability',
                        commands: ['ping <host>', 'telnet <host> <port>', 'curl -v <url>'],
                        confidence: 0.6,
                    })
                    break

                case 'dependency_error':
                    const moduleName = error.context.match(/['"`]([^'"`]+)['"`]/)?.[1] || 
                                       error.context.match(/Module\s+['"`]?([^'"`\s]+)/i)?.[1]
                    if (moduleName) {
                        suggestions.push({
                            errorType: 'dependency_error',
                            fix: `Install the missing dependency`,
                            commands: [
                                `npm install ${moduleName}`,
                                `yarn add ${moduleName}`,
                                `pip install ${moduleName}`,
                            ],
                            confidence: 0.8,
                        })
                    }
                    break

                case 'compilation_error':
                    suggestions.push({
                        errorType: 'compilation_error',
                        fix: 'Review the compilation error message and fix syntax/type issues',
                        commands: ['npm run build', 'tsc --noEmit', 'gcc -Wall <file>'],
                        confidence: 0.5,
                    })
                    break

                default:
                    suggestions.push({
                        errorType: error.type,
                        fix: 'Review the error message for details',
                        confidence: 0.3,
                    })
            }
        }

        return suggestions
    }

    /**
     * Generate a summary of the analyzed output
     */
    private generateSummary (
        output: string,
        errors: DetectedError[],
        warnings: DetectedWarning[],
        suggestions: ErrorSuggestion[],
    ): string {
        if (errors.length === 0 && warnings.length === 0) {
            return 'No errors or warnings detected in terminal output.'
        }

        const parts: string[] = []

        if (errors.length > 0) {
            parts.push(`Found ${errors.length} error(s): ${errors.map(e => e.type).join(', ')}`)
        }

        if (warnings.length > 0) {
            parts.push(`Found ${warnings.length} warning(s): ${warnings.map(w => w.type).join(', ')}`)
        }

        if (suggestions.length > 0) {
            parts.push(`${suggestions.length} suggestion(s) available`)
        }

        return parts.join('. ')
    }
}

