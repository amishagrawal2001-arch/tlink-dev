import { Observable } from 'rxjs';
export interface RunningCommand {
    tabId: string;
    command: string;
    startTime: number;
}
export declare class RunningCommandsManagerService {
    private runningCommandsSubject;
    runningCommands$: Observable<RunningCommand[]>;
    private runningCommands;
    constructor();
    /**
     * Get current running commands as observable
     */
    getRunningCommands(): Observable<RunningCommand[]>;
    /**
     * Get current running commands count
     */
    getRunningCommandsCount(): number;
    /**
     * Start tracking a command
     */
    startCommand(tabId: string, command: string): void;
    /**
     * Stop tracking a command
     */
    endCommand(tabId: string): void;
    /**
     * Get all running commands as array
     */
    getAllRunningCommands(): RunningCommand[];
    /**
     * Check if a command is running in a specific tab
     */
    isCommandRunning(tabId: string): boolean;
    /**
     * Get running command for a specific tab
     */
    getRunningCommand(tabId: string): RunningCommand | undefined;
    /**
     * Clear all running commands (useful for cleanup)
     */
    clearAll(): void;
    private updateSubject;
}
