/// <reference types="node" />
import { Injector } from '@angular/core';
import { BaseSession, ConnectableTerminalProfile, InputProcessingOptions, LoginScriptsOptions, StreamProcessingOptions } from 'tlink-terminal';
import { Observable } from 'rxjs';
export interface TelnetProfile extends ConnectableTerminalProfile {
    options: TelnetProfileOptions;
}
export interface TelnetProfileOptions extends StreamProcessingOptions, LoginScriptsOptions {
    host: string;
    port?: number;
    input: InputProcessingOptions;
}
declare enum TelnetCommands {
    SUBOPTION_SEND = 1,
    SUBOPTION_END = 240,
    GA = 249,
    SUBOPTION = 250,
    WILL = 251,
    WONT = 252,
    DO = 253,
    DONT = 254,
    IAC = 255
}
declare enum TelnetOptions {
    ECHO = 1,
    AUTH_OPTIONS = 37,
    SUPPRESS_GO_AHEAD = 3,
    TERMINAL_TYPE = 24,
    NEGO_WINDOW_SIZE = 31,
    NEGO_TERMINAL_SPEED = 32,
    STATUS = 5,
    REMOTE_FLOW_CONTROL = 33,
    X_DISPLAY_LOCATION = 35,
    NEW_ENVIRON = 39
}
export declare class TelnetSession extends BaseSession {
    profile: TelnetProfile;
    get serviceMessage$(): Observable<string>;
    private serviceMessage;
    private socket;
    private streamProcessor;
    private telnetProtocol;
    private lastWidth;
    private lastHeight;
    private requestedOptions;
    private telnetRemoteEcho;
    constructor(injector: Injector, profile: TelnetProfile);
    start(): Promise<void>;
    requestOption(cmd: TelnetCommands, option: TelnetOptions): void;
    emitServiceMessage(msg: string): void;
    onData(data: Buffer): void;
    emitTelnet(command: TelnetCommands, option: TelnetOptions): void;
    emitTelnetSuboption(option: TelnetOptions, value: Buffer): void;
    processTelnetProtocol(data: Buffer): Buffer;
    resize(w: number, h: number): void;
    private emitSize;
    write(data: Buffer): void;
    kill(_signal?: string): void;
    destroy(): Promise<void>;
    getChildProcesses(): Promise<any[]>;
    gracefullyKillProcess(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
}
export {};
