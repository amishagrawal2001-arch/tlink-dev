import { OnInit, OnDestroy } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { CommandHistoryManagerService, CommandHistoryEntry } from '../services/commandHistoryManager.service';
export declare class CommandHistoryModalComponent implements OnInit, OnDestroy {
    private activeModal;
    private historyManager;
    filteredHistory: CommandHistoryEntry[];
    totalHistory: number;
    searchTerm: string;
    filterType: 'all' | 'success' | 'failed' | 'aborted';
    private expandedOutputs;
    private subscription;
    constructor(activeModal: NgbActiveModal, historyManager: CommandHistoryManagerService);
    ngOnInit(): void;
    ngOnDestroy(): void;
    close(): void;
    onSearchChange(): void;
    onFilterChange(): void;
    clearSearch(): void;
    private updateFilteredHistory;
    copyCommand(id: string): Promise<void>;
    copyOutput(id: string): Promise<void>;
    removeEntry(id: string): void;
    clearAllHistory(): void;
    toggleOutputExpanded(id: string): void;
    isOutputExpanded(id: string): boolean;
    getDisplayOutput(entry: CommandHistoryEntry): string;
    getStatusBadgeClass(entry: CommandHistoryEntry): string;
    getStatusIcon(entry: CommandHistoryEntry): string;
    getStatusText(entry: CommandHistoryEntry): string;
    getRelativeTime(timestamp: number): string;
    formatDuration(duration: number): string;
    trackByEntryId(index: number, entry: CommandHistoryEntry): string;
    /**
     * Export commands only (download as file)
     */
    exportCommandsOnly(exportAll: boolean): Promise<void>;
    /**
     * Export commands with output (download as file)
     */
    exportCommandsWithOutput(exportAll: boolean): Promise<void>;
    /**
     * Copy commands only to clipboard
     */
    copyCommandsOnly(): Promise<void>;
    /**
     * Copy commands with output to clipboard
     */
    copyCommandsWithOutput(): Promise<void>;
    /**
     * Export as JSON
     */
    exportAsJSON(exportAll: boolean): Promise<void>;
    /**
     * Export as CSV
     */
    exportAsCSV(exportAll: boolean): Promise<void>;
    /**
     * Export as Markdown
     */
    exportAsMarkdown(exportAll: boolean): Promise<void>;
    /**
     * Copy as JSON
     */
    copyAsJSON(): Promise<void>;
}
