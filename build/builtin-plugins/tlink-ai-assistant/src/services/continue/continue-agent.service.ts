import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AgentLoopConfig, AgentStreamEvent, ChatRequest, MessageRole, TerminationReason } from '../../types/ai.types';
import { ConfigProviderService } from '../core/config-provider.service';
import { FileStorageService } from '../core/file-storage.service';
import { LoggerService } from '../core/logger.service';
import { AgentApprovalService } from '../core/agent-approval.service';
import { ProviderConfig, ProviderConfigUtils } from '../../types/provider.types';

interface ContinueToolCallState {
    toolCallId: string;
    toolCall: {
        id: string;
        type?: string;
        function?: {
            name?: string;
            arguments?: string;
        };
        name?: string;
        arguments?: any;
    };
    status: string;
    parsedArgs?: any;
    output?: Array<{ content: string; name?: string; description?: string }>;
}

interface ContinueHistoryItem {
    message: {
        role: string;
        content: any;
        toolCalls?: any[];
    };
    toolCallStates?: ContinueToolCallState[];
}

interface ContinueStateSnapshot {
    session?: {
        history?: ContinueHistoryItem[];
        sessionId?: string;
    };
    isProcessing?: boolean;
    messageQueueLength?: number;
    pendingPermission?: {
        toolName: string;
        toolArgs: any;
        requestId: string;
        toolCallPreview?: any[];
        timestamp?: number;
    } | null;
}

interface ContinueServerInfo {
    process?: any;
    ipcProcessId?: string;
    port: number;
    baseUrl: string;
    workdir: string;
    configSignature: string;
}

@Injectable({ providedIn: 'root' })
export class ContinueAgentService {
    private serverInfo: ContinueServerInfo | null = null;
    private serverReady: Promise<string> | null = null;

    constructor(
        private config: ConfigProviderService,
        private fileStorage: FileStorageService,
        private logger: LoggerService,
        private approvals: AgentApprovalService
    ) {}

