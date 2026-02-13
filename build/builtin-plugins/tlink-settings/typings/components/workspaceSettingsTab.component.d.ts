import { Injector } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { WorkspaceService, Workspace, NotificationsService, TranslateService, PlatformService } from 'tlink-core';
declare const BaseTabComponent: any;
export declare class WorkspaceSettingsTabComponent extends BaseTabComponent {
    private workspaceService;
    private notifications;
    private translate;
    private ngbModal;
    private platform;
    workspaces: Workspace[];
    selectedWorkspace: Workspace | null;
    constructor(injector: Injector, workspaceService: WorkspaceService, notifications: NotificationsService, translate: TranslateService, ngbModal: NgbModal, platform: PlatformService);
    loadWorkspaces(): void;
    saveCurrentWorkspace(): Promise<void>;
    loadWorkspace(workspace: Workspace): Promise<void>;
    deleteWorkspace(workspace: Workspace): Promise<void>;
    shareWorkspace(workspace: Workspace): Promise<void>;
    importWorkspaceFromUrl(): Promise<void>;
    exportWorkspace(workspace: Workspace): Promise<void>;
    formatDate(date: Date): string;
}
export {};
