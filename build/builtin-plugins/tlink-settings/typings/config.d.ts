declare const ConfigProvider: any;
/** @hidden */
export declare class SettingsConfigProvider extends ConfigProvider {
    defaults: {
        configSync: {
            host: null;
            token: null;
            configID: null;
            auto: boolean;
            parts: {
                hotkeys: boolean;
                appearance: boolean;
                vault: boolean;
            };
        };
        hotkeys: {
            'settings-tab': {
                __nonStructural: boolean;
            };
        };
    };
    platformDefaults: {
        macOS: {
            hotkeys: {
                settings: string[];
            };
        };
        Windows: {
            hotkeys: {
                settings: string[];
            };
        };
        Linux: {
            hotkeys: {
                settings: string[];
            };
        };
    };
}
export {};
