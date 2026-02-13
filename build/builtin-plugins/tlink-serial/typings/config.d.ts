import { ConfigProvider } from 'tlink-core';
/** @hidden */
export declare class SerialConfigProvider extends ConfigProvider {
    defaults: {
        hotkeys: {
            serial: string[];
            'restart-serial-session': never[];
        };
    };
    platformDefaults: {};
}
