import { ElementRef } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import type { TerminalButtonBarAction, TerminalButtonBarButton } from '../api/interfaces';
interface ButtonOption {
    value: string;
    label: string;
}
export declare class MapButtonModalComponent {
    modalInstance: NgbActiveModal;
    button: TerminalButtonBarButton | null;
    fileInput: ElementRef<HTMLInputElement>;
    model: TerminalButtonBarButton;
    actionOptions: ButtonOption[];
    colorOptions: ButtonOption[];
    constructor(modalInstance: NgbActiveModal);
    ngOnInit(): void;
    get isSendString(): boolean;
    get isRunScript(): boolean;
    get isRunLocal(): boolean;
    onActionChange(value: TerminalButtonBarAction): void;
    ok(): void;
    cancel(): void;
    onScriptKeydown(event: KeyboardEvent): void;
    browseFile(): void;
    onFileSelected(event: Event): void;
    private defaultModel;
}
export {};
