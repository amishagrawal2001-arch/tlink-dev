import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FileStorageService } from '../../services/core/file-storage.service';
import { Memory } from '../../services/context/memory';
import { ChatHistoryService } from '../../services/chat/chat-history.service';
import { CheckpointManager } from '../../services/core/checkpoint.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { ConsentManagerService } from '../../services/security/consent-manager.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { RequestLogService } from '../../services/core/request-log.service';
import { UsageAggregatorService, UsageAggregate } from '../../services/core/usage-aggregator.service';
import { formatCost } from '../../utils/cost.utils';

/**
 * 数据文件信息
 */
export interface DataFileInfo {
    name: string;
    size: number;
    modified: Date;
}

/**
 * 数据管理设置组件
 * 提供数据存储位置查看、导出、导入和清除功能
 */
@Component({
    selector: 'app-data-settings',
    templateUrl: './data-settings.component.html',
    styles: [`
        /* Compact pass — was 20px outer padding + 20px section gaps,
           now ~12px throughout. Same scannability, ~30% less air. */
        .data-settings {
            padding: 0;
        }

        .data-settings h3 {
            margin-bottom: 6px;
            font-size: 1.05rem;
            color: var(--text-primary);
        }

        .description {
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-size: 0.85rem;
        }

        .data-location {
            background: var(--background-secondary);
            padding: 6px 10px;
            border-radius: 8px;
            margin-bottom: 8px;
        }

        .info-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .info-row label {
            font-weight: 500;
            color: var(--text-secondary);
        }

        .info-row code {
            background: var(--background-tertiary);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            color: var(--text-primary);
        }

        .data-files {
            margin-bottom: 8px;
        }

        .data-files h4 {
            margin-bottom: 8px;
            font-size: 0.95rem;
            color: var(--text-primary);
        }

        .files-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--background-secondary);
            border-radius: 8px;
            overflow: hidden;
        }

        .files-table th,
        .files-table td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }

        .files-table th {
            background: var(--background-tertiary);
            font-weight: 600;
            color: var(--text-secondary);
        }

        .files-table td {
            color: var(--text-primary);
        }

        .files-table tr:last-child td {
            border-bottom: none;
        }

        .file-icon {
            margin-right: 8px;
        }

        .actions {
            display: flex;
            gap: 8px;
        }

        .no-files {
            text-align: center;
            color: var(--text-secondary);
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
        }

        .data-statistics {
            margin-bottom: 8px;
        }

        .data-statistics h4 {
            margin-bottom: 8px;
            font-size: 0.95rem;
            color: var(--text-primary);
        }

        /* Stats grid — was 150px min, 16px gap, 16px padding, 24px
           values. Now 120px min / 8px gap / 10px padding / 18px
           values. Same prominence on the numbers, less wasted card
           space. */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
        }

        .stat-item {
            background: var(--background-secondary);
            padding: 6px 8px;
            border-radius: 6px;
            text-align: center;
        }

        .stat-value {
            display: block;
            font-size: 18px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 2px;
        }

        .stat-label {
            font-size: 11px;
            color: var(--text-secondary);
        }

        .data-actions h4 {
            margin-bottom: 8px;
            font-size: 0.95rem;
            color: var(--text-primary);
        }

        .button-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 12px;
            border: none;
            border-radius: 6px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 0.15s;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-hover);
        }

        .btn-secondary {
            background: var(--background-tertiary);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: var(--border-color);
        }

        .btn-warning {
            background: #f59e0b;
            color: white;
        }

        .btn-warning:hover {
            background: #d97706;
        }

        .btn-danger {
            background: #ef4444;
            color: white;
        }

        .btn-danger:hover {
            background: #dc2626;
        }

        .btn-small {
            padding: 4px 10px;
            font-size: 11px;
        }

        .btn-danger.btn-small {
            background: var(--danger);
        }

        .migration-note {
            margin-top: 12px;
            padding: 10px 12px;
            background: #fef3c7;
            border-radius: 8px;
            border-left: 3px solid #f59e0b;
        }

        /* Usage rollup grid — 4 windows × {tokens, cost}. Tabular
           numerics so the digits align across cells. Cost line is
           hidden when zero (all-local-provider sessions) so cells
           don't show "$0.00" misleading-looking placeholders. */
        .usage-rollup-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
        }

        .usage-rollup-cell {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 8px 10px;
            background: var(--background-secondary);
            border-radius: 6px;
            font-variant-numeric: tabular-nums;
        }

        .usage-rollup-label {
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            font-weight: 600;
        }

        .usage-rollup-value {
            font-size: 14px;
            color: var(--text-primary);
            font-weight: 600;
        }

        .usage-rollup-cost {
            font-size: 12px;
            color: #16a34a;
            font-weight: 600;
        }

        .note-content {
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }

        .note-content .icon {
            font-size: 20px;
        }

        .note-content p {
            margin: 0;
            color: #92400e;
            font-size: 14px;
        }
    `]
})
export class DataSettingsComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    /** 数据目录路径 */
    dataDirectory = '';

    /** 数据文件列表 */
    dataFiles: DataFileInfo[] = [];

    /** 数据统计 */
    statistics = {
        totalSessions: 0,
        totalMemories: 0,
        totalCheckpoints: 0,
        totalConsents: 0
    };

    /** 是否需要从 localStorage 迁移 */
    needsMigration = false;

    /** Most recent persisted-log entry count, refreshed on demand. */
    requestLogCount = 0;

    /** Aggregated AI usage / cost over rolling time windows.
     *  Recomputed on tab open + on demand. Renders the
     *  "Today / Last 7d / This month" rollup widget. */
    usageToday: UsageAggregate = { messageCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCost: 0 };
    usageLast7d: UsageAggregate = { messageCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCost: 0 };
    usageMonth: UsageAggregate = { messageCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCost: 0 };
    usageLifetime: UsageAggregate = { messageCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCost: 0 };

    constructor(
        private fileStorage: FileStorageService,
        private memory: Memory,
        private chatHistoryService: ChatHistoryService,
        private checkpointManager: CheckpointManager,
        private configProvider: ConfigProviderService,
        private consentManager: ConsentManagerService,
        private logger: LoggerService,
        private toast: ToastService,
        private requestLog: RequestLogService,
        private usageAggregator: UsageAggregatorService,
    ) {}

    ngOnInit(): void {
        this.loadDataDirectory();
        this.loadDataFiles();
        this.loadStatistics();
        this.checkMigrationStatus();
        this.loadRequestLogCount();
        this.loadUsageRollups();
    }

    /**
     * Walk every saved chat session, sum AI-message usage stats by
     * time window. Cheap (~1ms even for hundreds of sessions because
     * the messages are already in memory). Recomputed on tab open;
     * doesn't auto-refresh — call again after a chat finishes if the
     * UI ever needs live updates here.
     */
    private loadUsageRollups(): void {
        const all = this.chatHistoryService.getAllMessages();

        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        this.usageToday = this.usageAggregator.aggregateSince(all, startOfToday);
        this.usageLast7d = this.usageAggregator.aggregateSince(all, sevenDaysAgo);
        this.usageMonth = this.usageAggregator.aggregateSince(all, startOfMonth);
        this.usageLifetime = this.usageAggregator.aggregate(all);
    }

    /** Pretty-format an aggregate's cost. Empty when zero so the UI
     *  hides the dollar line on all-local-provider sessions. */
    formatAggregateCost(agg: UsageAggregate): string {
        return agg.totalCost > 0 ? formatCost(agg.totalCost) : '';
    }

    /**
     * Load the count of persisted AI debug-log entries. Used to label
     * the "Copy AI debug log" button so the user can see how many
     * recent calls are about to land in their bug report.
     */
    private async loadRequestLogCount(): Promise<void> {
        try {
            const entries = await this.requestLog.recent();
            this.requestLogCount = entries.length;
        } catch (e) {
            this.logger.warn('Failed to read AI request log count', { error: e });
            this.requestLogCount = 0;
        }
    }

    /**
     * Copy the persisted AI debug log (last N requests / responses /
     * errors, scrubbed + truncated) to the clipboard as NDJSON.
     * Designed for the "paste into a bug report" support flow —
     * users hit the button right after reproducing the issue, paste
     * into GitHub / Slack / email, and the dev gets a chronological
     * log of what the providers actually saw.
     */
    async copyRequestLog(): Promise<void> {
        try {
            const text = await this.requestLog.exportNdjson();
            if (!text) {
                this.toast.info('AI debug log is empty');
                return;
            }
            await navigator.clipboard.writeText(text);
            this.toast.success(`Copied ${this.requestLogCount} AI debug entries to clipboard`);
            this.logger.info('AI debug log copied to clipboard', { entries: this.requestLogCount });
        } catch (e) {
            this.logger.error('Failed to copy AI debug log', e);
            this.toast.error('Failed to copy AI debug log');
        }
    }

    /**
     * Download the persisted AI debug log as an NDJSON file. For users
     * whose clipboard refuses to take a multi-MB blob, or who prefer
     * to attach a file to the bug report rather than paste.
     */
    async downloadRequestLog(): Promise<void> {
        try {
            const text = await this.requestLog.exportNdjson();
            if (!text) {
                this.toast.info('AI debug log is empty');
                return;
            }
            const blob = new Blob([text], { type: 'application/x-ndjson' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tlink-ai-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
            a.click();
            URL.revokeObjectURL(url);
            this.toast.success(`Downloaded ${this.requestLogCount} AI debug entries`);
        } catch (e) {
            this.logger.error('Failed to download AI debug log', e);
            this.toast.error('Failed to download AI debug log');
        }
    }

    /**
     * Wipe the persisted AI debug log. Confirms first since the log is
     * useful for forensics on issues from earlier in the session.
     */
    async clearRequestLog(): Promise<void> {
        if (!confirm('Clear the AI debug log? Recent provider request/response history will be removed.')) {
            return;
        }
        try {
            await this.requestLog.clear();
            this.requestLogCount = 0;
            this.toast.success('AI debug log cleared');
        } catch (e) {
            this.logger.error('Failed to clear AI debug log', e);
            this.toast.error('Failed to clear AI debug log');
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 加载数据目录路径
     */
    private loadDataDirectory(): void {
        this.dataDirectory = this.fileStorage.getDataDirectory();
    }

    /**
     * 加载数据文件列表
     */
    private loadDataFiles(): void {
        this.dataFiles = this.fileStorage.listFilesWithInfo();
    }

    /**
     * 加载数据统计
     */
    private loadStatistics(): void {
        // 聊天会话统计
        const chatStats = this.chatHistoryService.getStatistics();
        this.statistics.totalSessions = chatStats.totalSessions;

        // 记忆统计
        const memoryStats = this.memory.getStatistics();
        this.statistics.totalMemories = memoryStats.totalItems;

        // 检查点统计
        const checkpointStats = this.checkpointManager.getStatistics();
        this.statistics.totalCheckpoints = checkpointStats.totalCheckpoints;
    }

    /**
     * 检查是否需要从 localStorage 迁移
     */
    private checkMigrationStatus(): void {
        // Check if there's still old data in localStorage
        const keys = Object.keys(localStorage);
        const hasOldData = keys.some(key =>
            key.startsWith('tabby-ai-assistant-') ||
            key.startsWith('tlink-ai-assistant-') ||
            key.startsWith('ai-assistant-') ||
            key.startsWith('checkpoint_')
        );
        this.needsMigration = hasOldData;
    }

    /**
     * 打开数据目录
     */
    openDataDirectory(): void {
        try {
            const fs = (window as any).require?.('fs');
            if (fs) {
                const { shell } = (window as any).require('electron');
                shell.openPath(this.dataDirectory);
            } else {
                this.toast.warning('Unable to open directory. Please open it manually in your file manager: ' + this.dataDirectory);
            }
        } catch (error) {
            this.logger.error('Failed to open data directory', error);
            this.toast.error('Failed to open directory');
        }
    }

    /**
     * 查看文件内容
     */
    viewFile(file: DataFileInfo): void {
        try {
            const content = this.fileStorage.load(file.name, null);
            if (content) {
                const jsonContent = JSON.stringify(content, null, 2);
                // 在新窗口中显示内容
                this.showFileContent(file.name, jsonContent);
            }
        } catch (error) {
            this.logger.error('Failed to view file', { file: file.name, error });
            this.toast.error('Failed to view file');
        }
    }

    /**
     * 显示文件内容
     */
    private showFileContent(filename: string, content: string): void {
        // 创建一个临时的内容显示
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success(`Downloaded file: ${filename}`);
    }

    /**
     * 删除文件
     */
    deleteFile(file: DataFileInfo): void {
        if (confirm(`Delete ${file.name}? This action cannot be undone.`)) {
            const deleted = this.fileStorage.delete(file.name);
            if (deleted) {
                this.loadDataFiles();
                this.loadStatistics();
                this.toast.success('File deleted');
                this.logger.info('Data file deleted', { filename: file.name });
            } else {
                this.toast.error('Failed to delete file');
            }
        }
    }

    /**
     * 导出所有数据
     */
    exportAllData(): void {
        try {
            const exportData = this.fileStorage.exportAll();
            const blob = new Blob([exportData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tlink-ai-assistant-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.toast.success('Data exported successfully');
            this.logger.info('All data exported');
        } catch (error) {
            this.logger.error('Failed to export data', error);
            this.toast.error('Failed to export data');
        }
    }

    /**
     * 导入数据
     */
    importData(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event: any) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e: any) => {
                    try {
                        const result = this.fileStorage.importAll(e.target.result);
                        if (result.success) {
                            this.loadDataFiles();
                            this.loadStatistics();
                            this.toast.success(`Imported ${result.imported.length} files successfully`);
                            this.logger.info('Data imported', { imported: result.imported });
                        } else {
                            this.toast.error('Import failed: ' + result.errors.join(', '));
                        }
                    } catch (error) {
                        this.logger.error('Failed to import data', error);
                        this.toast.error('Failed to import data');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    /**
     * 从 localStorage 迁移数据
     */
    migrateFromLocalStorage(): void {
        if (confirm('Migrate data from browser storage to file storage? This will not delete the original data.')) {
            try {
                const migratedFiles = this.fileStorage.migrateFromLocalStorage();
                if (migratedFiles.length > 0) {
                    this.loadDataFiles();
                    this.loadStatistics();
                    this.needsMigration = false;
                    this.toast.success(`Migrated ${migratedFiles.length} files successfully`);
                    this.logger.info('Data migrated from localStorage', { files: migratedFiles });
                } else {
                    this.toast.info('No data to migrate');
                }
            } catch (error) {
                this.logger.error('Failed to migrate data', error);
                this.toast.error('Failed to migrate data');
            }
        }
    }

    /**
     * 清除所有数据
     */
    clearAllData(): void {
        if (confirm('Clear all data? This action cannot be undone.')) {
            if (confirm('Confirm again: this will delete all chat history, memories, and configuration.')) {
                try {
                    const clearedCount = this.fileStorage.clearAll();
                    this.loadDataFiles();
                    this.loadStatistics();
                    this.toast.success(`Cleared ${clearedCount} data files`);
                    this.logger.info('All data cleared', { count: clearedCount });
                } catch (error) {
                    this.logger.error('Failed to clear data', error);
                    this.toast.error('Failed to clear data');
                }
            }
        }
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
