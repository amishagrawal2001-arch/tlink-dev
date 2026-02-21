import { Observable, Subject } from 'rxjs';
import { Injector } from '@angular/core';
import { Logger } from '../services/log.service';
export declare enum Platform {
    Linux = "Linux",
    macOS = "macOS",
    Windows = "Windows",
    Web = "Web"
}
/**
 * Provides interaction with the main process
 */
export declare abstract class HostAppService {
    abstract get platform(): Platform;
    abstract get configPlatform(): Platform;
    protected settingsUIRequest: Subject<void>;
    protected commandWindowRequest: Subject<void>;
    protected commandWindowBottomRequest: Subject<void>;
    protected buttonBarToggleRequest: Subject<void>;
    protected sessionManagerRequest: Subject<void>;
    protected sessionLogFileRequest: Subject<void>;
    protected workspaceSaveRequest: Subject<void>;
    protected workspaceLoadRequest: Subject<void>;
    protected workspaceExportRequest: Subject<void>;
    protected workspaceImportRequest: Subject<void>;
    protected aiAssistantRequest: Subject<void>;
    protected openCodeEditorRequest: Subject<void>;
    protected configChangeBroadcast: Subject<void>;
    protected logger: Logger;
    /**
     * Fired when Preferences is selected in the macOS menu
     */
    get settingsUIRequest$(): Observable<void>;
    openSettingsUI(): void;
    /**
     * Fired when Command Window is selected from the menu
     */
    get commandWindowRequest$(): Observable<void>;
    /**
     * Fired when Command Window (Bottom) is selected from the menu
     */
    get commandWindowBottomRequest$(): Observable<void>;
    /**
     * Fired when AI Assistant window should be opened
     */
    get aiAssistantRequest$(): Observable<void>;
    /**
     * Fired when Code Editor should be opened in this window
     */
    get openCodeEditorRequest$(): Observable<void>;
    /**
     * Fired when Button Bar is selected from the menu
     */
    get buttonBarToggleRequest$(): Observable<void>;
    /**
     * Fired when Session Manager is selected from the menu
     */
    get sessionManagerRequest$(): Observable<void>;
    /**
     * Fired when Set session log file is selected from the menu
     */
    get sessionLogFileRequest$(): Observable<void>;
    /**
     * Fired when Save Workspace is selected from the menu
     */
    get workspaceSaveRequest$(): Observable<void>;
    /**
     * Fired when Load Workspace is selected from the menu
     */
    get workspaceLoadRequest$(): Observable<void>;
    /**
     * Fired when Export Workspace is selected from the menu
     */
    get workspaceExportRequest$(): Observable<void>;
    /**
     * Fired when Import Workspace is selected from the menu
     */
    get workspaceImportRequest$(): Observable<void>;
    /**
     * Fired when another window modified the config file
     */
    get configChangeBroadcast$(): Observable<void>;
    constructor(injector: Injector);
    abstract newWindow(): void;
    /**
     * Open/focus a dedicated Code Editor window.
     * Returns true when handled by host implementation.
     */
    openCodeEditorWindow(): boolean;
    emitReady(): void;
    abstract relaunch(): void;
    abstract quit(): void;
}
