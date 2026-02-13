/// <reference types="node" />
import { Observable, Subject } from 'rxjs';
import { NgZone, OnInit, OnDestroy, Injector, ElementRef } from '@angular/core';
import { AnimationTriggerMetadata } from '@angular/animations';
import { AppService, ConfigService, BaseTabComponent as CoreBaseTabComponent, HostAppService, HotkeysService, NotificationsService, LogService, Logger, TabContextMenuItemProvider, MenuItemOptions, PlatformService, HostWindowService, TranslateService, ThemesService } from 'tlink-core';
import { BaseSession } from '../session';
import { Frontend } from '../frontends/frontend';
import { ResizeEvent, BaseTerminalProfile } from './interfaces';
import { TerminalDecorator } from './decorator';
import { SearchPanelComponent } from '../components/searchPanel.component';
import { MultifocusService } from '../services/multifocus.service';
declare const BaseTabComponentRuntime: typeof CoreBaseTabComponent;
/**
 * A class to base your custom terminal tabs on
 */
export declare class BaseTerminalTabComponent<P extends BaseTerminalProfile> extends BaseTabComponentRuntime implements OnInit, OnDestroy {
    protected injector: Injector;
    static template: string;
    static styles: string[];
    static animations: AnimationTriggerMetadata[];
    session: BaseSession | null;
    savedState?: any;
    savedStateIsLive: boolean;
    zoom: number;
    showSearchPanel: boolean;
    /** @hidden */
    content: any;
    /** @hidden */
    backgroundColor: string | null;
    /** @hidden */
    enableToolbar: boolean;
    /** @hidden */
    pinToolbar: boolean;
    /** @hidden */
    revealToolbar: boolean;
    get showPaneClose(): boolean;
    /**
     * Used by the terminal content itself (top-right) for special panes like the code-editor run terminal.
     */
    get showInPaneClose(): boolean;
    frontend?: Frontend;
    /** @hidden */
    frontendIsReady: boolean;
    frontendReady: Subject<void>;
    size: ResizeEvent;
    profile: P;
    /**
     * Enables normal passthrough from session output to terminal input
     */
    enablePassthrough: boolean;
    /**
     * Disables display of dynamic window/tab title provided by the shell
     */
    disableDynamicTitle: boolean;
    alternateScreenActive: boolean;
    searchPanel?: SearchPanelComponent;
    config: ConfigService;
    element: ElementRef;
    protected zone: NgZone;
    protected app: AppService;
    protected hostApp: HostAppService;
    protected hotkeys: HotkeysService;
    protected platform: PlatformService;
    protected notifications: NotificationsService;
    protected log: LogService;
    protected decorators: TerminalDecorator[];
    protected contextMenuProviders: TabContextMenuItemProvider[];
    protected hostWindow: HostWindowService;
    protected translate: TranslateService;
    protected multifocus: MultifocusService;
    protected themes: ThemesService;
    protected logger: Logger;
    protected output: Subject<string>;
    protected binaryOutput: Subject<Buffer>;
    protected sessionChanged: Subject<BaseSession | null>;
    protected recentInputs: string;
    private bellPlayer;
    private termContainerSubscriptions;
    private sessionHandlers;
    private altScreenSequenceBuffer;
    private spinner;
    private spinnerActive;
    private spinnerPaused;
    private toolbarRevealTimeout;
    private frontendWriteLock;
    private pendingOutput;
    private pendingOutputFrame?;
    private pendingOutputMax;
    private outputHighlightingKey;
    private outputHighlightingRules;
    private isDestroyed;
    get input$(): Observable<Buffer>;
    get output$(): Observable<string>;
    get binaryOutput$(): Observable<Buffer>;
    get resize$(): Observable<ResizeEvent>;
    get alternateScreenActive$(): Observable<boolean>;
    get frontendReady$(): Observable<void>;
    get sessionChanged$(): Observable<BaseSession | null>;
    constructor(injector: Injector);
    /** @hidden */
    ngOnInit(): void;
    protected onFrontendReady(): void;
    buildContextMenu(): Promise<MenuItemOptions[]>;
    /**
     * Feeds input into the active session
     */
    sendInput(data: string | Buffer): void;
    /**
     * Feeds input into the terminal frontend
     */
    write(data: string): Promise<void>;
    private queueOutput;
    private flushPendingOutput;
    protected writeRaw(data: string): Promise<void>;
    paste(): Promise<void>;
    /**
     * Applies the user settings to the terminal
     */
    configure(): void;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    copyCurrentPath(): Promise<void>;
    /** @hidden */
    ngOnDestroy(): void;
    destroy(): Promise<void>;
    protected detachTermContainerHandlers(): void;
    private rightMouseDownTime;
    protected handleRightMouseDown(event: MouseEvent): Promise<void>;
    protected handleRightMouseUp(event: MouseEvent): Promise<void>;
    protected attachTermContainerHandlers(): void;
    setSession(session: BaseSession | null, destroyOnSessionClose?: boolean): void;
    showToolbar(): void;
    hideToolbar(): void;
    togglePinToolbar(): void;
    closePane(): Promise<void>;
    get hasTitleInset(): boolean;
    protected attachSessionHandler<T>(observable: Observable<T>, handler: (v: T) => void): void;
    protected attachSessionHandlers(destroyOnSessionClose?: boolean): void;
    private shouldSkipFrontendFocus;
    private applyOutputHighlightingToData;
    private stripAlternateScreenSequences;
    private stripAnsiSequences;
    /**
     * Method called when session is closed.
     */
    protected onSessionClosed(destroyOnSessionClose?: boolean): void;
    /**
     * Return true if tab should be destroyed on session closed.
     */
    protected shouldTabBeDestroyedOnSessionClose(): boolean;
    /**
     * Method called when session is destroyed. Set the session to null
     */
    protected onSessionDestroyed(): void;
    protected detachSessionHandlers(): void;
    protected startSpinner(text?: string): void;
    protected stopSpinner(): void;
    protected withSpinnerPaused(work: () => any): Promise<void>;
    protected forEachFocusedTerminalPane(cb: (tab: BaseTerminalTabComponent<any>) => void): void;
    /**
     * Return true if the user explicitly exit the session
     */
    protected isSessionExplicitlyTerminated(): boolean;
}
export {};
