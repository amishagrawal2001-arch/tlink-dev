import { ElementRef } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
/** @hidden */
export declare class SetVaultPassphraseModalComponent {
    private modalInstance;
    passphrase: string;
    showPassphrase: boolean;
    input: ElementRef;
    constructor(modalInstance: NgbActiveModal);
    ngOnInit(): void;
    ok(): void;
    cancel(): void;
}