    chatStreamWithContinueAgentLoop(
        request: ChatRequest,
        config: AgentLoopConfig = {}
    ): Observable<AgentStreamEvent> {
        return new Observable<AgentStreamEvent>((subscriber) => {
            let cancelled = false;
            let pollTimer: any = null;
            let baseUrl = '';

            const startTime = Date.now();
            const timeoutMs = config.timeoutMs || 180000;
            const toolStateById = new Map<string, { status: string; startTime: number }>();
            const ignoredToolIds = new Set<string>();

            let lastAssistantIndex = -1;
            let lastAssistantContent = '';
            let minHistoryIndex = 0;
            let round = 0;
            let hasActivity = false;
            let permissionInFlight: string | null = null;
            let pollCount = 0;
            let lastSessionId: string | null = null;
            let lastSnapshotInfo: { isProcessing: boolean | null; queue: number | null; history: number | null } = {
                isProcessing: null,
                queue: null,
                history: null
            };
            let idleWithoutResponseSince: number | null = null;

            const start = async (): Promise<void> => {
                try {
                    const workdir = this.resolveWorkingDir();
                    baseUrl = await this.ensureServer(workdir, timeoutMs);
                    this.logger.warn(`Continue server ready at ${baseUrl}`);

                    const baseline = await this.fetchState(baseUrl);
                    const baselineHistory = baseline.session?.history || [];
                    minHistoryIndex = baselineHistory.length;
                    lastAssistantIndex = minHistoryIndex - 1;
                    lastAssistantContent = '';
                    lastSessionId = baseline.session?.sessionId || null;

                    for (const item of baselineHistory) {
                        if (item.toolCallStates) {
                            for (const toolState of item.toolCallStates) {
                                if (toolState?.toolCallId) {
                                    ignoredToolIds.add(toolState.toolCallId);
                                }
                            }
                        }
                    }

                    const userMessage = this.extractLatestUserMessage(request);
                    if (!userMessage) {
                        throw new Error('No user message available to send to Continue');
                    }

                    const queueResponse = await this.postJson(`${baseUrl}/message`, {
                        message: userMessage
                    });
                    this.logger.warn('Continue message queued', queueResponse);

                    round = 1;
                    subscriber.next({ type: 'round_start', round });

                    pollTimer = this.schedulePoll(async () => {
                        if (cancelled || subscriber.closed) return false;
                        const snapshot = await this.fetchState(baseUrl);
                        if (cancelled || subscriber.closed) return false;
                        pollCount += 1;

                        const history = snapshot.session?.history || [];
                        const sessionId = snapshot.session?.sessionId || null;
                        if (sessionId && sessionId !== lastSessionId) {
                            this.logger.warn('Continue session reset detected', { previous: lastSessionId, current: sessionId });
                            lastSessionId = sessionId;
                            minHistoryIndex = 0;
                            lastAssistantIndex = -1;
                            lastAssistantContent = '';
                            ignoredToolIds.clear();
                            toolStateById.clear();
                        } else if (history.length < minHistoryIndex) {
                            this.logger.warn('Continue history reset detected', { historyLength: history.length, minHistoryIndex });
                            minHistoryIndex = 0;
                            lastAssistantIndex = -1;
                            lastAssistantContent = '';
                            ignoredToolIds.clear();
                            toolStateById.clear();
                        }

                        const pendingRequestId = snapshot.pendingPermission?.requestId || null;
                        if (pendingRequestId && pendingRequestId !== permissionInFlight) {
                            permissionInFlight = pendingRequestId;
                            this.handlePendingPermission(snapshot, baseUrl)
                                .catch((error) => {
                                    this.logger.warn('Permission handling failed', { error: this.formatError(error) });
                                })
                                .finally(() => {
                                    if (permissionInFlight === pendingRequestId) {
                                        permissionInFlight = null;
                                    }
                                });
                        }

                        const completionState = this.processHistory(
                            history,
                            minHistoryIndex,
                            lastAssistantIndex,
                            lastAssistantContent,
                            ignoredToolIds,
                            toolStateById,
                            subscriber,
                            (index, content) => {
                                lastAssistantIndex = index;
                                lastAssistantContent = content;
                                hasActivity = hasActivity || content.length > 0;
                            },
                            () => { hasActivity = true; }
                        );

                        lastAssistantIndex = completionState.lastAssistantIndex;
                        lastAssistantContent = completionState.lastAssistantContent;
                        hasActivity = hasActivity || completionState.hasActivity;

                        const queueLength = snapshot.messageQueueLength || 0;
                        const isProcessing = !!snapshot.isProcessing;
                        const historyLength = history.length;
                        const hasAssistantMessage = this.hasAssistantMessageSince(history, minHistoryIndex);
                        if (
                            lastSnapshotInfo.isProcessing !== isProcessing ||
                            lastSnapshotInfo.queue !== queueLength ||
                            lastSnapshotInfo.history !== historyLength ||
                            pollCount <= 5
                        ) {
                            this.logger.warn('Continue poll snapshot', {
                                isProcessing,
                                messageQueueLength: queueLength,
                                historyLength,
                                lastAssistantIndex,
                                minHistoryIndex,
                                hasAssistantMessage
                            });
                            lastSnapshotInfo = { isProcessing, queue: queueLength, history: historyLength };
                        }

                        if (pollCount % 10 === 0) {
                            this.logger.warn('Continue poll status', {
                                isProcessing,
                                messageQueueLength: queueLength,
                                historyLength,
                                lastAssistantIndex,
                                minHistoryIndex,
                                hasAssistantMessage
                            });
                        }

                        if (Date.now() - startTime > timeoutMs) {
                            subscriber.next({
                                type: 'agent_complete',
                                reason: 'timeout',
                                totalRounds: round,
                                terminationMessage: 'Continue agent timed out'
                            });
                            subscriber.complete();
                            return false;
                        }

                        const isProcessingActive = isProcessing || queueLength > 0;
                        const hasActiveTools = Array.from(toolStateById.values()).some((state) => !this.isToolTerminalState(state.status));

                        if (!isProcessingActive && !hasActiveTools && (hasActivity || hasAssistantMessage)) {
                            const reason: TerminationReason = toolStateById.size > 0 ? 'tool_success' : 'no_tools';
                            subscriber.next({
                                type: 'agent_complete',
                                reason,
                                totalRounds: round,
                                terminationMessage: 'Continue agent completed'
                            });
                            subscriber.complete();
                            return false;
                        }

                        if (!isProcessingActive && !hasActiveTools && !hasActivity && !hasAssistantMessage) {
                            if (idleWithoutResponseSince == null) {
                                idleWithoutResponseSince = Date.now();
                            }
                            const idleMs = Date.now() - idleWithoutResponseSince;
                            if (idleMs >= 8000) {
                                const message = 'Continue agent produced no response. Check base URL/auth and ensure the selected chat model supports tool calling.';
                                this.logger.warn('Continue agent stalled with no response', {
                                    idleMs,
                                    historyLength,
                                    minHistoryIndex,
                                    lastAssistantIndex
                                });
                                subscriber.next({ type: 'error', error: message });
                                subscriber.next({
                                    type: 'agent_complete',
                                    reason: 'no_progress',
                                    totalRounds: round,
                                    terminationMessage: message
                                });
                                subscriber.complete();
                                return false;
                            }
                        } else {
                            idleWithoutResponseSince = null;
                        }
                        return true;
                    });
                } catch (error) {
                    const message = this.formatError(error);
                    subscriber.next({ type: 'error', error: message });
                    subscriber.error(error);
                }
            };

            start();

            return () => {
                cancelled = true;
                if (pollTimer) {
                    clearTimeout(pollTimer);
                }
                if (baseUrl) {
                    this.postJson(`${baseUrl}/pause`, {}).catch(() => undefined);
                }
            };
        });
    }

    private resolveWorkingDir(): string {
        const configured = (this.config.get<string>('agentWorkingDir', '') || '').trim();
        const normalized = this.normalizeWorkingDir(configured);
        if (normalized) {
            return normalized;
        }
        const win: any = window as any;
        return win?.process?.cwd?.() || '';
    }

