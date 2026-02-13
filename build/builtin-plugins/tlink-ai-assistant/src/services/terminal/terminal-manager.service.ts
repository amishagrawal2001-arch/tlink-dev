import { Injectable, NgZone } from '@angular/core';
import { Subject, Observable, Subscription, BehaviorSubject, interval } from 'rxjs';
import { AppService } from 'tlink-core';
import { BaseTerminalTabComponent } from 'tlink-terminal';
import { LoggerService } from '../core/logger.service';

// Use any to avoid generic version compatibility issues
type TerminalTab = BaseTerminalTabComponent<any>;

/**
 * Terminal information interface
 */
export interface TerminalInfo {
    id: string;
    title: string;
    isActive: boolean;
    cwd?: string;
}

/**
 * AI-aware terminal context information
 */
export interface TerminalContext {
    terminalId: string;
    currentDirectory: string;
    activeShell: string;
    prompt: string;
    lastCommand?: string;
    processes: ProcessInfo[];
    environment: Record<string, string>;
    timestamp: number;
}

/**
 * Process information
 */
export interface ProcessInfo {
    pid: number;
    name: string;
    command: string;
    status: 'running' | 'sleeping' | 'stopped';
    cpu?: number;
    memory?: number;
}

/**
 * Terminal output event
 */
export interface TerminalOutputEvent {
    terminalId: string;
    data: string;
    timestamp: number;
    type: 'output' | 'command' | 'error' | 'prompt';
}

/**
 * Terminal management service
 * Encapsulates Tlink terminal API, provides ability to read, write and manage terminals
 */
@Injectable({ providedIn: 'root' })
export class TerminalManagerService {
    private outputSubscriptions = new Map<string, Subscription>();
    private outputSubject = new Subject<{ terminalId: string; data: string }>();
    private terminalChangeSubject = new Subject<void>();

    // AI-aware related fields
    private contextCache = new Map<string, TerminalContext>();
    private outputEventSubject = new Subject<TerminalOutputEvent>();
    private processMonitoringSubject = new Subject<{ terminalId: string; processes: ProcessInfo[] }>();
    private promptDetectionSubject = new Subject<{ terminalId: string; prompt: string }>();
    private monitoringIntervals = new Map<string, Subscription>();

    public outputEvent$ = this.outputEventSubject.asObservable();
    public processMonitoring$ = this.processMonitoringSubject.asObservable();
    public promptDetection$ = this.promptDetectionSubject.asObservable();

    constructor(
        private app: AppService,
        private logger: LoggerService,
        private zone: NgZone
    ) {
        this.logger.info('TerminalManagerService initialized');

        // Listen to tab changes
        this.app.tabsChanged$.subscribe(() => {
            this.terminalChangeSubject.next();
        });
    }

