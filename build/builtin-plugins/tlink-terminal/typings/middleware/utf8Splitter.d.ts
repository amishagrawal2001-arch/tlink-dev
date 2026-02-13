/// <reference types="node" />
import { SessionMiddleware } from '../api/middleware';
/**
 * Ensures that the session output is chunked at UTF8 character boundaries.
 */
export declare class UTF8SplitterMiddleware extends SessionMiddleware {
    private decoder;
    feedFromSession(data: Buffer): void;
    close(): void;
}
