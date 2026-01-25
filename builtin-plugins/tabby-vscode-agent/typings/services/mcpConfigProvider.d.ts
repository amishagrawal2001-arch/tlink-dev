import { ConfigProvider } from 'tabby-core';
/**
 * Provider for MCP module configuration defaults
 */
export declare class McpConfigProvider extends ConfigProvider {
    /**
     * Default configuration values
     */
    defaults: {
        mcp: {
            startOnBoot: boolean;
            enabled: boolean;
            port: number;
            serverUrl: string;
            enableDebugLogging: boolean;
            pairProgrammingMode: {
                enabled: boolean;
                autoFocusTerminal: boolean;
                showConfirmationDialog: boolean;
                showResultDialog: boolean;
            };
        };
        hotkeys: {
            'mcp-abort-command': string[];
        };
    };
    /**
     * Platform-specific defaults
     */
    platformDefaults: {};
}
