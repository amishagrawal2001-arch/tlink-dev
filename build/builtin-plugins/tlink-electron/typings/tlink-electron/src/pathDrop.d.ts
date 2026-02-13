import { TerminalDecorator, BaseTerminalTabComponent } from 'tlink-terminal';
/** @hidden */
export declare class PathDropDecorator extends TerminalDecorator {
    attach(terminal: BaseTerminalTabComponent<any>): void;
    private injectPath;
}
