/// <reference types="node" />
import { Injector } from '@angular/core';
import { ParsedShareSessionLink } from 'tlink-core';
import { BaseSession } from './session';
export type SharedSessionJoinErrorCode = 'CONNECTION_FAILED' | 'CONNECTION_CLOSED' | 'TIMEOUT' | 'SESSION_NOT_FOUND' | 'INVALID_TOKEN' | 'INVALID_PASSWORD' | 'SESSION_EXPIRED' | 'UNKNOWN';
export declare class SharedSessionJoinError extends Error {
    code: SharedSessionJoinErrorCode;
    constructor(code: SharedSessionJoinErrorCode, message: string);
}
export interface SharedSessionViewerStartOptions {
    password?: string;
}
export declare class SharedSessionViewerSession extends BaseSession {
    private link;
    private ws;
    private joined;
    private mode;
    get sharingMode(): 'read-only' | 'interactive';
    constructor(injector: Injector, link: ParsedShareSessionLink);
    start(options?: SharedSessionViewerStartOptions): Promise<void>;
    resize(_columns: number, _rows: number): void;
    write(data: Buffer): void;
    kill(_signal?: string): void;
    gracefullyKillProcess(): Promise<void>;
    supportsWorkingDirectory(): boolean;
    getWorkingDirectory(): Promise<string | null>;
    private connectAndJoin;
    private parseMessage;
    private mapJoinError;
    private closeSocket;
}
