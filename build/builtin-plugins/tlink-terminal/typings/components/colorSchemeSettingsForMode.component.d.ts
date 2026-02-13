import { ChangeDetectorRef } from '@angular/core';
import { ConfigService, PlatformService, TranslateService } from 'tlink-core';
import { TerminalColorSchemeProvider } from '../api/colorSchemeProvider';
import { TerminalColorScheme } from '../api/interfaces';
/** @hidden */
export declare class ColorSchemeSettingsForModeComponent {
    private colorSchemeProviders;
    private changeDetector;
    private platform;
    private translate;
    config: ConfigService;
    configKey: 'colorScheme' | 'lightColorScheme';
    stockColorSchemes: TerminalColorScheme[];
    customColorSchemes: TerminalColorScheme[];
    allColorSchemes: TerminalColorScheme[];
    filter: string;
    editing: boolean;
    colorIndexes: number[];
    currentStockScheme: TerminalColorScheme | null;
    currentCustomScheme: TerminalColorScheme | null;
    true: any;
    constructor(colorSchemeProviders: TerminalColorSchemeProvider[], changeDetector: ChangeDetectorRef, platform: PlatformService, translate: TranslateService, config: ConfigService);
    ngOnInit(): Promise<void>;
    ngOnChanges(): void;
    selectScheme(scheme: TerminalColorScheme): void;
    update(): void;
    editScheme(): void;
    saveScheme(): void;
    cancelEditing(): void;
    deleteScheme(scheme: TerminalColorScheme): Promise<void>;
    getCurrentSchemeName(): string;
    findMatchingScheme(scheme: TerminalColorScheme, schemes: TerminalColorScheme[]): TerminalColorScheme | null;
    colorsTrackBy(index: any): any;
}
