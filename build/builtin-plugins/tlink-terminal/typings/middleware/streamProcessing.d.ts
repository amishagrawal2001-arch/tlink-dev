/// <reference types="node" />
import { SessionMiddleware } from '../api/middleware';
export type InputMode = null | 'local-echo' | 'readline' | 'readline-hex';
export type OutputMode = null | 'hex';
export type NewlineMode = null | 'cr' | 'lf' | 'crlf' | 'implicit_cr' | 'implicit_lf';
export interface StreamProcessingOptions {
    inputMode?: InputMode;
    inputNewlines?: NewlineMode;
    outputMode?: OutputMode;
    outputNewlines?: NewlineMode;
}
export declare class TerminalStreamProcessor extends SessionMiddleware {
    private options;
    forceEcho: boolean;
    private inputReadline;
    private inputPromptVisible;
    private inputReadlineInStream;
    private inputReadlineOutStream;
    private started;
    constructor(options: StreamProcessingOptions);
    start(): void;
    feedFromSession(data: Buffer): void;
    feedFromTerminal(data: Buffer): void;
    resize(): void;
    close(): void;
    private onTerminalInput;
    private onOutputSettled;
    private resetInputPrompt;
    private replaceNewlines;
}
