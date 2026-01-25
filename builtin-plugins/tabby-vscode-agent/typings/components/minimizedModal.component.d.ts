import { OnInit, OnDestroy } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { MinimizedDialogManagerService, MinimizedDialog } from '../services/minimizedDialogManager.service';
import { DialogManagerService } from '../services/dialogManager.service';
export declare class MinimizedDialogsModalComponent implements OnInit, OnDestroy {
    private activeModal;
    private minimizedDialogManager;
    private dialogManager;
    private modal;
    minimizedDialogs: MinimizedDialog[];
    private subscription;
    constructor(activeModal: NgbActiveModal, minimizedDialogManager: MinimizedDialogManagerService, dialogManager: DialogManagerService, modal: NgbModal);
    ngOnInit(): void;
    ngOnDestroy(): void;
    close(): void;
    /**
     * Restore a minimized dialog
     */
    restoreDialog(dialogId: string): Promise<void>;
    /**
     * Create a restored dialog without going through DialogManagerService
     * This prevents creating a new promise chain
     */
    private createRestoredDialog;
    /**
     * Close a minimized dialog permanently
     */
    closeDialog(dialogId: string): void;
    /**
     * Clear all minimized dialogs
     */
    clearAll(): void;
    /**
     * Get display title for a dialog
     */
    getDisplayTitle(dialog: MinimizedDialog): string;
    /**
     * Get relative time since dialog was minimized
     */
    getRelativeTime(timestamp: number): string;
    /**
     * Get the original props for a dialog component
     */
    private getDialogProps;
}
