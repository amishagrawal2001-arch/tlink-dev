import { ElementRef, Injector } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
/** @hidden */
export declare class ShareSessionModalComponent {
    private modalInstance;
    private injector;
    shareUrl: string;
    mode: 'read-only' | 'interactive';
    viewers: number;
    expiresIn?: number;
    urlInput: ElementRef;
    private platform;
    constructor(modalInstance: NgbActiveModal, injector: Injector);
    ngOnInit(): void;
    copyUrl(): Promise<void>;
    close(): void;
}
