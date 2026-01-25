import { McpTool, ToolCategory } from '../type/types';
import { McpLoggerService } from '../services/mcpLogger.service';
/**
 * Base class for all tool categories
 * Provides common functionality for tool management
 */
export declare abstract class BaseToolCategory implements ToolCategory {
    protected logger: McpLoggerService;
    constructor(logger: McpLoggerService);
    /**
     * The name of the tool category
     */
    abstract name: string;
    /**
     * List of MCP tools in this category
     */
    protected _mcpTools: McpTool<any>[];
    /**
     * Get all MCP tools in this category
     */
    get mcpTools(): McpTool<any>[];
    /**
     * Register a tool in this category
     */
    protected registerTool<T>(tool: McpTool<T>): void;
}
