import { TerminalColorSchemeProvider, TerminalColorScheme } from 'tlink-terminal';
export declare class ColorSchemes extends TerminalColorSchemeProvider {
    getSchemes(): Promise<TerminalColorScheme[]>;
}
