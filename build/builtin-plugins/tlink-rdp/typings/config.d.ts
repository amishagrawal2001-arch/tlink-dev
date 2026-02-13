import { ConfigProvider } from 'tlink-core';
/** @hidden */
export declare class RDPConfigProvider extends ConfigProvider {
    defaults: {
        rdp: {
            defaultPort: number;
            defaultColorDepth: number;
            defaultWidth: number;
            defaultHeight: number;
            enableAudio: boolean;
            enableClipboard: boolean;
            enablePrinting: boolean;
            enableDrives: boolean;
            enableWallpaper: boolean;
            enableThemes: boolean;
            enableFontSmoothing: boolean;
            enableDesktopComposition: boolean;
            enableNLA: boolean;
            enableTLS: boolean;
            compression: boolean;
            bitmapCaching: boolean;
        };
        hotkeys: {
            'restart-rdp-session': never[];
        };
    };
    platformDefaults: {};
}