    private normalizeWorkingDir(input: string): string {
        if (!input) return '';
        const path = this.getPath();
        const fs = this.getFs();
        const win: any = window as any;
        let resolved = input;

        if (input.startsWith('~')) {
            const home = win?.process?.env?.HOME || win?.process?.env?.USERPROFILE || '';
            if (home) {
                const suffix = input.slice(1).replace(/^[/\\]+/, '');
                resolved = suffix ? (path ? path.join(home, suffix) : `${home}/${suffix}`) : home;
            }
        }

        if (path && resolved && !path.isAbsolute(resolved)) {
            const base = win?.process?.cwd?.() || '';
            resolved = base ? path.resolve(base, resolved) : resolved;
        }

        if (fs && resolved && !fs.existsSync(resolved)) {
            this.logger.warn('Agent working dir does not exist, falling back to app cwd', { input, resolved });
            return '';
        }

        return resolved;
    }

    private schedulePoll(fn: () => Promise<boolean>, delayMs: number = 400): any {
        let timer: any = null;
        const run = async () => {
            let shouldContinue = false;
            try {
                shouldContinue = await fn();
            } catch (error) {
                this.logger.warn('Continue poll failed', { error: this.formatError(error) });
            } finally {
                if (shouldContinue) {
                    timer = setTimeout(run, delayMs);
                }
            }
        };
        timer = setTimeout(run, delayMs);
        return timer;
    }

    private async handlePendingPermission(
        snapshot: ContinueStateSnapshot,
        baseUrl: string
    ): Promise<void> {
        const pending = snapshot.pendingPermission;
        if (!pending || !pending.requestId) {
            return;
        }

        const approvalRequest = this.buildApprovalRequest(pending.toolName, pending.toolArgs, pending.requestId);
        const approved = await this.approvals.requestApproval(approvalRequest);

        await this.postJson(`${baseUrl}/permission`, {
            requestId: pending.requestId,
            approved
        });

        return;
    }

    private buildApprovalRequest(toolName: string, toolArgs: any, requestId: string) {
        const normalized = (toolName || '').toLowerCase();
        const isCommand = normalized === 'bash' || normalized.includes('terminal');
        const isPatch = normalized.includes('edit') || normalized.includes('write') || normalized.includes('patch');

        if (isCommand) {
            const command = typeof toolArgs?.command === 'string'
                ? toolArgs.command
                : JSON.stringify(toolArgs || {}, null, 2);
            return {
                id: requestId,
                type: 'command' as const,
                title: `Approve ${toolName} command`,
                detail: 'Continue requires permission to run this command.',
                command
            };
        }

        const patch = JSON.stringify(toolArgs || {}, null, 2);
        return {
            id: requestId,
            type: isPatch ? 'patch' as const : 'command' as const,
            title: `Approve ${toolName} tool`,
            detail: 'Continue requires permission to run this tool.',
            patch: isPatch ? patch : undefined,
            command: isPatch ? undefined : patch
        };
    }

    private processHistory(
        history: ContinueHistoryItem[],
        startIndex: number,
        lastAssistantIndex: number,
        lastAssistantContent: string,
        ignoredToolIds: Set<string>,
        toolStateById: Map<string, { status: string; startTime: number }>,
        subscriber: { next: (event: AgentStreamEvent) => void },
        updateAssistant: (index: number, content: string) => void,
        markActivity: () => void
    ): { lastAssistantIndex: number; lastAssistantContent: string; hasActivity: boolean } {
        let hasActivity = false;
        const historyStart = Math.max(0, startIndex);

        for (let i = historyStart; i < history.length; i++) {
            const item = history[i];
            if (!item?.message) continue;

            if (item.message.role === 'assistant') {
                const content = this.extractMessageContent(item.message.content);
                if (i > lastAssistantIndex) {
                    if (content) {
                        subscriber.next({ type: 'text_delta', textDelta: content });
                        hasActivity = true;
                    }
                    updateAssistant(i, content);
                    lastAssistantIndex = i;
                    lastAssistantContent = content;
                } else if (i === lastAssistantIndex) {
                    if (content.length > lastAssistantContent.length) {
                        const delta = content.slice(lastAssistantContent.length);
                        if (delta) {
                            subscriber.next({ type: 'text_delta', textDelta: delta });
                            hasActivity = true;
                        }
                        updateAssistant(i, content);
                        lastAssistantContent = content;
                    }
                }
            }

            if (item.toolCallStates) {
                for (const toolState of item.toolCallStates) {
                    if (!toolState || !toolState.toolCallId) continue;
                    if (ignoredToolIds.has(toolState.toolCallId)) {
                        continue;
                    }

                    const toolId = toolState.toolCallId;
                    const toolName = toolState.toolCall?.function?.name || toolState.toolCall?.name || 'tool';
                    const toolInput = toolState.parsedArgs || this.parseToolArgs(toolState.toolCall?.function?.arguments);

                    const existing = toolStateById.get(toolId);
                    if (!existing) {
                        toolStateById.set(toolId, { status: toolState.status, startTime: Date.now() });
                        subscriber.next({
                            type: 'tool_use_start',
                            toolCall: {
                                id: toolId,
                                name: toolName,
                                input: toolInput
                            }
                        });
                        hasActivity = true;
                    }

                    const previousStatus = existing?.status;
                    if (!previousStatus || previousStatus !== toolState.status) {
                        if (toolState.status === 'calling') {
                            subscriber.next({
                                type: 'tool_executing',
                                toolCall: {
                                    id: toolId,
                                    name: toolName,
                                    input: toolInput
                                }
                            });
                        }

                        if (toolState.status === 'done') {
                            const output = this.formatToolOutput(toolState.output);
                            const startTime = toolStateById.get(toolId)?.startTime || Date.now();
                            subscriber.next({
                                type: 'tool_executed',
                                toolCall: {
                                    id: toolId,
                                    name: toolName,
                                    input: toolInput
                                },
                                toolResult: {
                                    tool_use_id: toolId,
                                    content: output,
                                    duration: Date.now() - startTime
                                }
                            });
                            hasActivity = true;
                        }

                        if (toolState.status === 'errored' || toolState.status === 'canceled') {
                            const output = this.formatToolOutput(toolState.output) || 'Tool failed';
                            const startTime = toolStateById.get(toolId)?.startTime || Date.now();
                            subscriber.next({
                                type: 'tool_error',
                                toolCall: {
                                    id: toolId,
                                    name: toolName,
                                    input: toolInput
                                },
                                toolResult: {
                                    tool_use_id: toolId,
                                    content: output,
                                    is_error: true,
                                    duration: Date.now() - startTime
                                }
                            });
                            hasActivity = true;
                        }

                        toolStateById.set(toolId, {
                            status: toolState.status,
                            startTime: toolStateById.get(toolId)?.startTime || Date.now()
                        });
                    }
                }
            }
        }

        if (hasActivity) {
            markActivity();
        }

        return { lastAssistantIndex, lastAssistantContent, hasActivity };
    }

