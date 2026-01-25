import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { LogService } from 'tabby-core';
import { Observable } from 'rxjs';
import { MinimizedDialogManagerService } from './minimizedDialogManager.service';
/**
 * Service to manage dialogs in the application
 * Ensures only one dialog is displayed at a time
 */
export declare class DialogManagerService {
    private ngbModal;
    private minimizedDialogManager;
    private activeDialog;
    private dialogQueue;
    private logger;
    private dialogOpened;
    private dialogClosed;
    /** Observable that fires when a dialog is opened */
    get dialogOpened$(): Observable<any>;
    /** Observable that fires when a dialog is closed */
    get dialogClosed$(): Observable<any>;
    /**
     * Event handler to trap tab key within the modal
     * This prevents users from tabbing outside the modal
     */
    private trapTabKey;
    constructor(ngbModal: NgbModal, log: LogService, minimizedDialogManager: MinimizedDialogManagerService);
    /**
     * Check if a dialog is currently active
     */
    get hasActiveDialog(): boolean;
    /**
     * Get the number of dialogs in the queue
     */
    get queueLength(): number;
    /**
     * Open a dialog
     * @param component Component to open
     * @param options Modal options
     * @param props Properties to set on the component instance
     * @returns Promise with dialog result
     */
    openDialog(component: any, options?: any, props?: any): Promise<any>;
    /**
     * Close the active dialog
     */
    closeActiveDialog(): void;
    /**
     * Clear the dialog queue
     */
    clearQueue(): void;
    /**
     * Show a dialog
     * @param request Dialog request
     */
    private showDialog;
    /**
     * Handle dialog closed
     * @param result Dialog result
     * @param error Error if dialog was rejected
     */
    private handleDialogClosed;
    /**
     * Store promise resolver for minimized dialog
     */
    private storePromiseResolverForMinimizedDialog;
}
