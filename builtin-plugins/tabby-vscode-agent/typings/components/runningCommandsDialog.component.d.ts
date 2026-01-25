import { OnInit, OnDestroy } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { RunningCommandsManagerService, RunningCommand as RunningCommandBase } from '../services/runningCommandsManager.service';
import { ExecToolCategory } from '../tools/terminal';
export interface RunningCommand extends RunningCommandBase {
    duration: string;
}
export declare class RunningCommandsDialogComponent implements OnInit, OnDestroy {
    private activeModal;
    private runningCommandsManager;
    private execToolCategory;
    runningCommands: RunningCommand[];
    private refreshSubscription;
    constructor(activeModal: NgbActiveModal, runningCommandsManager: RunningCommandsManagerService, execToolCategory: ExecToolCategory);
    ngOnInit(): void;
    ngOnDestroy(): void;
    close(): void;
    private refreshRunningCommands;
    private formatDuration;
    getCommandPreview(command: string): string;
    stopCommand(tabId: string): Promise<void>;
    stopAllCommands(): Promise<void>;
}
