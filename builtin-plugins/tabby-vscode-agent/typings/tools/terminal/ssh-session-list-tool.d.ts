import { BaseTool } from './base-tool';
import { ExecToolCategory } from '../terminal';
import { McpLoggerService } from '../../services/mcpLogger.service';
/**
 * Tool for getting a list of all terminal sessions (SSH and local)
 *
 * This tool returns information about all available terminal sessions
 * that can be used with other terminal tools.
 */
export declare class SshSessionListTool extends BaseTool {
    private execToolCategory;
    constructor(execToolCategory: ExecToolCategory, logger: McpLoggerService);
    getTool(): {
        name: string;
        description: string;
        schema: {};
        handler: (_: any, extra: any) => Promise<import("../../type/types").McpResponse>;
    };
}
