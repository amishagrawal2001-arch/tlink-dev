import { ConfigProvider } from 'tlink-core';
/** @hidden */
export declare class ElectronConfigProvider extends ConfigProvider {
    platformDefaults: {
        macOS: {
            hotkeys: {
                'toggle-window': string[];
                'new-window': string[];
            };
        };
        Windows: {
            hotkeys: {
                'toggle-window': string[];
                'new-window': string[];
            };
        };
        Linux: {
            hotkeys: {
                'toggle-window': string[];
                'new-window': string[];
            };
        };
    };
    defaults: {};
}
