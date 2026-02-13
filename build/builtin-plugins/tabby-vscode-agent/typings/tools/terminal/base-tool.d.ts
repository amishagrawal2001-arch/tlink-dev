import { McpTool } from '../../type/types';
import { McpLoggerService } from '../../services/mcpLogger.service';
/**
 * Base class for terminal tools
 */
export declare abstract class BaseTool<T = any> {
    protected logger: McpLoggerService;
    constructor(logger: McpLoggerService);
    /**
     * Get the tool definition
     */
    abstract getTool(): McpTool<T>;
}