    private isToolTerminalState(status: string): boolean {
        return status === 'done' || status === 'errored' || status === 'canceled';
    }

    private hasAssistantMessageSince(history: ContinueHistoryItem[], startIndex: number): boolean {
        const historyStart = Math.max(0, startIndex);
        for (let i = historyStart; i < history.length; i++) {
            if (history[i]?.message?.role === 'assistant') {
                return true;
            }
        }
        return false;
    }

    private formatToolOutput(output?: Array<{ content: string }>): string {
        if (!output || output.length === 0) return '';
        return output.map((item) => item.content).filter(Boolean).join('\n');
    }

    private parseToolArgs(rawArgs?: string): any {
        if (!rawArgs) return {};
        try {
            return JSON.parse(rawArgs);
        } catch {
            return { raw: rawArgs };
        }
    }

    private extractMessageContent(content: any): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (typeof content === 'object') {
            if (typeof content.text === 'string') {
                return content.text;
            }
            if (content.content) {
                return this.extractMessageContent(content.content);
            }
        }
        if (Array.isArray(content)) {
            return content
                .map((part) => {
                    if (!part) return '';
                    if (typeof part === 'string') return part;
                    if (part.type === 'text') return part.text || '';
                    return '';
                })
                .join('');
        }
        return '';
    }

    private extractLatestUserMessage(request: ChatRequest): string | null {
        const messages = request.messages || [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role === MessageRole.USER && message.content) {
                return this.extractMessageContent(message.content);
            }
        }
        return null;
    }

    private async ensureServer(workdir: string, timeoutMs: number): Promise<string> {
        const configSignature = this.getContinueConfigSignature();
        if (this.serverInfo && (this.serverInfo.workdir !== workdir || this.serverInfo.configSignature !== configSignature)) {
            await this.shutdownServer(this.serverInfo);
            this.serverInfo = null;
        }
        if (this.serverInfo && this.serverInfo.workdir === workdir && this.serverInfo.process && !this.serverInfo.process.killed) {
            return this.serverInfo.baseUrl;
        }
        if (this.serverReady) {
            return this.serverReady;
        }

        this.serverReady = this.startServer(workdir, timeoutMs)
            .finally(() => {
                this.serverReady = null;
            });

        return this.serverReady;
    }

    private async shutdownServer(info: ContinueServerInfo): Promise<void> {
        try {
            await this.postJson(`${info.baseUrl}/exit`, {});
        } catch {
            // Ignore errors during shutdown request
        }
        if (info.ipcProcessId) {
            try {
                const promiseIpc = this.getPromiseIpc();
                if (promiseIpc) {
                    await promiseIpc.send('continue:kill', info.ipcProcessId);
                }
            } catch {
                // Ignore IPC kill errors
            }
        }
        try {
            info.process?.kill?.();
        } catch {
            // Ignore process kill errors
        }
    }

    private async startServer(workdir: string, timeoutMs: number): Promise<string> {
        const configSnapshot = this.buildContinueConfigSnapshot();
        const configPath = this.writeContinueConfigFile(configSnapshot.text);
        const embedded = this.resolveEmbeddedCli(workdir);
        if (!embedded.path) {
            if (embedded.missingDist) {
                throw new Error(`Embedded Continue CLI found at ${embedded.root}, but dist/cn.js is missing. Run npm install && npm run build inside ${embedded.root}/extensions/cli.`);
            }
            throw new Error('Embedded Continue CLI not found. Ensure third_party/continue is present and built.');
        }

        const nodeCandidates = this.resolveNodeCandidates(workdir);
        this.logNodeCandidates(nodeCandidates);
        const promiseIpc = this.getPromiseIpc();
        const preferIpc = Boolean(promiseIpc);
        const errors: string[] = [];
        let lastError: any = null;
        for (const nodeSpec of nodeCandidates) {
            const port = await this.findFreePort();
            const baseUrl = `http://localhost:${port}`;
            try {
                if (preferIpc && promiseIpc) {
                    return await this.spawnContinueServerViaIpc(
                        promiseIpc,
                        nodeSpec,
                        embedded.path,
                        configPath,
                        workdir,
                        baseUrl,
                        port,
                        timeoutMs
                    );
                }
                return await this.spawnContinueServer(
                    nodeSpec,
                    embedded.path,
                    configPath,
                    workdir,
                    baseUrl,
                    port,
                    timeoutMs
                );
            } catch (error) {
                const message = `${nodeSpec.command}: ${this.formatError(error)}`;
                errors.push(message);
                lastError = { error, command: nodeSpec.command };
                this.logger.warn(`Continue CLI start failed for ${message}`);
            }
        }

        const summary = errors.length > 0 ? errors.join(' | ') : this.formatError(lastError?.error ?? lastError);
        throw new Error(`Continue server failed to start: ${summary}`);
    }

    private async spawnContinueServer(
        nodeSpec: { command: string; envOverrides: Record<string, string> },
        cliPath: string,
        configPath: string,
        workdir: string,
        baseUrl: string,
        port: number,
        timeoutMs: number
    ): Promise<string> {
        const childProcess = this.getChildProcess();
        if (!childProcess) {
            throw new Error('child_process module not available in this environment');
        }

        this.logger.warn(`Continue CLI spawn attempt: ${nodeSpec.command} (port ${port})`);

        const proc = childProcess.spawn(
            nodeSpec.command,
            [cliPath, 'serve', '--port', String(port), '--config', configPath],
            {
                cwd: workdir || undefined,
                env: this.buildSpawnEnv(nodeSpec)
            }
        );

        proc.stdout?.on('data', (data: any) => {
            this.logger.debug('Continue CLI stdout', { output: String(data).trim() });
        });
        proc.stderr?.on('data', (data: any) => {
            this.logger.warn(`Continue CLI stderr: ${String(data).trim()}`);
        });

        const spawnError = new Promise<never>((_, reject) => {
            proc.once('error', (error: any) => {
                this.logger.error(`Continue CLI spawn error (${nodeSpec.command}): ${this.formatError(error)}`);
                reject(error);
            });
        });

        proc.on('exit', (code: any) => {
            this.logger.warn(`Continue CLI exited (${nodeSpec.command}): ${code}`);
            if (this.serverInfo?.process === proc) {
                this.serverInfo = null;
            }
        });

        this.serverInfo = {
            process: proc,
            port,
            baseUrl,
            workdir,
            configSignature: this.getContinueConfigSignature()
        };

        try {
            const resolvedBaseUrl = await Promise.race([
                this.waitForServer(baseUrl, timeoutMs),
                spawnError
            ]);
            if (this.serverInfo?.process === proc) {
                this.serverInfo.baseUrl = resolvedBaseUrl;
            }
            return resolvedBaseUrl;
        } catch (error) {
            try {
                proc.kill?.();
            } catch {
                // Ignore kill failures
            }
            if (this.serverInfo?.process === proc) {
                this.serverInfo = null;
            }
            throw error;
        }
    }

    private async spawnContinueServerViaIpc(
        promiseIpc: any,
        nodeSpec: { command: string; envOverrides: Record<string, string> },
        cliPath: string,
        configPath: string,
        workdir: string,
        baseUrl: string,
        port: number,
        timeoutMs: number
    ): Promise<string> {
        this.logger.warn(`Continue CLI spawn attempt (IPC): ${nodeSpec.command} (port ${port})`);
        const env = this.buildSpawnEnv(nodeSpec);
        const args = [cliPath, 'serve', '--port', String(port), '--config', configPath];

        const result = await promiseIpc.send('continue:spawn', {
            command: nodeSpec.command,
            args,
            cwd: workdir || undefined,
            env
        });

        const resolvedBaseUrl = result?.baseUrl || baseUrl;
        this.serverInfo = {
            ipcProcessId: result?.id,
            port,
            baseUrl: resolvedBaseUrl,
            workdir,
            configSignature: this.getContinueConfigSignature()
        };

        const confirmedBaseUrl = await this.waitForServer(resolvedBaseUrl, timeoutMs);
        if (this.serverInfo?.ipcProcessId === result?.id) {
            this.serverInfo.baseUrl = confirmedBaseUrl;
        }
        return confirmedBaseUrl;
    }

    private async waitForServer(baseUrl: string, timeoutMs: number): Promise<string> {
        const deadline = Date.now() + Math.min(timeoutMs, 20000);
        let lastError: any = null;
        const alternateBaseUrl = this.getAlternateBaseUrl(baseUrl);
        while (Date.now() < deadline) {
            try {
                await this.fetchState(baseUrl);
                return baseUrl;
            } catch (error) {
                lastError = error;
                if (alternateBaseUrl) {
                    try {
                        await this.fetchState(alternateBaseUrl);
                        return alternateBaseUrl;
                    } catch (altError) {
                        lastError = altError;
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        }
        throw new Error(`Continue server failed to start: ${this.formatError(lastError)}`);
    }

    private async fetchState(baseUrl: string): Promise<ContinueStateSnapshot> {
        return this.fetchJson(`${baseUrl}/state`);
    }

    private getAlternateBaseUrl(baseUrl: string): string | null {
        try {
            const url = new URL(baseUrl);
            if (url.hostname === '127.0.0.1') {
                url.hostname = 'localhost';
            } else if (url.hostname === 'localhost') {
                url.hostname = '127.0.0.1';
            } else if (url.hostname === '::1') {
                url.hostname = '127.0.0.1';
            } else {
                return null;
            }
            const alt = url.toString();
            return alt.endsWith('/') ? alt.slice(0, -1) : alt;
        } catch {
            return null;
        }
    }

    private getContinueConfigSignature(): string {
        return this.buildContinueConfigSnapshot().signature;
    }

    private buildContinueConfigSnapshot(): { text: string; signature: string } {
        const providerName = (this.config.getDefaultProvider() || 'openai').toLowerCase();
        const providerConfig = this.resolveProviderConfig(providerName);
        const continueProvider = this.mapProviderToContinueProvider(providerName);

        const modelConfig: Record<string, any> = {
            name: providerConfig.displayName || providerConfig.name || providerName,
            provider: continueProvider,
            model: providerConfig.model || ''
        };

        if (providerConfig.apiKey) {
            modelConfig.apiKey = providerConfig.apiKey;
        }

        if (providerConfig.baseURL) {
            modelConfig.apiBase = this.normalizeApiBase(continueProvider, providerConfig.baseURL, providerName);
        }

        const completionOptions: Record<string, any> = {};
        if (providerConfig.temperature != null) {
            completionOptions.temperature = providerConfig.temperature;
        }
        if (providerConfig.maxTokens != null) {
            completionOptions.maxTokens = providerConfig.maxTokens;
        }
        if (providerConfig.contextWindow != null) {
            completionOptions.contextLength = providerConfig.contextWindow;
        }
        if (providerConfig.disableStreaming) {
            completionOptions.stream = false;
        }
        if (Object.keys(completionOptions).length > 0) {
            modelConfig.defaultCompletionOptions = completionOptions;
        }

        const config = {
            name: 'Tlink AI Assistant',
            version: '1.0.0',
            models: [modelConfig]
        };

        const text = JSON.stringify(config, null, 2);
        const signature = JSON.stringify({
            provider: continueProvider,
            model: modelConfig.model,
            apiBase: modelConfig.apiBase,
            apiKey: modelConfig.apiKey,
            defaultCompletionOptions: modelConfig.defaultCompletionOptions
        });

        return { text, signature };
    }

    private resolveProviderConfig(providerName: string): ProviderConfig {
        const config = this.config.getProviderConfig(providerName);
        if (config) {
            return config;
        }
        try {
            return ProviderConfigUtils.fillDefaults({ name: providerName }, providerName);
        } catch {
            return {
                name: providerName,
                displayName: providerName,
                baseURL: '',
                model: 'gpt-4',
                maxTokens: 1000,
                temperature: 0.7,
                timeout: 30000,
                retries: 3,
                contextWindow: 8192,
                authConfig: { type: 'none', credentials: {} },
                enabled: true
            };
        }
    }

    private mapProviderToContinueProvider(providerName: string): string {
        const normalized = providerName.toLowerCase();
        switch (normalized) {
            case 'anthropic':
                return 'anthropic';
            case 'ollama':
                return 'ollama';
            case 'groq':
                return 'groq';
            case 'vllm':
                return 'vllm';
            case 'minimax':
                return 'deepseek';
            case 'glm':
                return 'anthropic';
            case 'openai-compatible':
            case 'tlink-agentic':
            case 'tlink-agent':
            case 'tlink-proxy':
            case 'ollama-cloud':
                return 'openai';
            case 'openai':
            default:
                return 'openai';
        }
    }

    private normalizeApiBase(provider: string, baseUrl: string, originalProvider?: string): string {
        if (!baseUrl) {
            return baseUrl;
        }
        const trimmed = baseUrl.replace(/\/+$/, '');
        const normalizedOriginal = (originalProvider || '').toLowerCase();

        if (normalizedOriginal === 'tabby') {
            if (trimmed.endsWith('/v1beta')) {
                return trimmed;
            }
            if (trimmed.endsWith('/v1')) {
                return `${trimmed.slice(0, -3)}/v1beta`;
            }
            return `${trimmed}/v1beta`;
        }

        const requiresV1 = provider === 'anthropic' || provider === 'openai';
        if (requiresV1 && !trimmed.endsWith('/v1')) {
            return `${trimmed}/v1`;
        }
        return trimmed;
    }

    private writeContinueConfigFile(contents: string): string {
        const fs = this.getFs();
        const path = this.getPath();
        if (!fs || !path) {
            throw new Error('File system not available to write Continue config');
        }

        const dataDir = this.fileStorage.getPluginDataDirectory();
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const filePath = path.join(dataDir, 'continue-config.yaml');
        fs.writeFileSync(filePath, contents, 'utf-8');
        return filePath;
    }

    private async postJson(url: string, body: any): Promise<any> {
        return this.fetchJson(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {})
        });
    }

    private async fetchJson(url: string, init?: RequestInit): Promise<any> {
        const fetcher: any = (window as any).fetch || fetch;
        if (!fetcher) {
            throw new Error('fetch API not available');
        }
        const response = await fetcher(url, init);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    private resolveEmbeddedCli(workdir: string): { path: string | null; root: string | null; missingDist: boolean } {
        const fs = this.getFs();
        const path = this.getPath();
        if (!fs || !path) {
            return { path: null, root: null, missingDist: false };
        }

        const start = workdir || '';
        if (!start) {
            return { path: null, root: null, missingDist: false };
        }

        let current = path.resolve(start);
        for (let i = 0; i < 8; i++) {
            const root = path.resolve(current, 'third_party', 'continue');
            const candidate = path.resolve(root, 'extensions', 'cli', 'dist', 'cn.js');
            if (fs.existsSync(candidate)) {
                return { path: candidate, root, missingDist: false };
            }
            if (fs.existsSync(path.resolve(root, 'extensions', 'cli'))) {
                return { path: null, root, missingDist: true };
            }
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }

        return { path: null, root: null, missingDist: false };
    }

    private resolveNodeCandidates(workdir?: string): Array<{ command: string; envOverrides: Record<string, string> }> {
        const win: any = window as any;
        const envNode = win?.process?.env?.CONTINUE_NODE_BINARY || win?.process?.env?.NODE_BINARY;
        const candidates: Array<{ command: string; envOverrides: Record<string, string> }> = [];
        if (envNode) {
            candidates.push({ command: envNode, envOverrides: {} });
        }

        const fs = this.getFs();
        const path = this.getPath();
        const execPath = win?.process?.execPath || '';

        const resolvedNode = this.findNodeBinary();
        if (resolvedNode) {
            candidates.push({ command: resolvedNode, envOverrides: {} });
        }

        if (execPath) {
            const execEnv: Record<string, string> = this.needsElectronRunAsNode(execPath)
                ? { ELECTRON_RUN_AS_NODE: '1' }
                : {};
            candidates.push({ command: execPath, envOverrides: execEnv });

            const electronBinary = this.resolveElectronBinaryFromExecPath(execPath);
            if (electronBinary) {
                candidates.push({ command: electronBinary, envOverrides: { ELECTRON_RUN_AS_NODE: '1' } });
            }
        }

        const cwd = workdir || win?.process?.cwd?.() || '';
        if (path && cwd) {
            candidates.push({
                command: path.join(cwd, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
                envOverrides: { ELECTRON_RUN_AS_NODE: '1' }
            });
            candidates.push({
                command: path.join(cwd, 'node_modules', '.bin', 'node'),
                envOverrides: {}
            });
        }

        candidates.push({ command: 'node', envOverrides: {} });

        const unique = new Map<string, { command: string; envOverrides: Record<string, string> }>();
        for (const candidate of candidates) {
            if (!candidate.command) continue;
            if (unique.has(candidate.command)) continue;
            unique.set(candidate.command, candidate);
        }

        const resolved = Array.from(unique.values());
        const pathLikeExisting = resolved.filter((candidate) => {
            if (!this.isPathLike(candidate.command)) return false;
            return fs?.existsSync?.(candidate.command) === true;
        });

        if (pathLikeExisting.length > 0) {
            return pathLikeExisting.concat(
                resolved.filter((candidate) => !this.isPathLike(candidate.command))
            );
        }

        return resolved;
    }

    private logNodeCandidates(candidates: Array<{ command: string }>): void {
        const fs = this.getFs();
        const path = this.getPath();
        const items = candidates.map((candidate) => {
            const command = candidate.command;
            if (!command) {
                return 'unknown';
            }
            if (this.isPathLike(command)) {
                const exists = fs?.existsSync?.(command) ? 'exists' : 'missing';
                return `${command} (${exists})`;
            }
            if (!path) {
                return `${command} (path unknown)`;
            }
            const envPath = (window as any)?.process?.env?.PATH || '';
            const found = envPath
                .split(path.delimiter)
                .filter(Boolean)
                .some((entry: string) => fs?.existsSync?.(path.join(entry, command)));
            return `${command} (${found ? 'in PATH' : 'not in PATH'})`;
        });
        this.logger.warn(`Continue node candidates: ${items.join(' | ')}`);
    }

    private findNodeBinary(): string | null {
        const fs = this.getFs();
        const path = this.getPath();
        const win: any = window as any;
        if (!fs || !path) {
            return null;
        }

        const nodeExecutable = win?.process?.platform === 'win32' ? 'node.exe' : 'node';
        const candidates = new Set<string>();
        const envPath = win?.process?.env?.PATH || '';
        const pathEntries = envPath.split(path.delimiter).filter(Boolean);
        for (const entry of pathEntries) {
            candidates.add(path.join(entry, nodeExecutable));
        }

        const envNvmBin = win?.process?.env?.NVM_BIN;
        if (envNvmBin) {
            candidates.add(path.join(envNvmBin, nodeExecutable));
        }

        const envVolta = win?.process?.env?.VOLTA_HOME;
        if (envVolta) {
            candidates.add(path.join(envVolta, 'bin', nodeExecutable));
        }

        const envFnm = win?.process?.env?.FNM_DIR;
        if (envFnm) {
            candidates.add(path.join(envFnm, nodeExecutable));
        }

        const envAsdf = win?.process?.env?.ASDF_DIR;
        if (envAsdf) {
            candidates.add(path.join(envAsdf, 'shims', nodeExecutable));
        }

        const home = win?.process?.env?.HOME;
        if (home) {
            candidates.add(path.join(home, '.volta', 'bin', nodeExecutable));
            candidates.add(path.join(home, '.asdf', 'shims', nodeExecutable));
            candidates.add(path.join(home, '.fnm', nodeExecutable));

            const nvmDir = win?.process?.env?.NVM_DIR || path.join(home, '.nvm');
            const nvmVersions = path.join(nvmDir, 'versions', 'node');
            try {
                if (fs.existsSync(nvmVersions)) {
                    const entries = fs.readdirSync(nvmVersions);
                    for (const entry of entries) {
                        candidates.add(path.join(nvmVersions, entry, 'bin', nodeExecutable));
                    }
                }
            } catch {
                // Ignore nvm scan errors
            }
        }

        // Common install locations (Homebrew, system)
        candidates.add(path.join('/opt/homebrew/bin', nodeExecutable));
        candidates.add(path.join('/usr/local/bin', nodeExecutable));
        candidates.add(path.join('/usr/bin', nodeExecutable));
        candidates.add(path.join('/bin', nodeExecutable));

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    private buildSpawnEnv(nodeSpec: { envOverrides: Record<string, string> }): Record<string, string> {
        const win: any = window as any;
        const env = { ...(win?.process?.env || {}), ...(nodeSpec.envOverrides || {}) } as Record<string, string>;
        env.PATH = this.extendPath(env.PATH || '');
        return env;
    }

    private extendPath(currentPath: string): string {
        const path = this.getPath();
        const win: any = window as any;
        if (!path) {
            return currentPath;
        }

        const entries = new Set<string>();
        const current = currentPath.split(path.delimiter).filter(Boolean);
        for (const entry of current) {
            entries.add(entry);
        }

        const home = win?.process?.env?.HOME;
        const extras = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin'
        ];
        if (home) {
            extras.push(path.join(home, '.volta', 'bin'));
            extras.push(path.join(home, '.asdf', 'shims'));
            extras.push(path.join(home, '.fnm'));
        }

        for (const entry of extras) {
            entries.add(entry);
        }

        return Array.from(entries).join(path.delimiter);
    }

    private needsElectronRunAsNode(command: string): boolean {
        const win: any = window as any;
        if (win?.process?.versions?.electron) {
            return true;
        }
        return /Electron(\sHelper)?/i.test(command);
    }

    private resolveElectronBinaryFromExecPath(execPath: string): string | null {
        const path = this.getPath();
        const fs = this.getFs();
        if (!path) return null;
        if (!execPath.includes('Electron.app')) return null;

        const electronAppIndex = execPath.indexOf('Electron.app');
        if (electronAppIndex === -1) return null;
        const appRoot = execPath.slice(0, electronAppIndex + 'Electron.app'.length);
        const candidate = path.join(appRoot, 'Contents', 'MacOS', 'Electron');
        if (fs?.existsSync(candidate)) {
            return candidate;
        }
        return null;
    }

    private isPathLike(command: string): boolean {
        return command.includes('/') || command.includes('\\');
    }

    private async findFreePort(): Promise<number> {
        const net = this.getNet();
        if (!net) {
            return 8000 + Math.floor(Math.random() * 1000);
        }

        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', (error: any) => {
                reject(error);
            });
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                const port = typeof address === 'object' && address ? address.port : 0;
                server.close(() => resolve(port || 8000));
            });
        });
    }

    private getChildProcess(): any {
        const win: any = window as any;
        return win?.require?.('child_process');
    }

    private getNet(): any {
        const win: any = window as any;
        return win?.require?.('net');
    }

    private getFs(): any {
        const win: any = window as any;
        return win?.require?.('fs');
    }

    private getPath(): any {
        const win: any = window as any;
        return win?.require?.('path');
    }

    private getPromiseIpc(): any {
        const win: any = window as any;
        try {
            return win?.require?.('electron-promise-ipc');
        } catch {
            return null;
        }
    }

    private formatError(error: any): string {
        if (!error) return 'Unknown error';
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        if (typeof error === 'object') {
            const details: Record<string, any> = {};
            const keys = ['message', 'code', 'errno', 'syscall', 'path', 'spawnargs', 'stack', 'name'];
            for (const key of keys) {
                if (error[key] != null) {
                    details[key] = error[key];
                }
            }
            if (Object.keys(details).length > 0) {
                try {
                    return JSON.stringify(details);
                } catch {
                    return String(details);
                }
            }
            try {
                return JSON.stringify(error);
            } catch {
                return String(error);
            }
        }
        return String(error);
    }
}
