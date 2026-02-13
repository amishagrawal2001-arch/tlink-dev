import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { HotkeysService, Keystroke, ConfigService } from 'tlink-core';
declare const BaseComponent: any;
/** @hidden */
export declare class HotkeyInputModalComponent extends BaseComponent {
    private modalInstance;
    hotkeys: HotkeysService;
    config: ConfigService;
    value: Keystroke[];
    timeoutProgress: number;
    private lastKeyEvent;
    private keyTimeoutInterval;
    constructor(modalInstance: NgbActiveModal, hotkeys: HotkeysService, config: ConfigService);
    splitKeys(keys: string): string[];
    ngOnInit(): void;
    ngOnDestroy(): void;
    close(): void;
}
export {};
