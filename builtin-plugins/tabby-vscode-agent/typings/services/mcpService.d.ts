import { ExecToolCategory } from '../tools/terminal';
import { VSCodeToolCategory } from '../tools/vscode-tool-category';
import { ConfigService } from 'tabby-core';
import { McpLoggerService } from './mcpLogger.service';
/**
 * The main MCP server service for Tabby
 * Combines both MCP and HTTP server functionality
 */
export declare class McpService {
    config: ConfigService;
    private execToolCategory;
    private vscodeToolCategory;
    private logger;
    private server;
    private transports;
    private app;
    private isRunning;
    private toolCategories;
    private httpServer;
    constructor(config: ConfigService, execToolCategory: ExecToolCategory, vscodeToolCategory: VSCodeToolCategory, logger: McpLoggerService);
    /**
     * Register a tool category with the MCP server
     */
    private registerToolCategory;
    /**
     * Configure Express server
     */
    private configureExpress;
    /**
     * Configure API endpoints for tool access via HTTP
     */
    private configureToolEndpoints;
    /**
     * Initialize the MCP service
     */
    initialize(port: number): Promise<void>;
    /**
     * Start the MCP server
     * This is a convenience method for the UI
     */
    startServer(port: number): Promise<void>;
    /**
     * Stop the MCP service
     */
    stop(): Promise<void>;
    /**
     * Stop the MCP server
     * This is a convenience method for the UI
     */
    stopServer(): Promise<void>;
    /**
     * Check if the MCP server is running
     * @returns true if the server is running, false otherwise
     */
    isServerRunning(): boolean;
}
export * from '../type/types';
