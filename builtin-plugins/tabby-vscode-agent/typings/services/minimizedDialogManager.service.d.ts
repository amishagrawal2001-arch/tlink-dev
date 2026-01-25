import { Observable } from 'rxjs';
/**
 * Interface for minimized dialog data
 */
export interface MinimizedDialog {
    id: string;
    title: string;
    component: any;
    instance: any;
    modalRef: any;
    timestamp: number;
    promiseResolver?: {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    };
}
/**
 * Service to manage minimized dialogs
 */
export declare class MinimizedDialogManagerService {
    private minimizedDialogs;
    /** Observable for minimized dialogs */
    get minimizedDialogs$(): Observable<MinimizedDialog[]>;
    /** Get current minimized dialogs */
    get dialogs(): MinimizedDialog[];
    /**
     * Minimize a dialog
     */
    minimizeDialog(dialog: MinimizedDialog): void;
    /**
     * Restore a minimized dialog
     */
    restoreDialog(dialogId: string): MinimizedDialog | null;
    /**
     * Close a minimized dialog completely
     */
    closeMinimizedDialog(dialogId: string): void;
    /**
     * Check if a dialog is minimized
     */
    isDialogMinimized(dialogId: string): boolean;
    /**
     * Clear all minimized dialogs
     */
    clearAll(): void;
    /**
     * Generate unique dialog ID
     */
    generateDialogId(): string;
}
