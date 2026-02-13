import { ConfigProvider } from 'tlink-core'

/** @hidden */
export class RDPConfigProvider extends ConfigProvider {
    defaults = {
        rdp: {
            defaultPort: 3389,
            defaultColorDepth: 24,
            defaultWidth: 1920,
            defaultHeight: 1080,
            enableAudio: true,
            enableClipboard: true,
            enablePrinting: false,
            enableDrives: false,
            enableWallpaper: true,
            enableThemes: true,
            enableFontSmoothing: true,
            enableDesktopComposition: true,
            enableNLA: true,
            enableTLS: true,
            compression: true,
            bitmapCaching: true,
        },
        hotkeys: {
            'restart-rdp-session': [],
        },
    }

    platformDefaults = {}
}

