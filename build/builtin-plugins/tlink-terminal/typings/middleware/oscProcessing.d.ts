/// <reference types="node" />
import { Observable } from 'rxjs';
import { SessionMiddleware } from '../api/middleware';
export declare class OSCProcessor extends SessionMiddleware {
    get cwdReported$(): Observable<string>;
    get copyRequested$(): Observable<string>;
    private cwdReported;
    private copyRequested;
    feedFromSession(data: Buffer): void;
    close(): void;
}
