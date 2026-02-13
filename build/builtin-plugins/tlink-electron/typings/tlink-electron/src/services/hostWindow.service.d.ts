import type { BrowserWindow, TouchBar } from 'electron';
import { NgZone } from '@angular/core';
import { BootstrapData, HostWindowService } from 'tlink-core';
import { ElectronService } from '../services/electron.service';
export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export declare class ElectronHostWindow extends HostWindowService {
    private electron;
    private bootstrapData;
    get isFullscreen(): boolean;
    private _isFullscreen;
    private _isMaximized;
    constructor(zone: NgZone, electron: ElectronService, bootstrapData: BootstrapData);
    getWindow(): BrowserWindow;
    openDevTools(): void;
    reload(): void;
    setTitle(title?: string): void;
    toggleFullscreen(): void;
    minimize(): void;
    isMaximized(): boolean;
    toggleMaximize(): void;
    close(): void;
    setBounds(bounds: Bounds): void;
    setAlwaysOnTop(flag: boolean): void;
    setTouchBar(touchBar: TouchBar): void;
    setTrafficLightPosition(x: number, y: number): void;
    setOpacity(opacity: number): void;
    setProgressBar(value: number): void;
    bringToFront(): void;
}
