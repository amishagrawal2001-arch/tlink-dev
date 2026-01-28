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
        .data-settings {
            padding: 20px;
        }

        .data-settings h3 {
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .description {
            color: var(--text-secondary);
            margin-bottom: 20px;
        }

        .data-location {
            background: var(--background-secondary);
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .info-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
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
            margin-bottom: 20px;
        }

        .data-files h4 {
            margin-bottom: 12px;
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
            margin-bottom: 20px;
        }

        .data-statistics h4 {
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
        }

        .stat-item {
            background: var(--background-secondary);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
        }

        .stat-value {
            display: block;
            font-size: 24px;
            font-weight: bold;
            color: var(--primary);
            margin-bottom: 4px;
        }

        .stat-label {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .data-actions h4 {
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .button-group {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
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
            padding: 6px 12px;
            font-size: 12px;
        }

        .btn-danger.btn-small {
            background: var(--danger);
        }

        .migration-note {
            margin-top: 20px;
            padding: 16px;
            background: #fef3c7;
            border-radius: 8px;
            border-left: 4px solid #f59e0b;
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

    constructor(
        private fileStorage: FileStorageService,
        private memory: Memory,
        private chatHistoryService: ChatHistoryService,
        private checkpointManager: CheckpointManager,
        private configProvider: ConfigProviderService,
        private consentManager: ConsentManagerService,
        private logger: LoggerService,
        private toast: ToastService
    ) {}

    ngOnInit(): void {
        this.loadDataDirectory();
        this.loadDataFiles();
        this.loadStatistics();
        this.checkMigrationStatus();
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
                this.toast.warning('无法打开目录，请在文件管理器中手动打开: ' + this.dataDirectory);
            }
        } catch (error) {
            this.logger.error('Failed to open data directory', error);
            this.toast.error('打开目录失败');
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
            this.toast.error('查看文件失败');
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
        this.toast.success(`已下载文件: ${filename}`);
    }

    /**
     * 删除文件
     */
    deleteFile(file: DataFileInfo): void {
        if (confirm(`确定要删除 ${file.name} 吗？此操作不可恢复。`)) {
            const deleted = this.fileStorage.delete(file.name);
            if (deleted) {
                this.loadDataFiles();
                this.loadStatistics();
                this.toast.success('文件已删除');
                this.logger.info('Data file deleted', { filename: file.name });
            } else {
                this.toast.error('删除文件失败');
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
            this.toast.success('数据导出成功');
            this.logger.info('All data exported');
        } catch (error) {
            this.logger.error('Failed to export data', error);
            this.toast.error('导出数据失败');
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
                            this.toast.success(`成功导入 ${result.imported.length} 个文件`);
                            this.logger.info('Data imported', { imported: result.imported });
                        } else {
                            this.toast.error('导入失败: ' + result.errors.join(', '));
                        }
                    } catch (error) {
                        this.logger.error('Failed to import data', error);
                        this.toast.error('导入数据失败');
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
        if (confirm('确定要从浏览器存储迁移数据到文件存储吗？此操作不会删除原有数据。')) {
            try {
                const migratedFiles = this.fileStorage.migrateFromLocalStorage();
                if (migratedFiles.length > 0) {
                    this.loadDataFiles();
                    this.loadStatistics();
                    this.needsMigration = false;
                    this.toast.success(`成功迁移 ${migratedFiles.length} 个文件`);
                    this.logger.info('Data migrated from localStorage', { files: migratedFiles });
                } else {
                    this.toast.info('没有需要迁移的数据');
                }
            } catch (error) {
                this.logger.error('Failed to migrate data', error);
                this.toast.error('迁移数据失败');
            }
        }
    }

    /**
     * 清除所有数据
     */
    clearAllData(): void {
        if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
            if (confirm('再次确认：清除后将丢失所有聊天记录、记忆和配置。')) {
                try {
                    const clearedCount = this.fileStorage.clearAll();
                    this.loadDataFiles();
                    this.loadStatistics();
                    this.toast.success(`已清除 ${clearedCount} 个数据文件`);
                    this.logger.info('All data cleared', { count: clearedCount });
                } catch (error) {
                    this.logger.error('Failed to clear data', error);
                    this.toast.error('清除数据失败');
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
