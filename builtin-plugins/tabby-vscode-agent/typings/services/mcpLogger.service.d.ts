import { ConfigService } from 'tabby-core';
/**
 * Logger service for MCP module
 * Provides logging capabilities with debug mode toggle
 */
export declare class McpLoggerService {
    private config;
    private debugEnabled;
    constructor(config: ConfigService);
    /**
     * Set debug mode enabled/disabled
     */
    setDebugEnabled(enabled: boolean): void;
    /**
     * Log an informational message
     */
    info(message: string): void;
    /**
     * Log a debug message (only shown when debug logging is enabled)
     */
    debug(message: string, data?: any): void;
    /**
     * Log an error message
     */
    error(message: string, error?: any): void;
    /**
     * Log a warning message
     */
    warn(message: string, data?: any): void;
}
