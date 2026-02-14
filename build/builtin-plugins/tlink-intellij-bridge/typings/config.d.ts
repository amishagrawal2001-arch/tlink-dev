import { ConfigProvider } from 'tlink-core';
/** @hidden */
export declare class IntelliJBridgeConfigProvider extends ConfigProvider {
    defaults: {
        intellijBridge: {
            enabled: boolean;
            nodeCommand: string;
            transport: string;
            socketPort: number;
            runtimeAgentPath: string;
            editorCommand: string;
            editorArgs: never[];
        };
    };
}
