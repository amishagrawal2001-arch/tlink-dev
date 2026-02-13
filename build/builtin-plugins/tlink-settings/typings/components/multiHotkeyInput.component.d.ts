import { EventEmitter } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Hotkey } from 'tlink-core';
/** @hidden */
export declare class MultiHotkeyInputComponent {
    private ngbModal;
    hotkeys: Hotkey[];
    hotkeysChange: EventEmitter<any>;
    constructor(ngbModal: NgbModal);
    ngOnChanges(): void;
    editItem(item: Hotkey): void;
    addItem(): void;
    removeItem(item: Hotkey): void;
    private storeUpdatedHotkeys;
    protected castAny: (x: any) => any;
}
