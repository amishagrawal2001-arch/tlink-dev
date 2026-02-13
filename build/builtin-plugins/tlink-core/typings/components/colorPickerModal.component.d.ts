import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
/** @hidden */
export declare class ColorPickerModalComponent {
    private modalInstance;
    title: string;
    value: string;
    canReset: boolean;
    constructor(modalInstance: NgbActiveModal);
    apply(): void;
    reset(): void;
    cancel(): void;
}
