import { ElementRef } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
/** @hidden */
export declare class PromptModalComponent {
    private modalInstance;
    value: string;
    prompt: string | undefined;
    password: boolean;
    remember: boolean;
    showRememberCheckbox: boolean;
    secondaryValue: string;
    secondaryPrompt: string | undefined;
    secondaryPassword: boolean;
    secondaryPlaceholder: string | undefined;
    focusSecondary: boolean;
    showPassword: boolean;
    showSecondaryPassword: boolean;
    primaryInput: ElementRef;
    secondaryInput?: ElementRef;
    constructor(modalInstance: NgbActiveModal);
    ngOnInit(): void;
    ok(): void;
    cancel(): void;
}
