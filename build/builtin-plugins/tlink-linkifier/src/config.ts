import { ConfigProvider } from 'tlink-core'

/** @hidden */
export class ClickableLinksConfigProvider extends ConfigProvider {
    defaults = {
        clickableLinks: {
            modifier: null,
        },
    }

    platformDefaults = { }
}
