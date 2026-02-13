/// <reference types="node" />
import { ChildProcess, PTYInterface, PTYProxy } from 'tlink-local';
export declare class ElectronPTYInterface extends PTYInterface {
    spawn(...options: any[]): Promise<PTYProxy>;
    restore(id: string): Promise<ElectronPTYProxy | null>;
}
export declare class ElectronPTYProxy extends PTYProxy {
    private id;
    private subscriptions;
    private truePID;
    constructor(id: string);
    getID(): string;
    getTruePID(): Promise<number>;
    getPID(): Promise<number>;
    subscribe(event: string, handler: (..._: any[]) => void): void;
    ackData(length: number): void;
    unsubscribeAll(): void;
    resize(columns: number, rows: number): Promise<void>;
    write(data: Buffer): Promise<void>;
    kill(signal?: string): Promise<void>;
    getChildProcesses(): Promise<ChildProcess[]>;
    getChildProcessesInternal(truePID: number): Promise<ChildProcess[]>;
    getWorkingDirectory(): Promise<string | null>;
}
