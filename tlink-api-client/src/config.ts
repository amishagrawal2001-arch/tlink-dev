import { ConfigProvider } from 'tlink-core'

export class APIClientConfigProvider extends ConfigProvider {
    defaults = {
        apiClient: {
            collections: [],
            environments: [],
            activeEnvironmentId: null,
            history: [],
            defaultTimeout: 30000,
        },
    }

    platformDefaults = {}
}
