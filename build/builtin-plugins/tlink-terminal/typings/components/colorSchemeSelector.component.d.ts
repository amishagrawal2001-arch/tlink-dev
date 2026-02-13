import { ChangeDetectorRef, EventEmitter } from '@angular/core';
import { ConfigService } from 'tlink-core';
import { TerminalColorSchemeProvider } from '../api/colorSchemeProvider';
import { TerminalColorScheme } from '../api/interfaces';
/** @hidden */
export declare class ColorSchemeSelectorComponent {
    private colorSchemeProviders;
    private changeDetector;
    config: ConfigService;
    allColorSchemes: TerminalColorScheme[];
    filter: string;
    model?: TerminalColorScheme;
    modelChange: EventEmitter<TerminalColorScheme | undefined>;
    true: any;
    constructor(colorSchemeProviders: TerminalColorSchemeProvider[], changeDetector: ChangeDetectorRef, config: ConfigService);
    ngOnInit(): Promise<void>;
    selectScheme(scheme: TerminalColorScheme | undefined): void;
}
