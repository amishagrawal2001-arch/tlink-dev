/// <reference types="node" />
import { SessionMiddleware } from '../api/middleware';
export interface InputProcessingOptions {
    backspace: 'ctrl-h' | 'ctrl-?' | 'delete' | 'backspace';
}
export declare class InputProcessor extends SessionMiddleware {
    private options;
    constructor(options: InputProcessingOptions);
    feedFromTerminal(data: Buffer): void;
}
