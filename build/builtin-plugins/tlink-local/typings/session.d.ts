/// <reference types="node" />
import { Injector } from '@angular/core';
import { BaseSession } from 'tlink-terminal';
import { SessionOptions, ChildProcess } from './api';
/** @hidden */
export declare class Session extends BaseSession {
    private pty;
    private ptyClosed;
    private pauseAfterExit;
    private guessedCWD;
    private initialCWD;
    private config;
    private hostApp;
    private bootstrapData;
    private ptyInterface;
    constructor(injector: Injector);
    start(options: SessionOptions): Promise<void>;
    getID(): string | null;
    resize(columns: number, rows: number): void;
    write(data: Buffer): void;
    kill(signal?: string): void;
    getChildProcesses(): Promise<ChildProcess[]>;
    gracefullyKillProcess(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
    private guessWindowsCWD;
}
