import { SessionOptions } from '../api';
/** @hidden */
export declare class CommandLineEditorComponent {
    argvMode: boolean;
    _model: SessionOptions;
    command: string;
    get model(): SessionOptions;
    set model(value: SessionOptions);
    switchToCommand(): void;
    switchToArgv(): void;
    parseCommand(): void;
    updateCommand(): void;
    trackByIndex(index: any): any;
}
