import { DialogManagerService } from './dialogManager.service';
/**
 * Service to manage dialogs in the application
 * Uses DialogManagerService to ensure only one dialog is displayed at a time
 */
export declare class DialogService {
    private dialogManager;
    constructor(dialogManager: DialogManagerService);
    /**
     * Show command confirmation dialog
     * @param command Command to execute
     * @param tabId Tab ID
     * @param tabTitle Tab title
     * @param commandExplanation Optional explanation of what the command does
     * @returns Promise with dialog result
     */
    showConfirmCommandDialog(command: string, tabId: number, tabTitle: string, commandExplanation?: string): Promise<any>;
    /**
     * Show command result dialog
     * @param command Command executed
     * @param output Command output
     * @param exitCode Exit code
     * @param aborted Whether the command was aborted
     * @param originalInstruction Original instruction
     * @returns Promise with dialog result
     */
    showCommandResultDialog(command: string, output: string, exitCode: number | null, aborted: boolean, originalInstruction?: string): Promise<any>;
}
