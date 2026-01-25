import { ToolbarButtonProvider, ToolbarButton } from 'tabby-core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ExecToolCategory } from './tools/terminal';
import { MinimizedDialogManagerService } from './services/minimizedDialogManager.service';
import { CommandHistoryManagerService } from './services/commandHistoryManager.service';
import { RunningCommandsManagerService } from './services/runningCommandsManager.service';
import { McpHotkeyService } from './services/mcpHotkey.service';
export declare class McpToolbarButtonProvider extends ToolbarButtonProvider {
    private execToolCategory;
    private modal;
    private minimizedDialogManager;
    private commandHistoryManager;
    private runningCommandsManager;
    private mcpHotkeyService;
    private activeCommandsCount;
    private minimizedDialogsCount;
    private commandHistoryCount;
    constructor(execToolCategory: ExecToolCategory, modal: NgbModal, minimizedDialogManager: MinimizedDialogManagerService, commandHistoryManager: CommandHistoryManagerService, runningCommandsManager: RunningCommandsManagerService, mcpHotkeyService: McpHotkeyService);
    provide(): ToolbarButton[];
    private showMinimizedDialogsModal;
    private showCommandHistoryModal;
    private showRunningCommandsModal;
}
