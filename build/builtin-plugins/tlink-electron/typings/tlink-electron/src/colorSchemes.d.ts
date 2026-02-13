import { TerminalColorSchemeProvider, TerminalColorScheme } from 'tlink-terminal';
/** @hidden */
export declare class HyperColorSchemes extends TerminalColorSchemeProvider {
    getSchemes(): Promise<TerminalColorScheme[]>;
}
