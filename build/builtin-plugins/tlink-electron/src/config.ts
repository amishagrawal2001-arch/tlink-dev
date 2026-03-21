import { ConfigProvider, Platform } from 'tlink-core'

/** @hidden */
export class ElectronConfigProvider extends ConfigProvider {
    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                'toggle-window': ['Ctrl-Space'],
                'new-window': ['⌘-N'],
            },
        },
        [Platform.Windows]: {
            hotkeys: {
                'toggle-window': ['Ctrl-Space'],
                'new-window': ['Ctrl-Shift-N'],
            },
        },
        [Platform.Linux]: {
            hotkeys: {
                'toggle-window': ['Ctrl-Space'],
                'new-window': ['Ctrl-Shift-N'],
            },
        },
    }

    defaults = {
        lastSeenVersion: '',
        showWhatsNew: true,
    }
}
