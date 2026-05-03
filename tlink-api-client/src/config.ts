import { ConfigProvider } from 'tlink-core'

export class APIClientConfigProvider extends ConfigProvider {
    defaults = {
        apiClient: {
            collections: [],
            environments: [],
            activeEnvironmentId: null,
            history: [],
            cookies: [],
            defaultTimeout: 30000,
        },
    }

    platformDefaults = {}
}
