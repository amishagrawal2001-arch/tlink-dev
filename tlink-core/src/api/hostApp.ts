import { Observable, Subject } from 'rxjs'
import { Injector } from '@angular/core'
import { Logger, LogService } from '../services/log.service'

export enum Platform {
    Linux = 'Linux',
    macOS = 'macOS',
    Windows = 'Windows',
    Web = 'Web',
}

/**
 * Provides interaction with the main process
 */
export abstract class HostAppService {
    abstract get platform (): Platform
    abstract get configPlatform (): Platform

    protected settingsUIRequest = new Subject<void>()
    protected commandWindowRequest = new Subject<void>()
    protected commandWindowBottomRequest = new Subject<void>()
    protected buttonBarToggleRequest = new Subject<void>()
    protected sessionManagerRequest = new Subject<void>()
    protected aiAssistantRequest = new Subject<void>()
    protected configChangeBroadcast = new Subject<void>()
    protected logger: Logger

    /**
     * Fired when Preferences is selected in the macOS menu
     */
    get settingsUIRequest$ (): Observable<void> { return this.settingsUIRequest }

    openSettingsUI (): void {
        this.settingsUIRequest.next()
    }
    /**
     * Fired when Command Window is selected from the menu
     */
    get commandWindowRequest$ (): Observable<void> { return this.commandWindowRequest }
    /**
     * Fired when Command Window (Bottom) is selected from the menu
     */
    get commandWindowBottomRequest$ (): Observable<void> { return this.commandWindowBottomRequest }
    /**
     * Fired when AI Assistant window should be opened
     */
    get aiAssistantRequest$ (): Observable<void> { return this.aiAssistantRequest }
    /**
     * Fired when Button Bar is selected from the menu
     */
    get buttonBarToggleRequest$ (): Observable<void> { return this.buttonBarToggleRequest }
    /**
     * Fired when Session Manager is selected from the menu
     */
    get sessionManagerRequest$ (): Observable<void> { return this.sessionManagerRequest }

    /**
     * Fired when another window modified the config file
     */
    get configChangeBroadcast$ (): Observable<void> { return this.configChangeBroadcast }

    constructor (
        injector: Injector,
    ) {
        this.logger = injector.get(LogService).create('hostApp')
    }

    abstract newWindow (): void

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    emitReady (): void { }

    abstract relaunch (): void

    abstract quit (): void
}
