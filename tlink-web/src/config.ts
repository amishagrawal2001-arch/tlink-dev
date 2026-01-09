import { ConfigProvider } from 'tlink-core'

/** @hidden */
export class WebConfigProvider extends ConfigProvider {
    defaults = {
        web: {
            preventAccidentalTabClosure: false,
        },
    }
}
