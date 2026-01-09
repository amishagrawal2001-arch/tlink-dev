import { ConfigProvider as CoreConfigProvider, Platform } from 'tlink-core'

// Fallback base to avoid runtime crashes if the core export is undefined
const ConfigProvider: any = CoreConfigProvider ?? class {}

/** @hidden */
export class SettingsConfigProvider extends ConfigProvider {
    defaults = {
        configSync: {
            host: null,
            token: null,
            configID: null,
            auto: false,
            parts: {
                hotkeys: true,
                appearance: true,
                vault: true,
            },
        },
        hotkeys: {
            'settings-tab': {
                __nonStructural: true,
            },
        },
    }

    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                settings: ['⌘-,'],
            },
        },
        [Platform.Windows]: {
            hotkeys: {
                settings: ['Ctrl-,'],
            },
        },
        [Platform.Linux]: {
            hotkeys: {
                settings: ['Ctrl-,'],
            },
        },
    }
}
