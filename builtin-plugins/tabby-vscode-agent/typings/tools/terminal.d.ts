import { AppService, BaseTabComponent, ConfigService } from 'tabby-core';
import { BaseTerminalTabComponent } from 'tabby-terminal';
import { BaseToolCategory } from './base-tool-category';
import { ShellContext } from './shell-strategy';
import { McpLoggerService } from '../services/mcpLogger.service';
import { CommandHistoryManagerService } from '../services/commandHistoryManager.service';
import { DialogService } from '../services/dialog.service';
import { RunningCommandsManagerService } from '../services/runningCommandsManager.service';
/**
 * Interface for terminal tab component with ID
 */
export interface TerminalTabLike extends BaseTerminalTabComponent<any> {
    title?: string;
    customTitle?: string;
    hasActivity?: boolean;
    hasFocus?: boolean;
}
export interface BaseTerminalTabComponentWithId {
    id: number;
    tabParent: BaseTabComponent;
    tab: TerminalTabLike;
}
/**
 * Interface for tracking active command
 */
export interface ActiveCommand {
    tabId: number;
    command: string;
    timestamp: number;
    startMarker: string;
    endMarker: string;
    abort: () => void;
}
/**
 * Terminal execution tool category
 * Provides tools for terminal commands execution and SSH session management
 */
export declare class ExecToolCategory extends BaseToolCategory {
    private app;
    private config;
    private dialogService;
    private commandHistoryManager;
    private runningCommandsManager;
    name: string;
    private _activeCommands;
    private _activeCommandsSubject;
    readonly activeCommands$: import("rxjs").Observable<Map<number, ActiveCommand>>;
    readonly activeCommand$: import("rxjs").Observable<ActiveCommand>;
    shellContext: ShellContext;
    constructor(app: AppService, logger: McpLoggerService, config: ConfigService, dialogService: DialogService, commandHistoryManager: CommandHistoryManagerService, runningCommandsManager: RunningCommandsManagerService);
    /**
     * Initialize and register all tools
     */
    private initializeTools;
    /**
     * Get current active command (legacy - returns first active command)
     */
    get activeCommand(): ActiveCommand | null;
    /**
     * Get active command for specific session
     */
    getActiveCommand(sessionId: number): ActiveCommand | null;
    /**
     * Set active command for a session and notify subscribers
     */
    setActiveCommand(command: ActiveCommand | null): void;
    /**
     * Clear active command for specific session
     */
    clearActiveCommand(sessionId: number): void;
    /**
     * Abort command for specific session
     */
    abortCommand(sessionId: number): void;
    /**
     * Abort the current command if any (legacy method)
     */
    abortCurrentCommand(): void;
    /**
     * Find all terminal sessions and map them to a serializable format
     * @returns Array of terminal sessions with IDs
     */
    findAndSerializeTerminalSessions(): BaseTerminalTabComponentWithId[];
    /**
     * Get terminal buffer content as text
     * @param session The terminal session
     * @returns The terminal buffer content as text
     */
    getTerminalBufferText(session: BaseTerminalTabComponentWithId): string;
}
