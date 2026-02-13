import { BaseTool } from './base-tool';
import { McpLoggerService } from '../../services/mcpLogger.service';
import { AppService } from 'tabby-core';
/**
 * Tool for opening the VSCode Copilot chat window.
 */
export declare class OpenCopilotTool extends BaseTool {
    private app;
    constructor(app: AppService, logger: McpLoggerService);
    private openCopilotWithTcp;
    private openCopilotWithShell;
    getTool(): {
        name: string;
        description: string;
        schema: {};
        handler: () => Promise<import("../../type/types").McpResponse>;
    };
}
