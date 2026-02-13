import { ConfigService, HostAppService, Platform, PlatformService } from 'tlink-core';
import type { TerminalButtonBarButton } from '../api/interfaces';
/** @hidden */
export declare class TerminalSettingsTabComponent {
    config: ConfigService;
    hostApp: HostAppService;
    private platform;
    Platform: typeof Platform;
    altKeyName: any;
    metaKeyName: any;
    buttonColors: {
        value: string;
        label: string;
    }[];
    buttonActions: {
        value: string;
        label: string;
    }[];
    true: any;
    constructor(config: ConfigService, hostApp: HostAppService, platform: PlatformService);
    ngOnInit(): void;
    openWSLVolumeMixer(): void;
    trackByIndex(_index: number): number;
    addButton(): void;
    removeButton(button: TerminalButtonBarButton): void;
    private normalizeButtons;
}
