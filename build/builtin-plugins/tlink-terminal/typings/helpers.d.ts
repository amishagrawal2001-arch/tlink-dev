import { TerminalColorScheme } from './api/interfaces';
import { ConfigService, ThemesService } from 'tlink-core';
export declare function getTerminalBackgroundColor(config: ConfigService, themes: ThemesService, scheme?: TerminalColorScheme): string | null;
