import { ConfigProvider } from 'tlink-core'

/** @hidden */
export class TelnetConfigProvider extends ConfigProvider {
    defaults = {
        hotkeys: {
            'restart-telnet-session': [],
        },
    }

    platformDefaults = { }
}
