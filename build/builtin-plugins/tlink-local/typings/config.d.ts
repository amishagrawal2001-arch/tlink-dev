import { ConfigProvider } from 'tlink-core';
/** @hidden */
export declare class TerminalConfigProvider extends ConfigProvider {
    defaults: {
        terminal: {
            autoOpen: boolean;
            useConPTY: boolean;
            environment: {};
            setComSpec: boolean;
        };
    };
    platformDefaults: {
        macOS: {
            terminal: {
                profile: string;
            };
            hotkeys: {
                'new-tab': string[];
            };
        };
        Windows: {
            terminal: {
                profile: string;
            };
            hotkeys: {
                'new-tab': string[];
            };
        };
        Linux: {
            terminal: {
                profile: string;
            };
            hotkeys: {
                'new-tab': string[];
            };
        };
    };
}
