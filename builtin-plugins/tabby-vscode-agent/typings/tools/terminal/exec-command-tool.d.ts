import { BaseTool } from './base-tool';
import { ExecToolCategory } from '../terminal';
import { McpLoggerService } from '../../services/mcpLogger.service';
import { CommandOutputStorageService } from '../../services/commandOutputStorage.service';
import { CommandHistoryManagerService } from '../../services/commandHistoryManager.service';
import { AppService, ConfigService } from 'tabby-core';
import { DialogService } from '../../services/dialog.service';
import { RunningCommandsManagerService } from '../../services/runningCommandsManager.service';
/**
 * Tool for executing a command in a terminal session and retrieving the output.
 *
 * This tool allows executing shell commands in terminal sessions and handles
 * command execution, output capture, and result formatting.
 */
export declare class ExecCommandTool extends BaseTool {
    private execToolCategory;
    private config;
    private dialogService;
    private app;
    private runningCommandsManager;
    private readonly MAX_LINES_PER_RESPONSE;
    private outputStorage;
    private commandHistoryManager;
    private readonly DEFAULT_TYPING_DELAY;
    private readonly MAX_RETRY_ATTEMPTS;
    constructor(execToolCategory: ExecToolCategory, logger: McpLoggerService, config: ConfigService, dialogService: DialogService, app: AppService, runningCommandsManager: RunningCommandsManagerService, outputStorage?: CommandOutputStorageService, commandHistoryManager?: CommandHistoryManagerService);
    /**
     * Execute command with retry logic
     */
    private executeCommandWithRetry;
    /**
     * Handle aborted command logic
     */
    private handleAbortedCommand;
    /**
     * Handle successful command execution
     */
    private handleSuccessfulCommand;
    getTool(): {
        name: string;
        description: string;
        schema: {
            command: any;
            commandExplanation: any;
            tabId: any;
        };
        handler: (params: any, extra: any) => Promise<any>;
    };
}
