/// <reference types="node" />
import { Injector } from '@angular/core';
import { Subject } from 'rxjs';
import { RDPProfile } from '../api';
interface BitmapData {
    x: number;
    y: number;
    width: number;
    height: number;
    bitsPerPixel: number;
    buffer: Buffer;
}
export declare class RDPSession {
    private client;
    private logger;
    profile: RDPProfile;
    open: boolean;
    willDestroy$: Subject<void>;
    bitmap$: Subject<BitmapData>;
    error$: Subject<Error>;
    constructor(injector: Injector, profile: RDPProfile);
    start(): Promise<void>;
    sendKeyEvent(code: number, isPressed: boolean, _extended?: boolean): void;
    sendPointerEvent(x: number, y: number, button: number, isPressed: boolean): void;
    destroy(): void;
}
export {};
