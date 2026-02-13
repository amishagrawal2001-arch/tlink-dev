import { BaseTool } from './base-tool';
import { ExecToolCategory } from '../terminal';
import { McpLoggerService } from '../../services/mcpLogger.service';
/**
 * Tool for retrieving the current content (text buffer) of a terminal session
 *
 * This tool allows retrieving the text content of a terminal with options
 * to specify line ranges, useful for analyzing command output or terminal state.
 */
export declare class GetTerminalBufferTool extends BaseTool {
    private execToolCategory;
    private readonly MAX_LINES;
    constructor(execToolCategory: ExecToolCategory, logger: McpLoggerService);
    getTool(): {
        name: string;
        description: string;
        schema: {
            tabId: any;
            startLine: any;
            endLine: any;
        };
        handler: (params: any, extra: any) => Promise<import("../../type/types").McpResponse>;
    };
}
