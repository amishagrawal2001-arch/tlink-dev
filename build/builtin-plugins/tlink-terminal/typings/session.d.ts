/// <reference types="node" />
import { Observable, Subject } from 'rxjs';
import { Logger } from 'tlink-core';
import { LoginScriptProcessor, LoginScriptsOptions } from './middleware/loginScriptProcessing';
import { OSCProcessor } from './middleware/oscProcessing';
import { SessionMiddlewareStack } from './api/middleware';
/**
 * A session object for a [[BaseTerminalTabComponent]]
 * Extend this to implement custom I/O and process management for your terminal tab
 */
export declare abstract class BaseSession {
    protected logger: Logger;
    open: boolean;
    readonly oscProcessor: OSCProcessor;
    readonly middleware: SessionMiddlewareStack;
    protected output: Subject<string>;
    protected binaryOutput: Subject<Buffer>;
    protected activity: Subject<void>;
    protected closed: Subject<void>;
    protected destroyed: Subject<void>;
    protected loginScriptProcessor: LoginScriptProcessor | null;
    protected reportedCWD?: string;
    private initialDataBuffer;
    private initialDataBufferReleased;
    get output$(): Observable<string>;
    get binaryOutput$(): Observable<Buffer>;
    get activity$(): Observable<void>;
    get closed$(): Observable<void>;
    get destroyed$(): Observable<void>;
    constructor(logger: Logger);
    feedFromTerminal(data: Buffer): void;
    protected emitOutput(data: Buffer): void;
    releaseInitialDataBuffer(): void;
    setLoginScriptsOptions(options: LoginScriptsOptions): void;
    destroy(): Promise<void>;
    abstract start(options: unknown): Promise<void>;
    abstract resize(columns: number, rows: number): void;
    abstract write(data: Buffer): void;
    abstract kill(signal?: string): void;
    abstract gracefullyKillProcess(): Promise<void>;
    abstract supportsWorkingDirectory(): boolean;
    abstract getWorkingDirectory(): Promise<string | null>;
}
