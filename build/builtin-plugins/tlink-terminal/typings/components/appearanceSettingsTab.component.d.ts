import { Observable } from 'rxjs';
import { ConfigService, PlatformService, ThemesService } from 'tlink-core';
/** @hidden */
export declare class AppearanceSettingsTabComponent {
    config: ConfigService;
    themes: ThemesService;
    private platform;
    fonts: string[];
    constructor(config: ConfigService, themes: ThemesService, platform: PlatformService);
    ngOnInit(): Promise<void>;
    fontAutocomplete: (text$: Observable<string>) => Observable<string[]>;
    getPreviewFontFamily(): string;
    saveConfiguration(requireRestart?: boolean): void;
    fixFontSize(): void;
}
