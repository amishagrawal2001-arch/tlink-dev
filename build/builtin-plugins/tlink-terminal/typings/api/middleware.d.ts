/// <reference types="node" />
import { Subject, Observable } from 'rxjs';
export declare class SessionMiddleware {
    get outputToSession$(): Observable<Buffer>;
    get outputToTerminal$(): Observable<Buffer>;
    protected outputToSession: Subject<Buffer>;
    protected outputToTerminal: Subject<Buffer>;
    feedFromSession(data: Buffer): void;
    feedFromTerminal(data: Buffer): void;
    close(): void;
}
export declare class SessionMiddlewareStack extends SessionMiddleware {
    private stack;
    private subs;
    constructor();
    push(middleware: SessionMiddleware): void;
    unshift(middleware: SessionMiddleware): void;
    remove(middleware: SessionMiddleware): void;
    replace(middleware: SessionMiddleware, newMiddleware: SessionMiddleware): void;
    feedFromSession(data: Buffer): void;
    feedFromTerminal(data: Buffer): void;
    close(): void;
    private relink;
}
