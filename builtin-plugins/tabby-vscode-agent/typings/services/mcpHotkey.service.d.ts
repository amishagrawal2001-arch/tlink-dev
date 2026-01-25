import { AppService, HotkeysService } from 'tabby-core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ExecToolCategory } from '../tools/terminal';
import { McpLoggerService } from './mcpLogger.service';
/**
 * Service for handling MCP-related hotkeys
 */
export declare class McpHotkeyService {
    private hotkeysService;
    private execToolCategory;
    private logger;
    private modal;
    private app;
    constructor(hotkeysService: HotkeysService, execToolCategory: ExecToolCategory, logger: McpLoggerService, modal: NgbModal, app: AppService);
    private initializeHotkeys;
    /**
     * Abort command in the currently focused terminal session
     */
    private abortFocusedCommand;
    /**
     * Show command history dialog
     */
    private showCommandHistory;
    /**
     * Show running commands dialog
     */
    private showRunningCommands;
    /**
     * Open Copilot window
     */
    openCopilot(): void;
    private openCopilotViaTCP;
    private openCopilotWithPowerShell;
}
