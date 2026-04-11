import { ConfigProvider } from 'tlink-core'

export class APIClientConfigProvider extends ConfigProvider {
    defaults = {
        apiClient: {
            collections: [],
            defaultTimeout: 30000,
        },
    }

    platformDefaults = {}
}
