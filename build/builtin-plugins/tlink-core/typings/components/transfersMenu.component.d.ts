import { EventEmitter, OnInit, OnDestroy, ElementRef, NgZone } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FileTransfer, PlatformService } from '../api/platform';
/** @hidden */
export declare class TransfersMenuComponent implements OnInit, OnDestroy {
    private platform;
    private translate;
    private element;
    private zone;
    floating: boolean;
    get hasCustomPosition(): boolean;
    left: number | null;
    top: number | null;
    transfers: FileTransfer[];
    transfersChange: EventEmitter<FileTransfer[]>;
    floatingChange: EventEmitter<boolean>;
    private dragOffsetX;
    private dragOffsetY;
    private dragging;
    private dragMoveHandler;
    private dragUpHandler;
    constructor(platform: PlatformService, translate: TranslateService, element: ElementRef<HTMLElement>, zone: NgZone);
    ngOnInit(): void;
    ngOnDestroy(): void;
    isDownload(transfer: FileTransfer): boolean;
    getProgress(transfer: FileTransfer): number;
    getProgressLabel(transfer: FileTransfer): string;
    private formatBytes;
    showTransfer(transfer: FileTransfer): void;
    removeTransfer(transfer: FileTransfer): void;
    removeAll(): Promise<void>;
    toggleFloating(): void;
    startDrag(event: MouseEvent): void;
    private onDrag;
    private stopDrag;
}
