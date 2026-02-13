import { ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { HotkeysService } from 'tabby-core';
import { MinimizedDialogManagerService } from '../services/minimizedDialogManager.service';
/**
 * Dialog component for displaying command execution results
 */
export declare class CommandResultDialogComponent implements AfterViewInit, OnDestroy {
    modal: NgbActiveModal;
    private hotkeysService;
    private minimizedDialogManager;
    command: string;
    private _output;
    set output(value: string);
    get output(): string;
    exitCode: number | null;
    aborted: boolean;
    originalInstruction: string;
    userMessage: string;
    rejectionMessage: string;
    isRejectMode: boolean;
    messageTextareaRef: ElementRef<HTMLTextAreaElement>;
    outputTextareaRef: ElementRef<HTMLTextAreaElement>;
    private hotkeysPaused;
    dialogId: string;
    constructor(modal: NgbActiveModal, hotkeysService: HotkeysService, minimizedDialogManager: MinimizedDialogManagerService);
    /**
     * After view init, focus the textarea and pause hotkeys
     */
    ngAfterViewInit(): void;
    /**
     * Event handler to keep focus inside the modal
     */
    private keepFocusInModal;
    /**
     * Adjust textarea height to fit content
     * @param textarea Textarea element to adjust
     */
    private adjustTextareaHeight;
    /**
     * Pause hotkeys when the dialog is focused
     */
    pauseHotkeys(): void;
    /**
     * Restore hotkeys when the dialog is closed
     */
    resumeHotkeys(): void;
    /**
     * Handle escape key to close dialog or cancel reject mode
     */
    onEscapePressed(): void;
    /**
     * Handle R key to toggle reject mode
     */
    onRPressed(event: KeyboardEvent): void;
    /**
     * Handle Enter key to accept
     */
    onEnterPressed(event: KeyboardEvent): void;
    /**
     * Handle keydown events in the textarea
     * @param event Keyboard event
     */
    onTextareaKeyDown(event: KeyboardEvent): void;
    /**
     * Accept the command result with user message
     */
    accept(): void;
    /**
     * Toggle rejection mode
     */
    toggleRejectMode(): void;
    /**
     * Submit rejection with message
     */
    reject(): void;
    /**
     * Cancel and close the dialog
     */
    cancel(): void;
    /**
     * Minimize the dialog
     */
    minimize(): void;
    /**
     * Clean up when component is destroyed
     */
    ngOnDestroy(): void;
}
/**
 * Module for CommandResultDialogComponent
 * This allows the component to be used with NgModel
 */
export declare class CommandResultDialogModule {
}
