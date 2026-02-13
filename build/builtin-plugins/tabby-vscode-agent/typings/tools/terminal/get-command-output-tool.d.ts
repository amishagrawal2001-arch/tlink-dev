import { BaseTool } from './base-tool';
import { McpLoggerService } from '../../services/mcpLogger.service';
import { CommandOutputStorageService } from '../../services/commandOutputStorage.service';
/**
 * Tool for retrieving the full or paginated output of previously executed commands
 *
 * This tool allows accessing the complete output of commands that may have been
 * truncated in the initial response due to length limitations, with pagination
 * support for very long outputs.
 */
export declare class GetCommandOutputTool extends BaseTool {
    private readonly MAX_LINES_PER_RESPONSE;
    private outputStorage;
    constructor(logger: McpLoggerService, outputStorage?: CommandOutputStorageService);
    getTool(): {
        name: string;
        description: string;
        schema: {
            outputId: any;
            startLine: any;
            maxLines: any;
        };
        handler: (params: any) => Promise<import("../../type/types").McpResponse>;
    };
}
