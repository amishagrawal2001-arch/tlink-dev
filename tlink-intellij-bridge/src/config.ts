import { ConfigProvider } from 'tlink-core'

/** @hidden */
export class IntelliJBridgeConfigProvider extends ConfigProvider {
    defaults = {
        intellijBridge: {
            enabled: true,
            nodeCommand: 'node',
            transport: 'stdio',
            socketPort: 7654,
            runtimeAgentPath: '',
            editorCommand: '',
            editorArgs: [],
        },
    }
}
