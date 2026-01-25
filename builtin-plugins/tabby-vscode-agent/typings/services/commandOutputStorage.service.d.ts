import { McpLoggerService } from './mcpLogger.service';
/**
 * Interface for stored command output
 */
export interface StoredCommandOutput {
    id: string;
    command: string;
    output: string;
    promptShell: string | null;
    exitCode: number | null;
    timestamp: number;
    aborted: boolean;
    tabId: number;
}
/**
 * Service for storing and retrieving command outputs
 * Uses in-memory storage for simplicity, but could be extended to use a database
 */
export declare class CommandOutputStorageService {
    private logger;
    private outputs;
    constructor(logger: McpLoggerService);
    /**
     * Store a command output
     * @param data Command output data
     * @returns The ID of the stored output
     */
    storeOutput(data: Omit<StoredCommandOutput, 'id'>): string;
    /**
     * Get a stored command output
     * @param id The ID of the stored output
     * @returns The stored output or null if not found
     */
    getOutput(id: string): StoredCommandOutput | null;
    /**
     * Get a paginated portion of a stored command output
     * @param id The ID of the stored output
     * @param startLine The starting line number (1-based)
     * @param maxLines The maximum number of lines to return
     * @returns The paginated output data or null if not found
     */
    getPaginatedOutput(id: string, startLine?: number, maxLines?: number): {
        lines: string[];
        totalLines: number;
        part: number;
        totalParts: number;
        command: string;
        exitCode: number | null;
        promptShell: string | null;
        aborted: boolean;
    } | null;
}
