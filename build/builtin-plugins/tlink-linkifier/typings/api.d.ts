import { BaseTerminalTabComponent } from 'tlink-terminal';
export declare abstract class LinkHandler {
    regex: RegExp;
    priority: number;
    convert(uri: string, _tab?: BaseTerminalTabComponent<any>): Promise<string> | string;
    verify(_uri: string, _tab?: BaseTerminalTabComponent<any>): Promise<boolean> | boolean;
    abstract handle(uri: string, tab?: BaseTerminalTabComponent<any>): void;
    private _fullMatchRegex;
    get fullMatchRegex(): RegExp;
}
