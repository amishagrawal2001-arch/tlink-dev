import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommandResponse } from '../../types/ai.types';
import { RiskLevel } from '../../types/security.types';
import { TerminalManagerService, TerminalInfo } from '../../services/terminal/terminal-manager.service';
import { LoggerService } from '../../services/core/logger.service';

@Component({
    selector: 'app-command-preview',
    templateUrl: './command-preview.component.html',
    styleUrls: ['./command-preview.component.scss']
})
export class CommandPreviewComponent {
    @Input() command: CommandResponse | null = null;
    @Input() riskLevel: RiskLevel = RiskLevel.LOW;

    @Output() executed = new EventEmitter<CommandResponse>();
    @Output() closed = new EventEmitter<void>();

    // 终端选择
    terminals: TerminalInfo[] = [];
    selectedTerminalIndex = 0;
    showTerminalSelector = false;
    executionStatus: 'idle' | 'executing' | 'success' | 'error' = 'idle';
    statusMessage = '';

    constructor(
        private terminalManager: TerminalManagerService,
        private logger: LoggerService
    ) {
        this.loadTerminals();
    }

    /**
     * 加载可用终端列表
     */
    loadTerminals(): void {
        this.terminals = this.terminalManager.getAllTerminalInfo();
        // 默认选择当前活动终端
        const activeIndex = this.terminals.findIndex(t => t.isActive);
        if (activeIndex >= 0) {
            this.selectedTerminalIndex = activeIndex;
        }
    }

    getRiskText(): string {
        switch (this.riskLevel) {
            case RiskLevel.LOW: return 'Low risk';
            case RiskLevel.MEDIUM: return 'Medium risk';
            case RiskLevel.HIGH: return 'High risk';
            case RiskLevel.CRITICAL: return 'Critical risk';
            default: return 'Unknown risk';
        }
    }

    getRiskIcon(): string {
        switch (this.riskLevel) {
            case RiskLevel.LOW: return 'fa fa-check-circle';
            case RiskLevel.MEDIUM: return 'fa fa-exclamation-triangle';
            case RiskLevel.HIGH: return 'fa fa-exclamation-circle';
            case RiskLevel.CRITICAL: return 'fa fa-ban';
            default: return 'fa fa-question-circle';
        }
    }

    /**
     * 复制命令到剪贴板
     */
    copyCommand(): void {
        if (this.command) {
            navigator.clipboard.writeText(this.command.command);
            this.statusMessage = 'Copied to clipboard';
            setTimeout(() => this.statusMessage = '', 2000);
        }
    }

    /**
     * 执行命令到终端
     */
    execute(): void {
        if (!this.command) return;

        // Check if there are available terminals
        if (!this.terminalManager.hasTerminal()) {
            this.executionStatus = 'error';
            this.statusMessage = 'No available terminals. Open a terminal tab first.';
            return;
        }

        this.executionStatus = 'executing';
        this.statusMessage = 'Executing...';

        try {
            // 如果选择了特定终端，先切换到该终端
            if (this.selectedTerminalIndex >= 0 && this.terminals.length > 0) {
                this.terminalManager.focusTerminal(this.selectedTerminalIndex);
            }

            // 发送命令到终端
            const success = this.terminalManager.sendCommand(this.command.command, true);

            if (success) {
                this.executionStatus = 'success';
                this.statusMessage = 'Command sent to terminal';
                this.logger.info('Command executed', { command: this.command.command });

                // 触发执行事件
                this.executed.emit(this.command);

                // 2秒后关闭预览
                setTimeout(() => this.close(), 2000);
            } else {
                this.executionStatus = 'error';
                this.statusMessage = 'Failed to send command';
            }
        } catch (error) {
            this.executionStatus = 'error';
            this.statusMessage = `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logger.error('Failed to execute command', error);
        }
    }

    /**
     * 仅插入命令（不执行）
     */
    insertOnly(): void {
        if (!this.command) return;

        if (!this.terminalManager.hasTerminal()) {
            this.statusMessage = 'No available terminal';
            return;
        }

        const success = this.terminalManager.sendCommand(this.command.command, false);
        if (success) {
            this.statusMessage = 'Command inserted into terminal (not executed)';
            setTimeout(() => this.close(), 1500);
        }
    }

    /**
     * 切换终端选择器
     */
    toggleTerminalSelector(): void {
        this.loadTerminals();
        this.showTerminalSelector = !this.showTerminalSelector;
    }

    /**
     * 选择终端
     */
    selectTerminal(index: number): void {
        this.selectedTerminalIndex = index;
        this.showTerminalSelector = false;
    }

    /**
     * 关闭预览
     */
    close(): void {
        this.closed.emit();
    }

    /**
     * 选择替代命令
     */
    selectAlternative(alt: any): void {
        if (this.command && alt) {
            this.command = { ...this.command, command: alt.command || alt };
        }
    }
}
