/// <reference types="node" />
import { SerialPortStream } from '@serialport/stream';
import { Observable } from 'rxjs';
import { Injector } from '@angular/core';
import { BaseSession, ConnectableTerminalProfile, InputProcessingOptions, LoginScriptsOptions, StreamProcessingOptions } from 'tlink-terminal';
export interface SerialProfile extends ConnectableTerminalProfile {
    options: SerialProfileOptions;
}
export interface SerialProfileOptions extends StreamProcessingOptions, LoginScriptsOptions {
    port: string;
    baudrate?: number;
    databits?: number;
    stopbits?: number;
    parity?: string;
    rtscts?: boolean;
    xon?: boolean;
    xoff?: boolean;
    xany?: boolean;
    slowSend?: boolean;
    input: InputProcessingOptions;
}
export declare const BAUD_RATES: number[];
export interface SerialPortInfo {
    name: string;
    description?: string;
}
export declare class SerialSession extends BaseSession {
    profile: SerialProfile;
    serial: SerialPortStream | null;
    get serviceMessage$(): Observable<string>;
    private serviceMessage;
    private streamProcessor;
    private zone;
    private notifications;
    private serialService;
    constructor(injector: Injector, profile: SerialProfile);
    start(): Promise<void>;
    write(data: Buffer): void;
    destroy(): Promise<void>;
    resize(_: any, __: any): void;
    kill(_?: string): void;
    emitServiceMessage(msg: string): void;
    getChildProcesses(): Promise<any[]>;
    gracefullyKillProcess(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
}
