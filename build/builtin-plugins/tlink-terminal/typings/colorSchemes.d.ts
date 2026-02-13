import { TerminalColorScheme } from './api/interfaces';
import { TerminalColorSchemeProvider } from './api/colorSchemeProvider';
export declare class DefaultColorSchemes extends TerminalColorSchemeProvider {
    static defaultColorScheme: TerminalColorScheme;
    static defaultLightColorScheme: TerminalColorScheme;
    getSchemes(): Promise<TerminalColorScheme[]>;
}