    /**
     * Get current active terminal
     * Note: Tlink wraps terminals in SplitTabComponent
     */
    getActiveTerminal(): TerminalTab | null {
        const tab = this.app.activeTab;
        if (!tab) return null;

        // Directly is terminal
        if (this.isTerminalTab(tab)) {
            return tab as TerminalTab;
        }

        // SplitTabComponent wrapper - get focused child tab
        if (tab.constructor.name === 'SplitTabComponent') {
            const splitTab = tab as any;
            // Try to get focused child tab
            if (typeof splitTab.getFocusedTab === 'function') {
                const focusedTab = splitTab.getFocusedTab();
                if (focusedTab && this.isTerminalTab(focusedTab)) {
                    return focusedTab as TerminalTab;
                }
            }
            // Fallback: get first terminal
            if (typeof splitTab.getAllTabs === 'function') {
                const innerTabs = splitTab.getAllTabs() as any[];
                for (const innerTab of innerTabs) {
                    if (this.isTerminalTab(innerTab)) {
                        return innerTab as TerminalTab;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Get all terminal tabs
     * Note: Tlink wraps terminals in SplitTabComponent
     */
    getAllTerminals(): TerminalTab[] {
        const allTabs = this.app.tabs || [];
        const terminals: TerminalTab[] = [];

        for (const tab of allTabs) {
            // If it's a SplitTabComponent, extract internal terminals
            if (tab.constructor.name === 'SplitTabComponent' && typeof (tab as any).getAllTabs === 'function') {
                const innerTabs = (tab as any).getAllTabs() as any[];
                for (const innerTab of innerTabs) {
                    if (this.isTerminalTab(innerTab)) {
                        terminals.push(innerTab as TerminalTab);
                    }
                }
            } else if (this.isTerminalTab(tab)) {
                // Also check direct terminal tabs
                terminals.push(tab as TerminalTab);
            }
        }

        this.logger.info('Getting all terminals', {
            topLevelTabs: allTabs.length,
            foundTerminals: terminals.length,
            terminalTitles: terminals.map(t => t.title)
        });

        return terminals;
    }

    /**
     * Get all terminal information
     */
    getAllTerminalInfo(): TerminalInfo[] {
        const activeTerminal = this.getActiveTerminal();
        return this.getAllTerminals().map((terminal, index) => ({
            id: `terminal-${index}`,
            title: terminal.title || `Terminal ${index + 1}`,
            isActive: terminal === activeTerminal,
            cwd: this.getTerminalCwd(terminal)
        }));
    }

    /**
     * Send command to current terminal
     */
    sendCommand(command: string, execute: boolean = true): boolean {
        const terminal = this.getActiveTerminal();
        if (!terminal) {
            this.logger.warn('No active terminal found');
            return false;
        }

        return this.sendCommandToTerminal(terminal, command, execute);
    }

    /**
     * Send command to specified terminal
     */
    sendCommandToTerminal(terminal: TerminalTab, command: string, execute: boolean = true): boolean {
        try {
            const fullCommand = execute ? command + '\r' : command;

            // Debug: check terminal object state
            this.logger.info('Terminal object details', {
                hasSession: !!(terminal as any).session,
                hasFrontend: !!(terminal as any).frontend,
                hasSendInput: typeof terminal.sendInput === 'function',
                terminalTitle: terminal.title
            });

            // Prefer using sendInput (standard API)
            if (typeof terminal.sendInput === 'function') {
                this.logger.info('Using terminal.sendInput');
                terminal.sendInput(fullCommand);
                this.logger.info('Command sent via sendInput', { command, execute });
                return true;
            }

            // Fallback: use session.write
            const session = (terminal as any).session;
            if (session && typeof session.write === 'function') {
                this.logger.info('Using session.write');
                session.write(fullCommand);
                this.logger.info('Command sent via session.write', { command, execute });
                return true;
            }

            this.logger.warn('No valid method to send command found');
            return false;
        } catch (error) {
            this.logger.error('Failed to send command to terminal', error);
            return false;
        }
    }

    /**
     * Send command to terminal at specified index
     */
    sendCommandToIndex(index: number, command: string, execute: boolean = true): boolean {
        const terminals = this.getAllTerminals();
        if (index < 0 || index >= terminals.length) {
            this.logger.warn('Invalid terminal index', { index, count: terminals.length });
            return false;
        }

        return this.sendCommandToTerminal(terminals[index], command, execute);
    }

    /**
     * Get selected text from current terminal
     */
    getSelection(): string {
        const terminal = this.getActiveTerminal();
        if (!terminal || !terminal.frontend) {
            return '';
        }

        try {
            // Tlink uses frontend.getSelection() to get selected content
            const selection = terminal.frontend.getSelection?.();
            return selection || '';
        } catch (error) {
            this.logger.error('Failed to get selection', error);
            return '';
        }
    }

    /**
     * Get selected text from current terminal (alias)
     * Used for hotkey functionality
     */
    getSelectedText(): string | null {
        const selection = this.getSelection();
        return selection || null;
    }

    /**
     * Get last command from current terminal
     * Used for hotkey functionality - Command explanation
     * Note: If no active terminal, try to get any available terminal
     */
    getLastCommand(): string | null {
        // First try current active terminal
        let output = this.readTerminalOutput(10);

        // If current active terminal has no output, try to get first available terminal
        if (!output || output.trim() === '') {
            const terminals = this.getAllTerminals();
            for (const terminal of terminals) {
                try {
                    const terminalOutput = this.readTerminalOutputFromTerminal(terminal, 10);
                    if (terminalOutput && terminalOutput.trim() !== '') {
                        output = terminalOutput;
                        break;
                    }
                } catch {
                    continue;
                }
            }
        }

        if (!output) return null;

        // 尝试提取最后一条命令（通常是 $ 或 > 后面的内容）
        const lines = output.split('\n').filter(l => l.trim());

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            // 匹配常见的命令提示符
            const match = line.match(/(?:[$>%#]|PS [^>]+>)\s*(.+)/);
            if (match && match[1]) {
                const cmd = match[1].trim();
                // 排除明显的非命令行
                if (cmd && !cmd.startsWith('[') && cmd.length > 0) {
                    return cmd;
                }
            }
        }
        return null;
    }

    /**
     * Get recent output from current terminal (for explanation)
     * Used for hotkey functionality - Get terminal context
     * Note: If no active terminal, try to get any available terminal
     */
    getRecentContext(): string {
        // First try current active terminal
        let output = this.readTerminalOutput(20);

        // If current active terminal has no output, try to get first available terminal
        if (!output || output.trim() === '') {
            const terminals = this.getAllTerminals();
            for (const terminal of terminals) {
                try {
                    const terminalOutput = this.readTerminalOutputFromTerminal(terminal, 20);
                    if (terminalOutput && terminalOutput.trim() !== '') {
                        output = terminalOutput;
                        break;
                    }
                } catch {
                    continue;
                }
            }
        }

        return output || '';
    }

    /**
     * Read output from specified terminal
     */
    private readTerminalOutputFromTerminal(terminal: TerminalTab, lines: number = 50): string {
        if (!terminal || !terminal.frontend) {
            return '';
        }

        try {
            const frontend = terminal.frontend as any;

            // 方法 1: 使用 xterm buffer
            if (frontend.xterm?.buffer?.active) {
                const buffer = frontend.xterm.buffer.active;
                const totalLines = buffer.length;
                const startLine = Math.max(0, totalLines - lines);
                const outputLines: string[] = [];

                for (let i = startLine; i < totalLines; i++) {
                    const line = buffer.getLine(i);
                    if (line) {
                        const text = line.translateToString(true);
                        if (text.trim()) {
                            outputLines.push(text);
                        }
                    }
                }

                return outputLines.join('\n');
            }

            // 方法 2: 使用 frontend.saveContentsToFile 模拟
            if (typeof frontend.getContentsAsString === 'function') {
                return frontend.getContentsAsString(lines);
            }
        } catch (error) {
            this.logger.debug('Failed to read terminal output', error);
        }

        return '';
    }

    /**
     * Get terminal working directory
     */
    getTerminalCwd(terminal?: TerminalTab): string | undefined {
        const t = terminal || this.getActiveTerminal();
        if (!t) return undefined;

        try {
            // 尝试从会话获取 cwd
            const session = (t as any).session;
            if (session?.cwd) {
                return session.cwd;
            }
            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Switch to specified terminal
     * 修复：需要选择顶层 Tab (SplitTabComponent)，而非内部终端
     */
    focusTerminal(index: number): boolean {
        const allTabs = this.app.tabs || [];
        const terminals = this.getAllTerminals();

        if (index < 0 || index >= terminals.length) {
            this.logger.warn('Invalid terminal index', { index, count: terminals.length });
            return false;
        }

        const targetTerminal = terminals[index];

        try {
            // 步骤1：查找包含目标终端的顶层 Tab
            let topLevelTab: any = null;
            let splitTabRef: any = null;

            for (const tab of allTabs) {
                // 情况1：Directly is terminal Tab（不在 SplitTabComponent 内）
                if (this.isTerminalTab(tab) && tab === targetTerminal) {
                    topLevelTab = tab;
                    break;
                }

                // 情况2：终端在 SplitTabComponent 内部
                if (tab.constructor.name === 'SplitTabComponent') {
                    const splitTab = tab as any;
                    if (typeof splitTab.getAllTabs === 'function') {
                        const innerTabs = splitTab.getAllTabs() as any[];
                        if (innerTabs.includes(targetTerminal)) {
                            topLevelTab = tab;       // 顶层 SplitTabComponent
                            splitTabRef = splitTab;  // 保存引用，用于内部聚焦
                            break;
                        }
                    }
                }
            }

            if (!topLevelTab) {
                this.logger.warn('Target terminal not found', { index });
                return false;
            }

            // 步骤2：在 Angular Zone 内执行 UI 变更，确保触发变更检测
            this.zone.run(() => {
                // 1. 选择顶层 Tab（如果不是当前的，避免重复调用 selectTab）
                if (this.app.activeTab !== topLevelTab) {
                    this.app.selectTab(topLevelTab);
                }

                // 2. 关键修复：调用 SplitTabComponent.focus() 切换内部焦点
                if (splitTabRef && typeof splitTabRef.focus === 'function') {
                    splitTabRef.focus(targetTerminal);
                }

                // 3. 确保终端获得输入焦点
                const terminalAny = targetTerminal as any;
                if (typeof terminalAny.focus === 'function') {
                    terminalAny.focus();
                }
            });

            this.logger.info('Focused terminal', {
                index,
                title: targetTerminal.title,
                isInSplitTab: !!splitTabRef
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to focus terminal', error);
            return false;
        }
    }

    /**
     * Subscribe to current terminal output
     */
    subscribeToActiveTerminalOutput(callback: (data: string) => void): Subscription | null {
        const terminal = this.getActiveTerminal();
        if (!terminal) {
            this.logger.warn('No active terminal to subscribe');
            return null;
        }

        return this.subscribeToTerminalOutput(terminal, callback);
    }

    /**
     * Subscribe to specified terminal output
     */
    subscribeToTerminalOutput(terminal: TerminalTab, callback: (data: string) => void): Subscription {
        return terminal.output$.subscribe(data => {
            callback(data);
        });
    }

    /**
     * Get terminal change event stream
     */
    onTerminalChange(): Observable<void> {
        return this.terminalChangeSubject.asObservable();
    }

    /**
     * Get terminal count
     */
    getTerminalCount(): number {
        return this.getAllTerminals().length;
    }

    /**
     * Check if there are available terminals
     */
    hasTerminal(): boolean {
        return this.getTerminalCount() > 0;
    }

    /**
     * Check if tab is a terminal
     * 使用特征检测避免 instanceof 在 webpack 打包后失效
     */
    private isTerminalTab(tab: any): boolean {
        if (!tab) return false;

        // Method 1: instanceof 检测
        if (tab instanceof BaseTerminalTabComponent) {
            this.logger.debug('Terminal detected via instanceof');
            return true;
        }

        // Method 2: 使用 in 操作符检测 sendInput（包括原型链）
        if ('sendInput' in tab && 'frontend' in tab) {
            this.logger.debug('Terminal detected via sendInput in proto');
            return true;
        }

        // Method 4: 检测 session 和 frontend 属性
        if (tab.session !== undefined && tab.frontend !== undefined) {
            this.logger.debug('Terminal detected via session+frontend');
            return true;
        }

        // Method 4: 检查原型链名称
        let proto = Object.getPrototypeOf(tab);
        while (proto && proto.constructor) {
            const protoName = proto.constructor.name || '';
            if (protoName.includes('Terminal') || protoName.includes('SSH') ||
                protoName.includes('Local') || protoName.includes('Telnet') ||
                protoName.includes('Serial') || protoName.includes('BaseTerminal')) {
                this.logger.debug('Terminal detected via prototype:', protoName);
                return true;
            }
            if (proto === Object.prototype) break;
            proto = Object.getPrototypeOf(proto);
        }

        return false;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.outputSubscriptions.forEach(sub => sub.unsubscribe());
        this.outputSubscriptions.clear();
        this.monitoringIntervals.forEach(sub => sub.unsubscribe());
        this.monitoringIntervals.clear();
    }

    // ==================== AI感知能力 ====================

    /**
     * Detect current directory
     */
    async detectCurrentDirectory(terminal?: TerminalTab): Promise<string> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return process.cwd();
        }

        try {
            // First try to get from session
            const cwd = this.getTerminalCwd(t);
            if (cwd) {
                return cwd;
            }

            // If cannot get from session, use pwd 命令
            const originalPrompt = await this.getPrompt(t);
            this.sendCommandToTerminal(t, 'pwd', true);

            // 等待输出（简化实现）
            await new Promise(resolve => setTimeout(resolve, 500));

            const newPrompt = await this.getPrompt(t);
            const pwdOutput = this.extractCommandOutput(originalPrompt, newPrompt, 'pwd');

            return pwdOutput || process.cwd();
        } catch (error) {
            this.logger.error('Failed to detect current directory', error);
            return process.cwd();
        }
    }

    /**
     * Get active shell
     */
    async getActiveShell(terminal?: TerminalTab): Promise<string> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return 'unknown';
        }

        try {
            // 尝试从环境变量获取
            const shell = process.env.SHELL || process.env.COMSPEC || 'unknown';

            // 如果无法从环境变量获取，使用 echo $SHELL (Unix) 或 echo %COMSPEC% (Windows)
            const shellCommand = process.platform === 'win32' ? 'echo %COMSPEC%' : 'echo $SHELL';
            this.sendCommandToTerminal(t, shellCommand, true);

            await new Promise(resolve => setTimeout(resolve, 500));

            return shell;
        } catch (error) {
            this.logger.error('Failed to detect active shell', error);
            return 'unknown';
        }
    }

    /**
     * Monitor output stream
     */
    monitorOutput(terminal?: TerminalTab): Observable<TerminalOutputEvent> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            throw new Error('No terminal available for monitoring');
        }

        const terminalId = this.getTerminalId(t);

        // 订阅终端输出
        const subscription = t.output$.subscribe(data => {
            const event: TerminalOutputEvent = {
                terminalId,
                data,
                timestamp: Date.now(),
                type: this.detectOutputType(data)
            };

            this.outputEventSubject.next(event);
        });

        this.monitoringIntervals.set(terminalId, subscription);

        return this.outputEvent$.pipe(
            // 只返回当前终端的事件
            // Note: 实际实现中需要过滤
        );
    }

    /**
     * Detect prompt
     */
    async getPrompt(terminal?: TerminalTab): Promise<string> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return '';
        }

        try {
            // 发送一个空命令来触发提示符显示
            this.sendCommandToTerminal(t, '', true);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Simplified implementation:返回默认提示符格式
            const shell = await this.getActiveShell(t);
            const cwd = await this.detectCurrentDirectory(t);

            return this.formatPrompt(shell, cwd);
        } catch (error) {
            this.logger.error('Failed to detect prompt', error);
            return '$ ';
        }
    }

    /**
     * Track processes
     */
    async trackProcesses(terminal?: TerminalTab): Promise<ProcessInfo[]> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            return [];
        }

        try {
            // 使用 ps 命令获取进程列表
            const psCommand = process.platform === 'win32' ? 'tasklist' : 'ps aux';
            this.sendCommandToTerminal(t, psCommand, true);

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Simplified implementation:返回模拟进程信息
            const processes: ProcessInfo[] = [
                {
                    pid: process.pid,
                    name: process.platform === 'win32' ? 'node.exe' : 'node',
                    command: process.argv0,
                    status: 'running'
                }
            ];

            this.processMonitoringSubject.next({
                terminalId: this.getTerminalId(t),
                processes
            });

            return processes;
        } catch (error) {
            this.logger.error('Failed to track processes', error);
            return [];
        }
    }

    /**
     * Get terminal AI context
     */
    async getTerminalContext(terminal?: TerminalTab): Promise<TerminalContext> {
        const t = terminal || this.getActiveTerminal();
        if (!t) {
            throw new Error('No terminal available');
        }

        const terminalId = this.getTerminalId(t);

        // Check cache
        if (this.contextCache.has(terminalId)) {
            const cached = this.contextCache.get(terminalId)!;
            // If cache is not older than 5 seconds, return directly
            if (Date.now() - cached.timestamp < 5000) {
                return cached;
            }
        }

        // Get latest context information
        const [currentDirectory, activeShell, prompt, processes] = await Promise.all([
            this.detectCurrentDirectory(t),
            this.getActiveShell(t),
            this.getPrompt(t),
            this.trackProcesses(t)
        ]);

        const context: TerminalContext = {
            terminalId,
            currentDirectory,
            activeShell,
            prompt,
            processes,
            environment: this.filterEnvVariables(process.env),
            timestamp: Date.now()
        };

        // Update cache
        this.contextCache.set(terminalId, context);

        return context;
    }

    /**
     * Clear terminal context cache
     */
    clearContextCache(terminalId?: string): void {
        if (terminalId) {
            this.contextCache.delete(terminalId);
        } else {
            this.contextCache.clear();
        }
    }

    /**
     * Start continuous terminal monitoring
     */
    startContinuousMonitoring(intervalMs: number = 5000): void {
        const terminals = this.getAllTerminals();

        terminals.forEach(terminal => {
            const terminalId = this.getTerminalId(terminal);

            // If already monitoring, stop first
            if (this.monitoringIntervals.has(terminalId)) {
                return;
            }

            const subscription = interval(intervalMs).subscribe(async () => {
                try {
                    await this.getTerminalContext(terminal);
                } catch (error) {
                    this.logger.error('Failed to monitor terminal', { terminalId, error });
                }
            });

            this.monitoringIntervals.set(terminalId, subscription);
        });

        this.logger.info('Started continuous monitoring', {
            terminalCount: terminals.length,
            intervalMs
        });
    }

    /**
     * Stop continuous monitoring
     */
    stopContinuousMonitoring(terminalId?: string): void {
        if (terminalId) {
            const subscription = this.monitoringIntervals.get(terminalId);
            if (subscription) {
                subscription.unsubscribe();
                this.monitoringIntervals.delete(terminalId);
            }
        } else {
            this.monitoringIntervals.forEach(sub => sub.unsubscribe());
            this.monitoringIntervals.clear();
        }

        this.logger.info('Stopped continuous monitoring', { terminalId: terminalId || 'all' });
    }

    /**
     * Read terminal output (required for hotkey functionality)
     */
    readTerminalOutput(lines: number = 50, terminalIndex?: number): string {
        try {
            const terminals = this.getAllTerminals();
            const terminal = terminalIndex !== undefined
                ? terminals[terminalIndex]
                : this.getActiveTerminal();

            if (!terminal) {
                return '';
            }

            // 获取 xterm.js 的 buffer
            const frontend = terminal.frontend as any;
            if (!frontend?._core) {
                return '';
            }

            const core = frontend._core;
            const buffer = core.buffer || (core.terminal && core.terminal.buffer);

            if (!buffer) {
                return '';
            }

            // 获取行数
            const lineCount = buffer.active?.length || buffer.length || 0;
            const startLine = Math.max(0, lineCount - lines);

            // 收集输出行
            const outputLines: string[] = [];
            for (let i = startLine; i < lineCount; i++) {
                try {
                    const line = buffer.active?.getLine(i) || buffer.getLine(i);
                    if (line) {
                        const lineText = line.translateToString();
                        if (lineText) {
                            outputLines.push(lineText);
                        }
                    }
                } catch {
                    // 忽略单行读取错误
                }
            }

            return outputLines.join('\n');
        } catch (error) {
            this.logger.error('Failed to read terminal output', error);
            return '';
        }
    }

    // ==================== 私有辅助方法 ====================

    private getTerminalId(terminal: TerminalTab): string {
        return terminal.title || `terminal-${Math.random().toString(36).substr(2, 9)}`;
    }

    private detectOutputType(data: string): 'output' | 'command' | 'error' | 'prompt' {
        if (data.includes('error') || data.includes('Error') || data.includes('ERROR')) {
            return 'error';
        }
        if (data.includes('$') || data.includes('#') || data.includes('>')) {
            return 'prompt';
        }
        if (data.includes('\r\n') || data.includes('\n')) {
            return 'output';
        }
        return 'command';
    }

    private formatPrompt(shell: string, cwd: string): string {
        const shellName = shell.split('/').pop() || shell;
        return `${shellName}:${cwd}$ `;
    }

    private extractCommandOutput(originalPrompt: string, newPrompt: string, command: string): string {
        // Simplified implementation:Should actually解析终端输出
        const lines = newPrompt.split('\n');
        return lines.find(line => line.includes(command) && !line.includes('$')) || '';
    }

    private filterEnvVariables(env: NodeJS.ProcessEnv): Record<string, string> {
        const result: Record<string, string> = {};
        for (const key of Object.keys(env)) {
            const value = env[key];
            if (value !== undefined) {
                result[key] = value;
            }
        }
        return result;
    }
}
