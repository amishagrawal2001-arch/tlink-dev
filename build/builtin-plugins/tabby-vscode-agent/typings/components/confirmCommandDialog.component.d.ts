import { AfterViewInit, OnDestroy, ElementRef } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { HotkeysService } from 'tabby-core';
import { MinimizedDialogManagerService } from '../services/minimizedDialogManager.service';
/**
 * Dialog component for confirming command execution
 */
export declare class ConfirmCommandDialogComponent implements AfterViewInit, OnDestroy {
    modal: NgbActiveModal;
    private hotkeysService;
    private minimizedDialogManager;
    command: string;
    tabId: number;
    tabTitle: string;
    commandExplanation: string;
    showRejectInput: boolean;
    rejectMessage: string;
    rejectMessageTextareaRef: ElementRef<HTMLTextAreaElement>;
    private hotkeysPaused;
    dialogId: string;
    constructor(modal: NgbActiveModal, hotkeysService: HotkeysService, minimizedDialogManager: MinimizedDialogManagerService);
    /**
     * After view init, pause hotkeys and set up focus management
     */
    ngAfterViewInit(): void;
    /**
     * Event handler to keep focus inside the modal
     */
    private keepFocusInModal;
    /**
     * Pause hotkeys when the dialog is focused
     */
    pauseHotkeys(): void;
    /**
     * Restore hotkeys when the dialog is closed
     */
    resumeHotkeys(): void;
    /**
     * Handle escape key to close dialog
     */
    onEscapePressed(): void;
    /**
     * Handle enter key to confirm
     */
    onEnterPressed(event: KeyboardEvent): void;
    /**
     * Handle 'r' key to show reject form
     */
    onRKeyPressed(event: KeyboardEvent): void;
    /**
     * Handle keydown events in the textarea
     * @param event Keyboard event
     */
    onTextareaKeyDown(event: KeyboardEvent): void;
    /**
     * Confirm command execution
     */
    confirm(): void;
    /**
     * Show the reject form
     */
    showRejectForm(): void;
    /**
     * Reject command execution with a reason
     */
    reject(): void;
    /**
     * Minimize the dialog
     */
    minimize(): void;
    /**
     * Cancel command execution
     */
    cancel(): void;
    /**
     * Clean up when component is destroyed
     */
    ngOnDestroy(): void;
}
/**
 * Module for ConfirmCommandDialogComponent
 * This allows the component to be used with NgModel
 */
export declare class ConfirmCommandDialogModule {
}
