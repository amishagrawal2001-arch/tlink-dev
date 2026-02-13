/// <reference types="node" />
import { Logger } from 'tlink-core';
import { SessionMiddleware } from '../api/middleware';
export interface LoginScript {
    expect: string;
    send: string;
    isRegex?: boolean;
    optional?: boolean;
}
export interface LoginScriptsOptions {
    scripts?: LoginScript[];
}
export declare class LoginScriptProcessor extends SessionMiddleware {
    private logger;
    private remainingScripts;
    private escapeSeqMap;
    constructor(logger: Logger, options: LoginScriptsOptions);
    feedFromSession(data: Buffer): void;
    executeUnconditionalScripts(): void;
    unescape(line: string): string;
}
