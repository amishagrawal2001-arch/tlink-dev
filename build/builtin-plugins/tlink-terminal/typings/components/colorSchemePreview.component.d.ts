import { ChangeDetectorRef } from '@angular/core';
import { ConfigService } from 'tlink-core';
import { TerminalColorScheme } from '../api/interfaces';
declare const BaseComponent: any;
/** @hidden */
export declare class ColorSchemePreviewComponent extends BaseComponent {
    config: ConfigService;
    scheme: TerminalColorScheme;
    fontPreview: boolean;
    constructor(config: ConfigService, changeDetector: ChangeDetectorRef);
    getPreviewFontFamily(): string;
}
export {};
