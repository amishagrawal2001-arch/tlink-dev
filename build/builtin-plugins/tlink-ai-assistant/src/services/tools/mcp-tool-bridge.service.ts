import { Injectable } from '@angular/core';
import { ConfigProviderService } from '../core/config-provider.service';
import { LoggerService } from '../core/logger.service';

interface BridgeToolDefinition {
    localName: string;
    remoteName: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

interface BridgeToolLike {
    name?: string;
    description?: string;
    schema?: any;
    input_schema?: any;
    parameters?: any;
}

const DEFAULT_MCP_BASE_URL = 'http://localhost:3001';
const DEFAULT_MCP_PORT = 3001;
const TOOL_CATALOG_TTL_MS = 30000;

@Injectable({ providedIn: 'root' })
export class McpToolBridgeService {
    private readonly fallbackTools: BridgeToolDefinition[] = [
        {
            localName: 'mcp_get_ssh_session_list',
            remoteName: 'get_ssh_session_list',
            description: 'List available terminal sessions from the MCP bridge.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            localName: 'mcp_exec_command',
            remoteName: 'exec_command',
            description: 'Execute a shell command through MCP bridge terminal sessions.',
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'Command to execute'
                    },
                    tabId: {
                        type: 'string',
                        description: 'Terminal session id from mcp_get_ssh_session_list'
                    },
                    commandExplanation: {
                        type: 'string',
                        description: 'Optional explanation shown for confirmation prompts'
                    }
                },
                required: ['command']
            }
        },
        {
            localName: 'mcp_get_terminal_buffer',
            remoteName: 'get_terminal_buffer',
            description: 'Read terminal buffer lines from an MCP bridge terminal session.',
            input_schema: {
                type: 'object',
                properties: {
                    tabId: {
                        type: 'string',
                        description: 'Terminal session id from mcp_get_ssh_session_list'
                    },
                    startLine: {
                        type: 'number',
                        description: 'Starting line (1-based from bottom)'
                    },
                    endLine: {
                        type: 'number',
                        description: 'Ending line (1-based from bottom)'
                    }
                },
                required: ['tabId']
            }
        },
        {
            localName: 'mcp_get_command_output',
            remoteName: 'get_command_output',
            description: 'Fetch full or paginated output for a prior MCP exec_command call.',
            input_schema: {
                type: 'object',
                properties: {
                    outputId: {
                        type: 'string',
                        description: 'Output id returned by mcp_exec_command'
                    },
                    startLine: {
                        type: 'number',
                        description: 'Pagination start line (1-based)'
                    },
                    maxLines: {
                        type: 'number',
                        description: 'Maximum lines to return'
                    }
                },
                required: ['outputId']
            }
        },
        {
            localName: 'mcp_open_copilot',
            remoteName: 'open_copilot',
            description: 'Open Copilot chat window via MCP bridge integration.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            localName: 'mcp_open_vscode_chat',
            remoteName: 'open-vscode-chat',
            description: 'Open VS Code chat window via MCP bridge integration.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            localName: 'mcp_call_tool',
            remoteName: '',
            description: 'Call any MCP bridge tool by name for advanced workflows.',
            input_schema: {
                type: 'object',
                properties: {
                    tool_name: {
                        type: 'string',
                        description: 'Exact MCP bridge tool name, e.g. exec_command'
                    },
                    arguments: {
                        type: 'object',
                        description: 'Tool arguments object'
                    }
                },
                required: ['tool_name']
            }
        }
    ];

    private localToRemote = new Map<string, string>();
    private toolDefinitions: BridgeToolDefinition[] = [];
    private lastCatalogRefreshAt = 0;

    constructor(
        private logger: LoggerService,
        private config: ConfigProviderService
    ) {
        this.seedFallbackTools();
        void this.refreshToolCatalog(false);
    }

    getToolDefinitions(): Array<{ name: string; description: string; input_schema: any }> {
        return this.toolDefinitions.map((tool) => ({
            name: tool.localName,
            description: tool.description,
            input_schema: tool.input_schema
        }));
    }

    canHandleTool(toolName: string): boolean {
        if (!toolName) {
            return false;
        }
        if (toolName === 'mcp_call_tool') {
            return true;
        }
        if (this.localToRemote.has(toolName)) {
            return true;
        }
        return toolName.startsWith('mcp_');
    }

    async executeTool(toolName: string, input: Record<string, any>): Promise<string> {
        await this.ensureBridgeReady();
        await this.refreshToolCatalog(false);

        const payload = this.normalizePayloadForTool(toolName, input || {});
        const candidates = this.resolveRemoteCandidates(toolName, payload);

        if (candidates.length === 0) {
            throw new Error(`No MCP bridge mapping found for tool: ${toolName}`);
        }

        let lastError: any;

        for (const remoteName of candidates) {
            try {
                const raw = await this.callBridgeTool(remoteName, payload, toolName === 'mcp_call_tool');
                if (toolName !== 'mcp_call_tool') {
                    this.localToRemote.set(toolName, remoteName);
                }
                return this.extractTextResult(raw);
            } catch (error: any) {
                lastError = error;
                if ((error as any)?.status === 404) {
                    continue;
                }
                throw error;
            }
        }

        if (lastError) {
            throw lastError;
        }

        throw new Error(`MCP bridge tool not found for ${toolName}`);
    }

    private normalizePayloadForTool(toolName: string, input: Record<string, any>): Record<string, any> {
        const payload: Record<string, any> = { ...(input || {}) };

        if (
            (toolName === 'mcp_exec_command' || toolName === 'mcp_get_terminal_buffer') &&
            payload.tabId == null &&
            payload.terminal_index != null
        ) {
            payload.tabId = String(payload.terminal_index);
        }

        if (payload.tabId != null) {
            payload.tabId = String(payload.tabId);
        }

        return payload;
    }

    private seedFallbackTools(): void {
        this.toolDefinitions = [];
        this.localToRemote.clear();

        for (const tool of this.fallbackTools) {
            this.upsertTool(tool);
            if (tool.remoteName) {
                this.localToRemote.set(tool.localName, tool.remoteName);
            }
        }
    }

    private upsertTool(tool: BridgeToolDefinition): void {
        const existingIndex = this.toolDefinitions.findIndex((item) => item.localName === tool.localName);
        if (existingIndex >= 0) {
            this.toolDefinitions[existingIndex] = {
                ...this.toolDefinitions[existingIndex],
                ...tool,
                input_schema: tool.input_schema || this.toolDefinitions[existingIndex].input_schema
            };
        } else {
            this.toolDefinitions.push(tool);
        }
    }

    private getBridgeBaseUrl(): string {
        const configured = (this.config.get<string>('mcpBridge.baseURL', '') || '').trim();
        if (configured) {
            return configured.replace(/\/+$/, '');
        }

        const configuredPortRaw = this.config.get<number | string>('mcpBridge.port', DEFAULT_MCP_PORT);
        const configuredPort = Number(configuredPortRaw);
        if (Number.isFinite(configuredPort) && configuredPort > 0) {
            return `http://localhost:${configuredPort}`;
        }

        return DEFAULT_MCP_BASE_URL;
    }

    private parseBridgePort(baseUrl: string): number {
        try {
            const parsed = new URL(baseUrl);
            if (parsed.port) {
                const port = Number(parsed.port);
                if (Number.isFinite(port) && port > 0) {
                    return port;
                }
            }
        } catch {
            // Ignore URL parse errors
        }
        return DEFAULT_MCP_PORT;
    }

    private async ensureBridgeReady(): Promise<void> {
        const baseUrl = this.getBridgeBaseUrl();
        if (await this.pingHealth(baseUrl)) {
            return;
        }

        const bridge = (window as any)?.__tlinkMcp;
        if (bridge?.start) {
            try {
                const status = typeof bridge.status === 'function' ? await Promise.resolve(bridge.status()) : null;
                if (!status?.running) {
                    const port = this.parseBridgePort(baseUrl);
                    await Promise.resolve(bridge.start(port));
                    this.logger.info('Started MCP bridge via __tlinkMcp', { port });
                }
            } catch (error) {
                this.logger.warn('Failed to auto-start MCP bridge via __tlinkMcp', error);
            }
        }

        for (let i = 0; i < 12; i++) {
            if (await this.pingHealth(baseUrl)) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        throw new Error(
            `MCP bridge is unavailable at ${baseUrl}. Open Settings > Copilot Agent and start the MCP server.`
        );
    }

    private async pingHealth(baseUrl: string): Promise<boolean> {
        const url = `${baseUrl}/health`;
        try {
            const response = await fetch(url, { method: 'GET' });
            return response.ok;
        } catch {
            return false;
        }
    }

    private async refreshToolCatalog(force: boolean): Promise<void> {
        const now = Date.now();
        if (!force && now - this.lastCatalogRefreshAt < TOOL_CATALOG_TTL_MS) {
            return;
        }
        this.lastCatalogRefreshAt = now;

        const baseUrl = this.getBridgeBaseUrl();

        try {
            const response = await fetch(`${baseUrl}/api/tools`, { method: 'GET' });
            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            const tools: BridgeToolLike[] = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.tools)
                    ? payload.tools
                    : [];

            for (const item of tools) {
                if (!item?.name || typeof item.name !== 'string') {
                    continue;
                }

                const localName = this.toLocalToolName(item.name);
                const normalized: BridgeToolDefinition = {
                    localName,
                    remoteName: item.name,
                    description: item.description || `MCP bridge tool: ${item.name}`,
                    input_schema: this.normalizeInputSchema(item.input_schema || item.parameters || item.schema)
                };

                this.upsertTool(normalized);
                this.localToRemote.set(localName, item.name);
            }
        } catch (error) {
            this.logger.debug('MCP tool catalog refresh skipped', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private toLocalToolName(remoteName: string): string {
        const normalized = remoteName.replace(/[^a-zA-Z0-9_]/g, '_');
        return `mcp_${normalized}`;
    }

    private normalizeInputSchema(raw: any): { type: 'object'; properties: Record<string, any>; required?: string[] } {
        if (!raw || typeof raw !== 'object') {
            return { type: 'object', properties: {}, required: [] };
        }

        if (raw.type === 'object' && raw.properties && typeof raw.properties === 'object') {
            const required = Array.isArray(raw.required)
                ? raw.required.filter((item: any) => typeof item === 'string')
                : [];

            return {
                type: 'object',
                properties: raw.properties,
                required
            };
        }

        return {
            type: 'object',
            properties: {},
            required: []
        };
    }

    private resolveRemoteCandidates(toolName: string, input: Record<string, any>): string[] {
        if (toolName === 'mcp_call_tool') {
            const explicit = (input?.tool_name || '').toString().trim();
            if (!explicit) {
                throw new Error('mcp_call_tool requires input.tool_name');
            }
            return [explicit];
        }

        const direct = this.localToRemote.get(toolName);
        if (direct) {
            return [direct];
        }

        if (!toolName.startsWith('mcp_')) {
            return [];
        }

        const raw = toolName.slice(4);
        const underscoreVariant = raw;
        const hyphenVariant = raw.replace(/_/g, '-');

        if (underscoreVariant === hyphenVariant) {
            return [underscoreVariant];
        }

        return [underscoreVariant, hyphenVariant];
    }

    private async callBridgeTool(remoteName: string, input: Record<string, any>, isGenericCall: boolean): Promise<any> {
        const baseUrl = this.getBridgeBaseUrl();
        const url = `${baseUrl}/api/tool/${encodeURIComponent(remoteName)}`;
        const payload = isGenericCall
            ? (this.normalizeGenericArguments(input?.arguments) || {})
            : (input || {});

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const rawText = await response.text();
        let body: any = rawText;

        if (rawText) {
            try {
                body = JSON.parse(rawText);
            } catch {
                body = rawText;
            }
        }

        if (!response.ok) {
            const errorMessage = typeof body === 'string'
                ? body
                : (body?.error || `HTTP ${response.status}`);
            const error: any = new Error(`MCP bridge call failed (${response.status}): ${errorMessage}`);
            error.status = response.status;
            throw error;
        }

        return body;
    }

    private normalizeGenericArguments(raw: any): Record<string, any> {
        if (!raw) {
            return {};
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return (parsed && typeof parsed === 'object') ? parsed : {};
            } catch {
                throw new Error('mcp_call_tool.arguments must be valid JSON when passed as string');
            }
        }
        if (typeof raw === 'object') {
            return raw;
        }
        return {};
    }

    private extractTextResult(raw: any): string {
        if (raw == null) {
            return '';
        }

        if (typeof raw === 'string') {
            return raw;
        }

        const content = Array.isArray(raw?.content) ? raw.content : [];
        const textParts = content
            .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
            .map((part: any) => part.text.trim())
            .filter((text: string) => text.length > 0);

        const mergedText = textParts.join('\n').trim();

        if (raw?.isError) {
            throw new Error(mergedText || 'MCP bridge tool returned an error');
        }

        if (mergedText) {
            return mergedText;
        }

        try {
            return JSON.stringify(raw, null, 2);
        } catch {
            return String(raw);
        }
    }
}
