import { Observable } from 'rxjs';
import { McpLoggerService } from './mcpLogger.service';
/**
 * Interface for command history entry
 */
export interface CommandHistoryEntry {
    id: string;
    command: string;
    output: string;
    promptShell: string | null;
    exitCode: number | null;
    timestamp: number;
    aborted: boolean;
    tabId: string;
    tabTitle?: string;
    duration?: number;
}
/**
 * Service to manage command execution history
 */
export declare class CommandHistoryManagerService {
    private logger;
    private readonly MAX_HISTORY_ENTRIES;
    private commandHistory;
    /** Observable for command history */
    get commandHistory$(): Observable<CommandHistoryEntry[]>;
    /** Get current command history */
    get history(): CommandHistoryEntry[];
    constructor(logger: McpLoggerService);
    /**
     * Add a command to history
     */
    addCommand(entry: Omit<CommandHistoryEntry, 'id'>): string;
    /**
     * Get a command from history by ID
     */
    getCommand(id: string): CommandHistoryEntry | null;
    /**
     * Remove a command from history
     */
    removeCommand(id: string): boolean;
    /**
     * Clear all command history
     */
    clearHistory(): void;
    /**
     * Get filtered history by search term
     */
    searchHistory(searchTerm: string): CommandHistoryEntry[];
    /**
     * Get history filtered by success/failure
     */
    getFilteredHistory(filter: 'all' | 'success' | 'failed' | 'aborted'): CommandHistoryEntry[];
    /**
     * Copy command to clipboard
     */
    copyCommand(id: string): Promise<boolean>;
    /**
     * Copy command output to clipboard
     */
    copyOutput(id: string): Promise<boolean>;
    /**
     * Export all command history as commands only
     */
    exportCommandsOnly(entries?: CommandHistoryEntry[]): string;
    /**
     * Export all command history with output
     */
    exportCommandsWithOutput(entries?: CommandHistoryEntry[]): string;
    /**
     * Export command history as JSON
     */
    exportAsJSON(entries?: CommandHistoryEntry[]): string;
    /**
     * Export command history as CSV
     */
    exportAsCSV(entries?: CommandHistoryEntry[]): string;
    /**
     * Export command history as Markdown
     */
    exportAsMarkdown(entries?: CommandHistoryEntry[]): string;
    /**
     * Escape CSV field (handle commas, quotes, newlines)
     */
    private escapeCsvField;
    /**
     * Format duration for display
     */
    private formatDuration;
    /**
     * Generate unique entry ID
     */
    private generateEntryId;
    /**
     * Save history to localStorage
     */
    private saveHistoryToStorage;
    /**
     * Load history from localStorage
     */
    private loadHistoryFromStorage;
    /**
     * Download export content as file
     */
    downloadExport(content: string, filename: string, mimeType?: string): Promise<boolean>;
    /**
     * Copy export content to clipboard
     */
    copyExportToClipboard(content: string): Promise<boolean>;
}
