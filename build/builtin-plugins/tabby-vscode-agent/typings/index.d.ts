import '@angular/compiler';
import './styles.scss';
/**
 * Module for the MCP server integration
 */
export default class McpModule {
    private app;
    private config;
    private mcpService;
    private logger;
    private hostWindow;
    private mcpHotkeyService;
    /**
     * Simple constructor for module initialization
     * Server initialization is handled by the toolbar button provider
     */
    private constructor();
    /**
     * Initialize server on boot based on configuration
     */
    private initServerOnBoot;
    private registerMcpBridge;
}
export * from './services/mcpService';
export * from './services/mcpLogger.service';
export * from './type/types';
export * from './services/mcpConfigProvider';
export * from './services/dialog.service';
export * from './services/dialogManager.service';
export * from './services/commandHistoryManager.service';
export * from './services/runningCommandsManager.service';
export * from './services/mcpHotkey.service';
export * from './services/mcpHotkeyProvider.service';
