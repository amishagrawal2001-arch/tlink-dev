/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Input, HostListener, HostBinding, ViewChildren, ViewChild, Type, OnInit, Inject, Optional } from '@angular/core'
import { trigger, style, animate, transition, state } from '@angular/animations'
import { NgbDropdown, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { CdkDragDrop, CdkDragMove, moveItemInArray } from '@angular/cdk/drag-drop'
import Color from 'color'

import { HostAppService, Platform } from '../api/hostApp'
import { HotkeysService } from '../services/hotkeys.service'
import { TranslateService } from '@ngx-translate/core'
import { Logger, LogService } from '../services/log.service'
import { ConfigService } from '../services/config.service'
import { ThemesService } from '../services/themes.service'
import { UpdaterService } from '../services/updater.service'
import { CommandService } from '../services/commands.service'
import { BackupService } from '../services/backup.service'

import { BaseTabComponent } from './baseTab.component'
import { SafeModeModalComponent } from './safeModeModal.component'
import { ColorPickerModalComponent } from './colorPickerModal.component'
import { ShareSessionModalComponent } from './shareSessionModal.component'
import { TabBodyComponent } from './tabBody.component'
import { SplitTabComponent } from './splitTab.component'
import { AppService, BottomPanelRegistration, BottomPanelService, Command, CommandContext, CommandLocation, FileTransfer, HostWindowService, PlatformService, SidePanelRegistration, SidePanelService, ProfilesService, SelectorService, SelectorOption, PartialProfile, Profile, MenuItemOptions, WorkspaceService, Workspace, NotificationsService, PromptModalComponent, CLIHandler } from '../api'
import { TabsService } from '../services/tabs.service'
import { SessionSharingService } from '../services/sessionSharing.service'
import { CodeEditorTabComponent } from './codeEditorTab.component'
import { TlinkLicenseService } from '../../../tlink-license-client/src/lib/tlink-license.service'

type SplitDirection = 'r' | 'l' | 't' | 'b'
type LeftDockDropTarget = {
    item: string
    insertAfter: boolean
    isGroupDrop: boolean
}
type LeftDockChunk = {
    id: string
    grouped: boolean
    items: string[]
}
type LeftDockPointer = {
    x: number
    y: number
}

function makeTabAnimation (dimension: string, size: number) {
    return [
        state('in', style({
            'flex-basis': '{{size}}',
            [dimension]: '{{size}}',
        }), {
            params: { size: `${size}px` },
        }),
        transition(':enter', [
            style({
                'flex-basis': '1px',
                [dimension]: '1px',
            }),
            animate('250ms ease-out', style({
                'flex-basis': '{{size}}',
                [dimension]: '{{size}}',
            })),
        ]),
        transition(':leave', [
            style({
                'flex-basis': 'auto',
                'padding-left': '*',
                'padding-right': '*',
                [dimension]: '*',
            }),
            animate('250ms ease-in-out', style({
                'padding-left': 0,
                'padding-right': 0,
                [dimension]: '0',
            })),
        ]),
    ]
}

/** @hidden */
@Component({
    selector: 'app-root',
    templateUrl: './appRoot.component.pug',
    styleUrls: ['./appRoot.component.scss'],
    animations: [
        trigger('animateTab', makeTabAnimation('width', 160)),
    ],
})
export class AppRootComponent implements OnInit {
    Platform = Platform
    @Input() ready = false
    @Input() leftToolbarButtons: Command[] = []
    @Input() rightToolbarButtons: Command[] = []
    @HostBinding('class.platform-win32') platformClassWindows = process.platform === 'win32'
    @HostBinding('class.platform-darwin') platformClassMacOS = process.platform === 'darwin'
    @HostBinding('class.platform-linux') platformClassLinux = process.platform === 'linux'
    @HostBinding('class.no-tabs') noTabs = true
    @ViewChildren(TabBodyComponent) tabBodies: TabBodyComponent[]
    @ViewChild('activeTransfersDropdown') activeTransfersDropdown: NgbDropdown
    unsortedTabs: BaseTabComponent[] = []
    updatesAvailable = false
    activeTransfers: FileTransfer[] = []
    transfersFloating = window.localStorage['transfersFloating'] === '1'
    showLicenseActivation = false
    showLicenseAdmin = false
    showServerSettings = false
    sidePanelVisible = false
    sidePanelComponent: Type<any> | null = null
    sidePanelWidth = 240
    sidePanelId = ''
    sidePanels: SidePanelRegistration[] = []
    rightDockPanels: SidePanelRegistration[] = []
    leftDockOrder: string[] = []
    leftDockVisibleOrder: string[] = []
    leftDockGroupedItems: string[] = []
    leftDockGroups: string[][] = []
    leftDockChunks: LeftDockChunk[] = []
    sshSidePanel: SidePanelRegistration | null = null
    sshSidebarCommand: Command | null = null
    intellijEditorCommand: Command | null = null
    tabbyUrlCommand: Command | null = null
    bottomPanelVisible = false
    bottomPanelComponent: Type<any> | null = null
    bottomPanelHeight = 0
    bottomPanelId = ''
    bottomPanelInputs: Record<string, any> = {}
    bottomPanels: BottomPanelRegistration[] = []
    private bottomPanelResizing = false
    private bottomPanelResizeStartY = 0
    private bottomPanelResizeStartHeight = 0
    private sidePanelResizing = false
    private sidePanelResizeStartX = 0
    private sidePanelResizeStartWidth = 0
    private sidePanelColorPickerOpen = false
    private leftDockDragHoverTarget: LeftDockDropTarget | null = null
    leftDockDropPreviewItem: string | null = null
    private logger: Logger
    private readonly defaultLeftDockOrder = [
        'websocket',
        'share-all-sessions',
        'open-shared-session-link',
        'profiles',
        'session-manager',
        // 'code-editor',  // Tlink Studio - deactivated
        'remote-desktop',
        'sftp',
        'ssh',
        'ai-chat',
        'copilot-chat',
        'intellij-editor',
        'ai-assistant',
        'tabby-url',
    ]
    private readonly legacyDefaultLeftDockOrder = [
        'profiles',
        'sftp',
        'session-manager',
        'remote-desktop',
        'ssh',
        // 'code-editor',  // Tlink Studio - deactivated
        'intellij-editor',
        'ai-chat',
        'ai-assistant',
        'tabby-url',
        'copilot-chat',
        'share-all-sessions',
        'websocket',
        'open-shared-session-link',
    ]
    private readonly defaultLeftDockGroup = [
        'websocket',
        'share-all-sessions',
        'open-shared-session-link',
        'profiles',
        'session-manager',
        // 'code-editor',  // Tlink Studio - deactivated
        'remote-desktop',
        'sftp',
        'ssh',
    ]
    private readonly legacyDefaultLeftDockGroup = [
        'profiles',
        'ai-assistant',
        'tabby-url',
    ]

    constructor (
        private hotkeys: HotkeysService,
        private commands: CommandService,
        public updater: UpdaterService,
        public hostWindow: HostWindowService,
        public hostApp: HostAppService,
        public config: ConfigService,
        public app: AppService,
        private translate: TranslateService,
        private tabsService: TabsService,
        private sidePanel: SidePanelService,
        private bottomPanel: BottomPanelService,
        private platform: PlatformService,
        private profiles: ProfilesService,
        private selector: SelectorService,
        private workspaceService: WorkspaceService,
        private notifications: NotificationsService,
        private sessionSharing: SessionSharingService,
        @Inject(CLIHandler) @Optional() private cliHandlers: CLIHandler[] = [],
        public licenseSvc: TlinkLicenseService,
        log: LogService,
        private ngbModal: NgbModal,
        _themes: ThemesService,
        _backup: BackupService,
    ) {
        // document.querySelector('app-root')?.remove()
        this.logger = log.create('main')
        this.logger.info('v', platform.getAppVersion())

        this.hotkeys.hotkey$.subscribe((hotkey: string) => {
            if (hotkey.startsWith('tab-')) {
                const index = parseInt(hotkey.split('-')[1])
                if (index <= this.app.tabs.length) {
                    this.app.selectTab(this.app.tabs[index - 1])
                }
            }
            if (this.app.activeTab) {
                if (hotkey === 'close-tab') {
                    this.app.closeTab(this.app.activeTab, true)
                }
                if (hotkey === 'toggle-last-tab') {
                    this.app.toggleLastTab()
                }
                if (hotkey === 'next-tab') {
                    this.app.nextTab()
                }
                if (hotkey === 'previous-tab') {
                    this.app.previousTab()
                }
                if (hotkey === 'move-tab-left') {
                    this.app.moveSelectedTabLeft()
                }
                if (hotkey === 'move-tab-right') {
                    this.app.moveSelectedTabRight()
                }
                if (hotkey === 'duplicate-tab') {
                    this.app.duplicateTab(this.app.activeTab)
                }
                if (hotkey === 'restart-tab') {
                    this.app.duplicateTab(this.app.activeTab)
                    this.app.closeTab(this.app.activeTab, true)
                }
                if (hotkey === 'explode-tab' && this.app.activeTab instanceof SplitTabComponent) {
                    this.app.explodeTab(this.app.activeTab)
                }
                if (hotkey === 'combine-tabs' && this.app.activeTab instanceof SplitTabComponent) {
                    this.app.combineTabsInto(this.app.activeTab)
                }
            }
            if (hotkey === 'reopen-tab') {
                this.app.reopenLastTab()
            }
            if (hotkey === 'toggle-fullscreen') {
                hostWindow.toggleFullscreen()
            }
            if (hotkey === 'cycle-color-scheme') {
                this.cycleColorSchemeMode()
            }
        })

        this.hostWindow.windowCloseRequest$.subscribe(async () => {
            this.app.closeWindow()
        })
        this.hostApp.workspaceSaveRequest$.subscribe(() => {
            void this.saveWorkspaceFromMenu()
        })
        this.hostApp.workspaceLoadRequest$.subscribe(() => {
            void this.loadWorkspaceFromMenu()
        })
        this.hostApp.workspaceExportRequest$.subscribe(() => {
            void this.exportWorkspaceFromMenu()
        })
        this.hostApp.workspaceImportRequest$.subscribe(() => {
            void this.importWorkspaceFromMenu()
        })
        this.hostApp.openCodeEditorRequest$.subscribe(() => {
            const existing = this.app.tabs.find(tab => tab instanceof CodeEditorTabComponent)
            if (existing) {
                this.app.selectTab(existing)
                return
            }
            this.app.openNewTab({ type: CodeEditorTabComponent })
        })

        if (window['safeModeReason']) {
            this.ngbModal.open(SafeModeModalComponent)
        }

        this.app.tabOpened$.subscribe(tab => {
            this.unsortedTabs.push(tab)
            this.noTabs = false
            this.app.emitTabDragEnded()
        })

        this.app.tabRemoved$.subscribe(tab => {
            for (const tabBody of this.tabBodies) {
                if (tabBody.tab === tab) {
                    tabBody.detach()
                }
            }
            this.unsortedTabs = this.unsortedTabs.filter(x => x !== tab)
            this.noTabs = app.tabs.length === 0
            this.app.emitTabDragEnded()
        })

        platform.fileTransferStarted$.subscribe(transfer => {
            this.activeTransfers.push(transfer)
            this.activeTransfersDropdown?.open()
        })

        this.sidePanel.state$.subscribe(state => {
            this.sidePanelVisible = state.visible
            this.sidePanelComponent = state.component
            this.sidePanelWidth = state.width
            this.sidePanelId = state.id
        })
        this.sidePanel.panels$.subscribe(panels => {
            this.sidePanels = panels.slice().sort((a, b) => a.label.localeCompare(b.label))
            this.rightDockPanels = this.orderSidePanels(this.sidePanels)
            this.sshSidePanel = this.sidePanels.find(panel =>
                panel.id?.toLowerCase().includes('ssh') || panel.label?.toLowerCase().includes('ssh'),
            ) ?? null
            this.refreshLeftDockOrder()
        })
        this.bottomPanel.state$.subscribe(state => {
            this.bottomPanelVisible = state.visible
            this.bottomPanelComponent = state.component
            this.bottomPanelHeight = state.height
            this.bottomPanelId = state.id
            this.bottomPanelInputs = state.inputs ?? {}
        })
        this.bottomPanel.panels$.subscribe(panels => {
            this.bottomPanels = panels
        })

        config.ready$.toPromise().then(async () => {
            try {
                this.leftToolbarButtons = await this.getToolbarButtons(false)
                this.rightToolbarButtons = await this.getToolbarButtons(true)
            } catch (error: any) {
                this.logger.warn('Failed to load toolbar buttons', error?.message ?? error)
                this.leftToolbarButtons = this.leftToolbarButtons ?? []
                this.rightToolbarButtons = this.rightToolbarButtons ?? []
            }
            this.refreshLeftDockOrder()

            setInterval(() => {
                if (this.config.store.enableAutomaticUpdates) {
                    this.updater.check().then(available => {
                        this.updatesAvailable = available
                    })
                }
            }, 3600 * 12 * 1000)
        })
    }

    get canSplitShortcut (): boolean {
        return !!this.app.activeTab
    }

    get canOpenCommandWindow (): boolean {
        return this.bottomPanels.some(panel => panel.id === 'command-window')
    }

    get isCommandWindowOpen (): boolean {
        return this.bottomPanelVisible && this.bottomPanelId === 'command-window'
    }

    get isButtonBarEnabled (): boolean {
        return !!this.config.store.terminal?.buttonBar?.enabled
    }

    toggleButtonBar (): void {
        if (!this.config.store.terminal) {
            this.config.store.terminal = {}
        }
        if (!this.config.store.terminal.buttonBar) {
            this.config.store.terminal.buttonBar = {}
        }
        this.config.store.terminal.buttonBar.enabled = !this.config.store.terminal.buttonBar.enabled
        this.config.save()
    }

    openAPIClient (): void {
        this.profiles.openNewTabForProfile({
            type: 'api-client',
            name: 'API Client',
            options: {
                url: 'https://httpbin.org/get',
                method: 'GET',
                headers: [],
                body: '',
                bodyType: 'none',
                timeout: 30000,
                auth: { type: 'none' },
            },
        } as any)
    }

    openHelpGuide (): void {
        try {
            const electron = require('electron')
            const ipcRenderer = electron.ipcRenderer
            if (ipcRenderer) {
                ipcRenderer.send('open-help-window')
            }
        } catch {
            // Fallback for web
            this.platform.openExternal('https://github.com/amishagrawal2001-arch/tlink-dev/wiki')
        }
    }

    openSettingsFromDock (): void {
        this.hostApp.openSettingsUI()
    }

    openProfilesAndConnections (): void {
        try {
            const { SettingsTabComponent } = window['nodeRequire']('tlink-settings')
            const existing = this.app.tabs.find(tab => tab instanceof SettingsTabComponent)
            if (existing) {
                this.app.selectTab(existing)
                ;(existing as any).activeTab = 'profiles'
                return
            }
            this.app.openNewTabRaw({
                type: SettingsTabComponent as any,
                inputs: { activeTab: 'profiles' },
            })
        } catch {
            this.hostApp.openSettingsUI()
        }
    }

    cycleColorSchemeFromDock (): void {
        this.cycleColorSchemeMode()
    }

    openSSHSidePanel (): void {
        if (this.sshSidePanel) {
            this.toggleSidePanel(this.sshSidePanel)
            return
        }
        if (this.sshSidebarCommand?.run) {
            this.sshSidebarCommand.run()
            return
        }
        if (this.sshSidebarCommand?.id) {
            this.commands.run(this.sshSidebarCommand.id, this.buildCommandContext())
        }
    }

    get shouldShowBottomPanel (): boolean {
        if (this.isCodeEditorOnlyWindow) {
            return false
        }
        if (!this.bottomPanelVisible || !this.bottomPanelComponent) {
            return false
        }
        if (this.bottomPanelId === 'command-window' && this.isChatTabActive) {
            return false
        }
        return true
    }

    get isCodeEditorOnlyWindow (): boolean {
        return !!(window as any).__codeEditorFullWindowMode
    }

    toggleCommandWindowBottom (): void {
        const panel = this.bottomPanels.find(p => p.id === 'command-window')
        if (!panel) {
            return
        }
        this.bottomPanel.toggle(panel)
    }

    get isChatTabActive (): boolean {
        const active = this.getActiveLeafTab()
        return (active?.constructor?.name ?? '') === 'ChatTabComponent'
    }

    async splitActiveTabShortcut (direction: SplitDirection = 'r'): Promise<void> {
        const active = this.app.activeTab
        if (!active) {
            return
        }
        if (active instanceof CodeEditorTabComponent) {
            active.toggleSplitView()
            return
        }
        if (active instanceof SplitTabComponent) {
            const focused = active.getFocusedTab()
            if (focused instanceof CodeEditorTabComponent) {
                focused.toggleSplitView()
                return
            }
        }

        if (active instanceof SplitTabComponent) {
            const focused = active.getFocusedTab()
            if (!focused) {
                return
            }
            const created = await active.splitTab(focused, direction)
            if (created) {
                active.focus(created)
            }
            return
        }

        const parentSplit = this.app.getParentTab(active)
        if (parentSplit) {
            const created = await parentSplit.splitTab(active, direction)
            if (created) {
                parentSplit.focus(created)
            }
            return
        }

        const duplicate = await this.tabsService.duplicate(active)
        const split = this.tabsService.create({ type: SplitTabComponent })
        const tabIndex = this.app.tabs.indexOf(active)
        const unsortedIndex = this.unsortedTabs.indexOf(active)

        this.app.addTabRaw(split, tabIndex === -1 ? null : tabIndex)

        await split.addTab(active, null, direction)
        if (duplicate) {
            await split.addTab(duplicate, active, direction)
        }

        const activeIndex = this.app.tabs.indexOf(active)
        if (activeIndex !== -1) {
            this.app.tabs.splice(activeIndex, 1)
        }
        if (unsortedIndex !== -1) {
            this.unsortedTabs.splice(unsortedIndex, 1)
            const splitIndex = this.unsortedTabs.indexOf(split)
            if (splitIndex !== -1 && splitIndex !== unsortedIndex) {
                this.unsortedTabs.splice(unsortedIndex, 0, this.unsortedTabs.splice(splitIndex, 1)[0])
            }
        }
        this.app.emitTabsChanged()
        split.focus(duplicate ?? active)
    }

    openSplitShortcutMenu (event: MouseEvent): void {
        if (!this.canSplitShortcut) {
            return
        }

        event.preventDefault()
        event.stopPropagation()

        const items = [
            {
                label: this.translate.instant('Split right'),
                click: () => { void this.splitActiveTabShortcut('r') },
            },
            {
                label: this.translate.instant('Split left'),
                click: () => { void this.splitActiveTabShortcut('l') },
            },
            {
                label: this.translate.instant('Split down'),
                click: () => { void this.splitActiveTabShortcut('b') },
            },
            {
                label: this.translate.instant('Split up'),
                click: () => { void this.splitActiveTabShortcut('t') },
            },
        ]

        this.platform.popupContextMenu(items, event)
    }

    onBottomResizeStart (event: MouseEvent | TouchEvent): void {
        event.preventDefault()
        event.stopPropagation()
        const clientY = event instanceof TouchEvent ? event.touches[0].clientY : event.clientY
        this.bottomPanelResizing = true
        this.bottomPanelResizeStartY = clientY
        this.bottomPanelResizeStartHeight = this.bottomPanelHeight
    }

    onSidePanelResizeStart (event: MouseEvent | TouchEvent): void {
        event.preventDefault()
        event.stopPropagation()
        const clientX = event instanceof TouchEvent ? event.touches[0].clientX : event.clientX
        this.sidePanelResizing = true
        this.sidePanelResizeStartX = clientX
        this.sidePanelResizeStartWidth = this.sidePanelWidth
    }

    @HostListener('window:mousemove', ['$event'])
    onResizeMove (event: MouseEvent): void {
        if (this.bottomPanelResizing) {
            const delta = this.bottomPanelResizeStartY - event.clientY
            const next = this.clampBottomPanelHeight(this.bottomPanelResizeStartHeight + delta)
            this.bottomPanelHeight = next
            this.bottomPanel.setHeight(next)
        }
        if (this.sidePanelResizing) {
            const delta = this.sidePanelResizeStartX - event.clientX
            const next = this.clampSidePanelWidth(this.sidePanelResizeStartWidth + delta)
            this.sidePanelWidth = next
            this.sidePanel.setWidth(next)
        }
    }

    @HostListener('window:mouseup')
    onResizeEnd (): void {
        this.bottomPanelResizing = false
        this.sidePanelResizing = false
    }

    @HostListener('window:touchmove', ['$event'])
    onResizeMoveTouch (event: TouchEvent): void {
        if (!event.touches.length) {
            return
        }
        if (this.bottomPanelResizing) {
            const delta = this.bottomPanelResizeStartY - event.touches[0].clientY
            const next = this.clampBottomPanelHeight(this.bottomPanelResizeStartHeight + delta)
            this.bottomPanelHeight = next
            this.bottomPanel.setHeight(next)
        }
        if (this.sidePanelResizing) {
            const delta = this.sidePanelResizeStartX - event.touches[0].clientX
            const next = this.clampSidePanelWidth(this.sidePanelResizeStartWidth + delta)
            this.sidePanelWidth = next
            this.sidePanel.setWidth(next)
        }
    }

    @HostListener('window:touchend')
    onResizeEndTouch (): void {
        this.bottomPanelResizing = false
        this.sidePanelResizing = false
    }

    private clampBottomPanelHeight (value: number): number {
        const min = 160
        const max = Math.max(window.innerHeight - 120, min)
        return Math.min(Math.max(value, min), max)
    }

    private clampSidePanelWidth (value: number): number {
        const min = 240
        const max = Math.max(window.innerWidth - 320, min)
        return Math.min(Math.max(value, min), max)
    }

    private getActiveLeafTab (): BaseTabComponent | null {
        const active = this.app.activeTab
        if (!active) {
            return null
        }
        if (active instanceof SplitTabComponent) {
            return active.getFocusedTab() ?? active
        }
        return active
    }

    private cycleColorSchemeMode (): void {
        const order: Array<'auto'|'dark'|'light'> = ['auto', 'dark', 'light']
        const labels: Record<string, string> = { auto: 'From System', dark: 'Dark Mode', light: 'Light Mode' }
        const current = this.config.store.appearance.colorSchemeMode as 'auto'|'dark'|'light'|undefined
        const currentIndex = Math.max(0, order.indexOf(current ?? 'dark'))
        const next = order[(currentIndex + 1) % order.length]
        this.config.store.appearance.colorSchemeMode = next
        this.config.save()
        this.notifications.notice(labels[next] ?? next)
    }

    async ngOnInit () {
        this.config.ready$.toPromise().then(() => {
            this.ready = true
            this.app.emitReady()

            // Check license on first launch
            setTimeout(() => {
                const status = this.licenseSvc.checkLicense()
                if (status === 'expired' || status === 'invalid') {
                    this.showLicenseActivation = true
                } else if (!localStorage.getItem('tlink_trial_start') && !localStorage.getItem('tlink_license_key')) {
                    this.showLicenseActivation = true
                }
            }, 2500)

            this.licenseSvc.licenseInfo$.subscribe(() => {
                setTimeout(() => {
                    this.showLicenseActivation = this.licenseSvc.licenseStatus === 'expired' || this.licenseSvc.licenseStatus === 'invalid'
                }, 0)
            })
        })

        // Check initial WebSocket server status
        await this.checkWebSocketServerStatus()

        // Listen for server status changes from main process
        if (this.isElectron()) {
            const ipcRenderer = this.getIpcRenderer()
            if (ipcRenderer) {
                ipcRenderer.on('session-sharing:server-status-changed', (_event: any, status: any) => {
                    this.websocketServerRunning = status.isRunning
                    this.websocketServerPort = status.port || 0
                })
            }
        }

        // Backup service will auto-initialize when config is ready
        // No need to manually start it here as it's handled in the constructor
    }

    @HostListener('document:keydown', ['$event'])
    onLicenseKeydown (ev: KeyboardEvent) {
        if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key === 'L') {
            ev.preventDefault()
            this.showLicenseAdmin = !this.showLicenseAdmin
        }
    }

    openBuyLicense () {
        window.open('https://tlink.io/buy', '_blank')
    }

    @HostListener('dragover')
    onDragOver () {
        return false
    }

    @HostListener('drop')
    onDrop () {
        return false
    }

    hasVerticalTabs () {
        return this.config.store.appearance.tabsLocation === 'left' || this.config.store.appearance.tabsLocation === 'right'
    }

    get targetTabSize (): any {
        if (this.hasVerticalTabs()) {
            return '*'
        }
        return this.config.store.appearance.flexTabs ? '*' : '160px'
    }

    onTabsReordered (event: CdkDragDrop<BaseTabComponent[]>) {
        const tab: BaseTabComponent = event.item.data
        if (!this.app.tabs.includes(tab)) {
            if (tab.parent instanceof SplitTabComponent) {
                tab.parent.removeTab(tab)
                this.app.wrapAndAddTab(tab)
            }
        }
        moveItemInArray(this.app.tabs, event.previousIndex, event.currentIndex)
        this.app.emitTabsChanged()
    }

    onRightDockReordered (event: CdkDragDrop<SidePanelRegistration[]>) {
        moveItemInArray(this.rightDockPanels, event.previousIndex, event.currentIndex)
        this.config.store.appearance.sidePanelOrder = this.rightDockPanels.map(panel => panel.id)
    }

    onLeftDockReordered (event: CdkDragDrop<string[]>): void {
        if (!this.leftDockVisibleOrder.length) {
            return
        }
        const draggedItem = event.item.data as string
        const wasGrouped = this.isLeftDockItemGrouped(draggedItem)
        const hoverTarget = this.leftDockDragHoverTarget
        this.leftDockDragHoverTarget = null
        this.leftDockDropPreviewItem = null
        const dropTarget = (hoverTarget && hoverTarget.item !== draggedItem)
            ? hoverTarget
            : this.resolveLeftDockDropTarget(event)
        if (dropTarget?.isGroupDrop && dropTarget.item !== draggedItem) {
            this.applyLeftDockGroupedDrop(draggedItem, dropTarget.item, dropTarget.insertAfter)
            return
        }
        moveItemInArray(this.leftDockVisibleOrder, event.previousIndex, event.currentIndex)
        const nextOrder = this.mergeLeftDockOrder(this.leftDockVisibleOrder)
        this.leftDockOrder = nextOrder
        this.leftDockVisibleOrder = this.leftDockOrder.filter(id => this.isLeftDockItemVisible(id))
        this.config.store.appearance.leftDockOrder = nextOrder
        if (wasGrouped) {
            // Explicit non-group drop from a grouped icon means remove it from its group.
            const groupsWithoutDragged = this.leftDockGroups
                .map(group => group.filter(item => item !== draggedItem))
                .filter(group => group.length > 0)
            this.setLeftDockGroups(this.reconcileLeftDockGroupsAfterReorder(groupsWithoutDragged), false)
        } else {
            // Keep existing groups stable when reordering non-grouped icons.
            this.setLeftDockGroups(this.leftDockGroups, false)
        }
        void this.config.save()
        this.refreshLeftDockChunks()
    }

    onLeftDockItemDragStarted (_draggedItem: string): void {
        this.leftDockDragHoverTarget = null
        this.leftDockDropPreviewItem = null
    }

    onLeftDockItemDragEnded (): void {
        this.leftDockDropPreviewItem = null
    }

    onLeftDockItemDragMoved (draggedItem: string, event: CdkDragMove<string>): void {
        const target = this.resolveLeftDockDropTargetFromPointer(event.pointerPosition, draggedItem)
        if (!target) {
            this.leftDockDragHoverTarget = null
            this.leftDockDropPreviewItem = null
            return
        }
        this.leftDockDragHoverTarget = target
        this.leftDockDropPreviewItem = target.isGroupDrop ? target.item : null
    }

    onTransfersChange () {
        if (this.activeTransfers.length === 0) {
            this.activeTransfersDropdown?.close()
        }
    }

    onTransfersFloatingChange (floating: boolean): void {
        this.transfersFloating = floating
        if (this.activeTransfers.length) {
            setTimeout(() => this.activeTransfersDropdown?.open())
        }
    }

    @HostBinding('class.vibrant') get isVibrant () {
        return this.config.store?.appearance.vibrancy
    }

    private async getToolbarButtons (aboveZero: boolean): Promise<Command[]> {
        const all = await this.commands.getCommands(this.buildCommandContext())
        const sshCmd = all.find(x => x.label?.toLowerCase().includes('toggle ssh connections sidebar'))
        if (sshCmd) {
            this.sshSidebarCommand = sshCmd
        }
        this.intellijEditorCommand = all.find(x => x.id === 'intellij-bridge:open-editor') ?? null
        this.tabbyUrlCommand = all.find(x => x.label?.toLowerCase().includes('open tabby url')) ?? null

        const buttons = all
            .filter(x => x.locations?.includes(aboveZero ? CommandLocation.RightToolbar : CommandLocation.LeftToolbar))
            .filter(x => !x.label?.toLowerCase().includes('toggle ssh connections sidebar'))
            .filter(x => !x.label?.toLowerCase().includes('ai assistant')) // Filter AI Assistant from toolbar (only in dock)
            .filter(x => !x.label?.toLowerCase().includes('open copilot')) // Filter Open Copilot Chat from toolbar (only in dock)
            .filter(x => !x.label?.toLowerCase().includes('open tabby url')) // Filter Open Tabby URL from toolbar (only in dock)

        if (!aboveZero) {
            return buttons
        }
        const settingsLabel = this.translate.instant('Settings')
        // Note: core:cycle-color-scheme is now shown in right toolbar (moved from left dock)
        return buttons.filter(button => button.label !== settingsLabel)
    }

    private buildLeftDockOrder (): string[] {
        const saved = (this.config.store?.appearance?.leftDockOrder as string[] | undefined) ?? []
        const known = new Set(this.defaultLeftDockOrder)
        const cleaned = saved.filter(id => known.has(id))
        if (this.isLegacyDefaultOrder(cleaned)) {
            cleaned.splice(0, cleaned.length, ...this.defaultLeftDockOrder)
        }
        for (const id of this.defaultLeftDockOrder) {
            if (!cleaned.includes(id)) {
                if (id === 'open-shared-session-link') {
                    const shareAllIndex = cleaned.indexOf('share-all-sessions')
                    if (shareAllIndex >= 0) {
                        cleaned.splice(shareAllIndex + 1, 0, id)
                        continue
                    }
                    const websocketIndex = cleaned.indexOf('websocket')
                    if (websocketIndex >= 0) {
                        cleaned.splice(websocketIndex + 1, 0, id)
                        continue
                    }
                }
                cleaned.push(id)
            }
        }
        return cleaned
    }

    private mergeLeftDockOrder (visibleOrder: string[]): string[] {
        const merged: string[] = []
        const seen = new Set<string>()
        for (const id of visibleOrder) {
            if (!seen.has(id)) {
                merged.push(id)
                seen.add(id)
            }
        }
        const existing = this.leftDockOrder.length ? this.leftDockOrder : this.defaultLeftDockOrder
        for (const id of existing) {
            if (!seen.has(id)) {
                merged.push(id)
                seen.add(id)
            }
        }
        for (const id of this.defaultLeftDockOrder) {
            if (!seen.has(id)) {
                merged.push(id)
                seen.add(id)
            }
        }
        return merged
    }

    private refreshLeftDockOrder (): void {
        this.leftDockOrder = this.buildLeftDockOrder()
        this.leftDockVisibleOrder = this.leftDockOrder.filter(id => this.isLeftDockItemVisible(id))
        this.setLeftDockGroups(this.buildLeftDockGroups(), false)
        this.setLeftDockGroups(this.reconcileLeftDockGroupsAfterReorder(this.leftDockGroups), false)
        this.refreshLeftDockChunks()
    }

    private refreshLeftDockChunks (): void {
        const groupIndexByItem = new Map<string, number>()
        this.leftDockGroups.forEach((group, index) => {
            for (const item of group) {
                groupIndexByItem.set(item, index)
            }
        })

        const chunks: LeftDockChunk[] = []
        const emittedGroups = new Set<number>()
        for (const current of this.leftDockVisibleOrder) {
            const groupIndex = groupIndexByItem.get(current)
            if (groupIndex === undefined) {
                chunks.push({
                    id: `single:${current}`,
                    grouped: false,
                    items: [current],
                })
                continue
            }
            if (emittedGroups.has(groupIndex)) {
                continue
            }
            emittedGroups.add(groupIndex)
            const groupItemsSet = new Set(this.leftDockGroups[groupIndex])
            const items = this.leftDockVisibleOrder.filter(item => groupItemsSet.has(item))
            if (items.length < 2) {
                chunks.push({
                    id: `single:${current}`,
                    grouped: false,
                    items: [current],
                })
                continue
            }
            chunks.push({
                id: `group:${groupIndex}:${items.join('|')}`,
                grouped: true,
                items,
            })
        }
        this.leftDockChunks = chunks
    }

    trackByLeftDockItem (_index: number, item: string): string {
        return item
    }

    trackByLeftDockChunk (_index: number, chunk: LeftDockChunk): string {
        return chunk.id
    }

    isLeftDockItemGrouped (item: string): boolean {
        return this.leftDockGroupedItems.includes(item)
    }

    isLeftDockItemGroupStart (index: number): boolean {
        const item = this.leftDockVisibleOrder[index]
        if (!item || !this.isLeftDockItemGrouped(item)) {
            return false
        }
        const prev = this.leftDockVisibleOrder[index - 1]
        return !prev || !this.isLeftDockItemGrouped(prev)
    }

    isLeftDockItemGroupEnd (index: number): boolean {
        const item = this.leftDockVisibleOrder[index]
        if (!item || !this.isLeftDockItemGrouped(item)) {
            return false
        }
        const next = this.leftDockVisibleOrder[index + 1]
        return !next || !this.isLeftDockItemGrouped(next)
    }

    openLeftDockItemMenu (event: MouseEvent, item: string): void {
        event.preventDefault()
        event.stopPropagation()
        const grouped = this.isLeftDockItemGrouped(item)
        if (!grouped) {
            return
        }
        const items: MenuItemOptions[] = [
            {
                label: 'Remove from group',
                click: () => this.removeLeftDockItemFromGroup(item),
            },
        ]
        this.platform.popupContextMenu(items, event)
    }

    private removeLeftDockItemFromGroup (item: string): void {
        const nextGroups = this.leftDockGroups
            .map(group => group.filter(id => id !== item))
            .filter(group => group.length > 0)
        this.setLeftDockGroups(this.reconcileLeftDockGroupsAfterReorder(nextGroups), false)
        this.refreshLeftDockChunks()
        void this.config.save()
    }

    private buildLeftDockGroups (): string[][] {
        const groupsValue = this.config.store?.appearance?.leftDockGroups as string[][] | undefined
        const legacyValue = this.config.store?.appearance?.leftDockGroup as string[] | undefined
        let rawGroups: string[][]
        if (Array.isArray(groupsValue) && groupsValue.length) {
            rawGroups = groupsValue
        } else if (Array.isArray(legacyValue) && legacyValue.length) {
            rawGroups = [legacyValue]
        } else {
            rawGroups = [this.defaultLeftDockGroup]
        }
        if (this.isLegacyDefaultGroups(rawGroups)) {
            rawGroups = [this.defaultLeftDockGroup]
        }
        return this.normalizeLeftDockGroups(rawGroups)
    }

    private isLegacyDefaultOrder (order: string[]): boolean {
        if (order.length !== this.legacyDefaultLeftDockOrder.length) {
            return false
        }
        return order.every((item, index) => item === this.legacyDefaultLeftDockOrder[index])
    }

    private isLegacyDefaultGroups (groups: string[][]): boolean {
        if (groups.length !== 1) {
            return false
        }
        const [group] = groups
        if (!Array.isArray(group) || group.length !== this.legacyDefaultLeftDockGroup.length) {
            return false
        }
        return group.every((item, index) => item === this.legacyDefaultLeftDockGroup[index])
    }

    private flattenLeftDockGroups (groups: string[][]): string[] {
        const flattened: string[] = []
        for (const group of groups) {
            for (const item of group) {
                flattened.push(item)
            }
        }
        return flattened
    }

    private normalizeLeftDockGroups (groups: string[][]): string[][] {
        const known = new Set(this.defaultLeftDockOrder)
        const order = this.leftDockOrder.length ? this.leftDockOrder : this.defaultLeftDockOrder
        const indexMap = new Map(order.map((id, idx) => [id, idx]))
        const seen = new Set<string>()
        const normalized: string[][] = []

        for (const group of groups) {
            if (!Array.isArray(group)) {
                continue
            }
            const cleaned: string[] = []
            for (const item of group) {
                if (!known.has(item) || seen.has(item)) {
                    continue
                }
                cleaned.push(item)
                seen.add(item)
            }
            cleaned.sort((a, b) => (indexMap.get(a) ?? Number.MAX_SAFE_INTEGER) - (indexMap.get(b) ?? Number.MAX_SAFE_INTEGER))
            // A single icon should not be treated as a group.
            if (cleaned.length >= 2) {
                normalized.push(cleaned)
            }
        }

        normalized.sort((a, b) => {
            const aMin = Math.min(...a.map(item => indexMap.get(item) ?? Number.MAX_SAFE_INTEGER))
            const bMin = Math.min(...b.map(item => indexMap.get(item) ?? Number.MAX_SAFE_INTEGER))
            return aMin - bMin
        })

        return normalized
    }

    private setLeftDockGroups (groups: string[][], save = true): void {
        const normalized = this.normalizeLeftDockGroups(groups)
        this.leftDockGroups = normalized
        this.leftDockGroupedItems = this.flattenLeftDockGroups(normalized)
        const appearance = this.config.store?.appearance
        if (!appearance) {
            return
        }
        appearance.leftDockGroups = normalized
        // Legacy flat list retained for compatibility with older config consumers.
        appearance.leftDockGroup = [...this.leftDockGroupedItems]
        if (save && this.config.store) {
            void this.config.save()
        }
    }

    private reconcileLeftDockGroupsAfterReorder (groups: string[][]): string[][] {
        // Keep group membership stable across reorder operations.
        // Group membership should only change via explicit drag-to-group or remove-from-group actions.
        return this.normalizeLeftDockGroups(groups)
    }

    private resolveLeftDockDropTarget (event: CdkDragDrop<string[]>): LeftDockDropTarget | null {
        const pointer = this.resolveLeftDockPointer(event)
        if (!pointer) {
            return null
        }
        return this.resolveLeftDockDropTargetFromPointer(pointer, event.item.data as string)
    }

    private resolveLeftDockDropTargetFromPointer (pointer: LeftDockPointer, draggedItem?: string): LeftDockDropTarget | null {
        const leftDockSection = document.querySelector('.left-dock .left-dock-section') as HTMLElement | null
        if (!leftDockSection) {
            return null
        }
        const sectionRect = leftDockSection.getBoundingClientRect()
        if (
            pointer.x < sectionRect.left ||
            pointer.x > sectionRect.right ||
            pointer.y < sectionRect.top ||
            pointer.y > sectionRect.bottom
        ) {
            return null
        }

        const dockButtons = Array.from(leftDockSection.querySelectorAll('[data-left-dock-item]')) as HTMLElement[]
        const candidateButtons = dockButtons.filter(button => {
            const item = button.dataset?.leftDockItem
            if (!item || !this.leftDockVisibleOrder.includes(item)) {
                return false
            }
            if (draggedItem && item === draggedItem) {
                return false
            }
            return !button.closest('.cdk-drag-preview') && !button.closest('.cdk-drag-placeholder')
        })
        if (!candidateButtons.length) {
            return null
        }

        const elementsFromPoint = typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(pointer.x, pointer.y) as HTMLElement[]
            : []
        const candidates = elementsFromPoint.length
            ? elementsFromPoint
            : [document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null].filter(Boolean) as HTMLElement[]

        let button: HTMLElement | null = null
        let forceGroupDrop = false
        for (const candidate of candidates) {
            if (!candidate) {
                continue
            }
            if (candidate.closest('.cdk-drag-preview') || candidate.closest('.cdk-drag-placeholder')) {
                continue
            }
            const match = candidate.closest('[data-left-dock-item]') as HTMLElement | null
            if (match && candidateButtons.includes(match)) {
                button = match
                break
            }
        }

        if (!button) {
            // If user hovers over a grouped capsule (not directly over icon), add into that group.
            for (const candidate of candidates) {
                if (!candidate) {
                    continue
                }
                const groupEl = candidate.closest('[data-left-dock-group]') as HTMLElement | null
                const groupItemsRaw = groupEl?.dataset?.leftDockGroup
                if (!groupItemsRaw) {
                    continue
                }
                const groupItems = groupItemsRaw.split('|').filter(Boolean)
                const groupButtons = candidateButtons.filter(btn => {
                    const item = btn.dataset?.leftDockItem
                    return !!item && groupItems.includes(item)
                })
                if (!groupButtons.length) {
                    continue
                }
                let nearestInGroup: { button: HTMLElement, distance: number } | null = null
                for (const groupButton of groupButtons) {
                    const rect = groupButton.getBoundingClientRect()
                    const centerY = rect.top + (rect.height / 2)
                    const distance = Math.abs(pointer.y - centerY)
                    if (!nearestInGroup || distance < nearestInGroup.distance) {
                        nearestInGroup = { button: groupButton, distance }
                    }
                }
                button = nearestInGroup?.button ?? null
                if (button) {
                    forceGroupDrop = true
                    break
                }
            }
        }

        if (!button) {
            // Pointer can briefly miss icon DOM nodes while dragging; use nearest visible icon with tight bounds.
            const nearest = this.findNearestLeftDockButton(pointer, candidateButtons)
            if (nearest) {
                const rect = nearest.getBoundingClientRect()
                const centerY = rect.top + (rect.height / 2)
                const verticalDistance = Math.abs(pointer.y - centerY)
                const withinX = pointer.x >= rect.left - 10 && pointer.x <= rect.right + 10
                const withinY = verticalDistance <= Math.max(18, rect.height * 0.8)
                if (withinX && withinY) {
                    button = nearest
                }
            }
        }

        if (!button) {
            return null
        }
        const item = button?.dataset?.leftDockItem
        if (!item || !this.leftDockVisibleOrder.includes(item)) {
            return null
        }
        if (draggedItem && item === draggedItem) {
            return null
        }
        const rect = button.getBoundingClientRect()
        const centerY = rect.top + (rect.height / 2)
        const distanceFromCenter = Math.abs(pointer.y - centerY)
        const centerZone = Math.max(10, rect.height * 0.45)
        const insideBounds = pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
        return {
            item,
            insertAfter: pointer.y > centerY,
            // Group when dropped on an icon or inside a grouped capsule; near-gap drops remain reorder/remove.
            isGroupDrop: forceGroupDrop || insideBounds || distanceFromCenter <= centerZone,
        }
    }

    private findNearestLeftDockButton (pointer: LeftDockPointer, buttons: HTMLElement[]): HTMLElement | null {
        let nearest: { button: HTMLElement, distanceSq: number } | null = null
        for (const button of buttons) {
            const rect = button.getBoundingClientRect()
            const centerX = rect.left + (rect.width / 2)
            const centerY = rect.top + (rect.height / 2)
            const dx = pointer.x - centerX
            const dy = pointer.y - centerY
            const distanceSq = (dx * dx) + (dy * dy)
            if (!nearest || distanceSq < nearest.distanceSq) {
                nearest = { button, distanceSq }
            }
        }
        return nearest?.button ?? null
    }

    private resolveLeftDockPointer (event: CdkDragDrop<string[]>): LeftDockPointer | null {
        const dropPoint = (event as any).dropPoint as LeftDockPointer | undefined
        if (dropPoint && Number.isFinite(dropPoint.x) && Number.isFinite(dropPoint.y)) {
            return dropPoint
        }

        const nativeEvent = (event as any).event as MouseEvent | TouchEvent | undefined
        if (!nativeEvent) {
            return null
        }
        if (nativeEvent instanceof MouseEvent) {
            return { x: nativeEvent.clientX, y: nativeEvent.clientY }
        }

        if (nativeEvent.changedTouches?.length) {
            return {
                x: nativeEvent.changedTouches[0].clientX,
                y: nativeEvent.changedTouches[0].clientY,
            }
        }
        if (nativeEvent.touches?.length) {
            return {
                x: nativeEvent.touches[0].clientX,
                y: nativeEvent.touches[0].clientY,
            }
        }
        return null
    }

    private applyLeftDockGroupedDrop (draggedItem: string, targetItem: string, insertAfter: boolean): void {
        const nextVisibleOrder = this.leftDockVisibleOrder.filter(id => id !== draggedItem)
        const targetIndex = nextVisibleOrder.indexOf(targetItem)
        if (targetIndex === -1) {
            return
        }
        const insertIndex = insertAfter ? targetIndex + 1 : targetIndex
        nextVisibleOrder.splice(insertIndex, 0, draggedItem)
        const nextOrder = this.mergeLeftDockOrder(nextVisibleOrder)
        this.leftDockOrder = nextOrder
        this.leftDockVisibleOrder = nextOrder.filter(id => this.isLeftDockItemVisible(id))
        this.config.store.appearance.leftDockOrder = nextOrder

        const groupsWithoutDragged = this.leftDockGroups
            .map(group => group.filter(item => item !== draggedItem))
            .filter(group => group.length > 0)
        const targetGroupIndex = groupsWithoutDragged.findIndex(group => group.includes(targetItem))
        if (targetGroupIndex >= 0) {
            const targetGroup = [...groupsWithoutDragged[targetGroupIndex]]
            const targetPosition = targetGroup.indexOf(targetItem)
            const insertPosition = insertAfter ? targetPosition + 1 : targetPosition
            targetGroup.splice(insertPosition, 0, draggedItem)
            groupsWithoutDragged[targetGroupIndex] = targetGroup
        } else {
            groupsWithoutDragged.push(insertAfter ? [targetItem, draggedItem] : [draggedItem, targetItem])
        }
        this.setLeftDockGroups(this.reconcileLeftDockGroupsAfterReorder(groupsWithoutDragged), false)
        this.refreshLeftDockChunks()
        void this.config.save()
    }

    isLeftDockItemVisible (item: string): boolean {
        if (item === 'code-editor') {
            return false // Tlink Studio - deactivated
        }
        if (item === 'ssh') {
            return !!(this.sshSidePanel || this.sshSidebarCommand)
        }
        if (item === 'intellij-editor') {
            return !!this.intellijEditorCommand
        }
        if (item === 'tabby-url') {
            return !!this.tabbyUrlCommand
        }
        return true
    }

    isLeftDockItemActive (item: string): boolean {
        if (item === 'session-manager') {
            return this.sidePanelVisible && this.sidePanelId === 'session-manager'
        }
        if (item === 'remote-desktop') {
            return this.sidePanelVisible && this.sidePanelId === 'remote-desktop'
        }
        if (item === 'ssh') {
            return this.sidePanelVisible && this.sidePanelId === this.sshSidePanel?.id
        }
        if (item === 'websocket') {
            return this.websocketServerRunning
        }
        return false
    }

    isLeftDockItemDisabled (item: string): boolean {
        if (item === 'websocket') {
            return this.websocketServerStarting
        }
        if (item === 'share-all-sessions') {
            return this.shareAllSessionsInProgress
        }
        if (item === 'open-shared-session-link') {
            return this.openSharedLinkInProgress
        }
        return false
    }

    getLeftDockTooltip (item: string): string {
        switch (item) {
        case 'profiles':
            return 'Profiles & connections'
        case 'sftp':
            return 'Open SFTP'
        case 'session-manager':
            return 'Session manager'
        case 'remote-desktop':
            return 'Remote desktop'
        case 'ssh':
            return this.sshSidePanel?.label || this.sshSidebarCommand?.label || 'SSH sidebar'
        case 'code-editor':
            return 'Tlink Studio'
        case 'intellij-editor':
            return this.intellijEditorCommand?.label || 'Open IntelliJ editor'
        case 'ai-chat':
            return 'AI Chat'
        case 'ai-assistant':
            return 'AI Chat (Ollama / OpenAI / Claude)'
        case 'tabby-url':
            return this.tabbyUrlCommand?.label || 'Open Tabby URL'
        case 'copilot-chat':
            return 'Copilot Agent (Code Assistant)'
        case 'share-all-sessions':
            return this.shareAllSessionsInProgress
                ? 'Sharing open sessions...'
                : 'Share all open sessions'
        case 'websocket':
            return this.websocketServerRunning
                ? `Session sharing server running on port ${this.websocketServerPort} (click to stop)`
                : 'Start session sharing server'
        case 'open-shared-session-link':
            return this.openSharedLinkInProgress
                ? 'Opening shared session...'
                : 'Open shared session link'
        default:
            return ''
        }
    }

    onLeftDockItemClick (item: string): void {
        switch (item) {
        case 'profiles':
            this.openProfilesAndConnections()
            break
        case 'sftp':
            void this.openSftpProfileSelector()
            break
        case 'session-manager':
            this.openSidePanelById('session-manager')
            break
        case 'remote-desktop':
            this.openSidePanelById('remote-desktop')
            break
        case 'ssh':
            this.openSSHSidePanel()
            break
        case 'code-editor':
            this.openCodeEditor()
            break
        case 'intellij-editor':
            void this.openIntelliJEditor()
            break
        case 'ai-chat':
            void this.openAIChat()
            break
        case 'ai-assistant':
            this.openAIAssistant()
            break
        case 'tabby-url':
            if (this.tabbyUrlCommand?.run) {
                void this.tabbyUrlCommand.run()
            } else if (this.tabbyUrlCommand?.id) {
                this.commands.run(this.tabbyUrlCommand.id, this.buildCommandContext())
            }
            break
        case 'copilot-chat':
            this.openCopilotChat()
            break
        case 'share-all-sessions':
            void this.shareAllOpenSessionsFromDock()
            break
        case 'websocket':
            void this.toggleWebSocketServer()
            break
        case 'open-shared-session-link':
            void this.openSharedSessionLinkFromDock()
            break
        default:
            break
        }
    }

    private async shareAllOpenSessionsFromDock (): Promise<void> {
        if (this.shareAllSessionsInProgress) {
            return
        }

        const sessions = this.getShareableSessionTabs().filter(tab => tab.session)
        if (!sessions.length) {
            this.notifications.error(this.translate.instant('No active terminal sessions to share'))
            return
        }

        const selectedMode = await this.promptSharingMode()
        if (!selectedMode) {
            return
        }

        this.shareAllSessionsInProgress = true
        try {
            const shareUrl = await this.sessionSharing.shareSessionBundle(sessions, { mode: selectedMode })
            if (!shareUrl) {
                this.notifications.error(this.translate.instant('Failed to share open sessions. Please check console for details.'))
                return
            }

            let copied = false
            try {
                this.platform.setClipboard({ text: shareUrl })
                copied = true
            } catch {
                // Clipboard access can fail on some environments; the modal still shows the URL.
            }

            const modal = this.ngbModal.open(ShareSessionModalComponent, {
                backdrop: 'static',
            })
            modal.componentInstance.shareUrl = shareUrl
            modal.componentInstance.mode = selectedMode
            modal.componentInstance.viewers = 0

            if (copied) {
                this.notifications.notice(this.translate.instant('All open sessions shared! Share URL copied to clipboard.'))
            } else {
                this.notifications.notice(this.translate.instant('All open sessions shared!'))
            }
        } catch (error: any) {
            this.logger.error('Failed to share open sessions:', error)
            this.notifications.error(this.translate.instant('Failed to share open sessions: {error}', { error: error?.message || error }))
        } finally {
            this.shareAllSessionsInProgress = false
        }
    }

    private async promptSharingMode (): Promise<'read-only' | 'interactive' | null> {
        if (this.selector.active) {
            return null
        }

        const modeOptions: SelectorOption<'read-only' | 'interactive'>[] = [
            {
                name: this.translate.instant('Read-only'),
                description: this.translate.instant('Viewers can only see the terminal output'),
                icon: 'fas fa-eye',
                result: 'read-only',
            },
            {
                name: this.translate.instant('Interactive'),
                description: this.translate.instant('Viewers can also send input to the terminal'),
                icon: 'fas fa-keyboard',
                result: 'interactive',
            },
        ]

        return this.selector.show<'read-only' | 'interactive'>(
            this.translate.instant('Select sharing mode'),
            modeOptions,
        ).catch(() => null)
    }

    private getShareableSessionTabs (): Array<BaseTabComponent & { session?: any, profile?: { type?: string } }> {
        const tabs: Array<BaseTabComponent & { session?: any, profile?: { type?: string } }> = []
        const seen = new Set<BaseTabComponent>()

        for (const topLevel of this.app.tabs) {
            const nestedTabs = topLevel instanceof SplitTabComponent ? topLevel.getAllTabs() : [topLevel]
            for (const tab of nestedTabs) {
                if (seen.has(tab)) {
                    continue
                }
                seen.add(tab)
                const profileType = (tab as any)?.profile?.type
                if (profileType === 'shared-session') {
                    continue
                }
                tabs.push(tab as BaseTabComponent & { session?: any, profile?: { type?: string } })
            }
        }

        return tabs
    }

    private async openSharedSessionLinkFromDock (): Promise<void> {
        if (this.openSharedLinkInProgress) {
            return
        }

        const clipboardText = String(this.platform.readClipboard() ?? '').trim()
        const modal = this.ngbModal.open(PromptModalComponent, {
            backdrop: 'static',
        })
        modal.componentInstance.prompt = this.translate.instant('Paste shared session link')
        modal.componentInstance.value = clipboardText.startsWith('tlink://share/')
            ? clipboardText
            : ''
        modal.componentInstance.password = false

        const result = await modal.result.catch(() => null)
        const shareUrl = String(result?.value ?? '').trim()
        if (!shareUrl) {
            return
        }
        if (!shareUrl.startsWith('tlink://share/')) {
            this.notifications.error(this.translate.instant('Invalid shared session link'))
            return
        }

        this.openSharedLinkInProgress = true
        try {
            const handled = await this.dispatchShareLinkToCLIHandlers(shareUrl)
            if (!handled) {
                this.notifications.error(this.translate.instant('Could not open shared session link'))
                return
            }
            this.notifications.notice(this.translate.instant('Opening shared session...'))
        } catch (error: any) {
            this.logger.error('Failed to open shared session link:', error)
            this.notifications.error(this.translate.instant('Failed to open shared session: {error}', { error: error?.message || error }))
        } finally {
            this.openSharedLinkInProgress = false
        }
    }

    private async dispatchShareLinkToCLIHandlers (shareUrl: string): Promise<boolean> {
        const handlers = [...(this.cliHandlers ?? [])]
            .sort((a, b) => (b?.priority ?? 0) - (a?.priority ?? 0))
        const event = {
            argv: { _: [shareUrl] },
            cwd: process.cwd(),
            secondInstance: false,
        }

        let handled = false
        for (const handler of handlers) {
            if (handled && handler.firstMatchOnly) {
                continue
            }
            try {
                if (await handler.handle(event)) {
                    handled = true
                }
            } catch (error) {
                this.logger.warn('CLI handler failed while opening shared link:', error)
            }
        }

        return handled
    }

    private buildCommandContext (): CommandContext {
        const ctx: CommandContext = {}
        const tab = this.app.activeTab
        if (tab instanceof SplitTabComponent) {
            ctx.tab = tab.getFocusedTab() ?? undefined
        } else if (tab) {
            ctx.tab = tab
        }
        return ctx
    }

    private orderSidePanels (panels: SidePanelRegistration[]): SidePanelRegistration[] {
        const order = this.config.store?.appearance?.sidePanelOrder as string[] | undefined
        if (!order?.length) {
            return panels.slice()
        }
        const orderSet = new Set(order)
        const byId = new Map(panels.map(panel => [panel.id, panel]))
        const ordered: SidePanelRegistration[] = []
        for (const id of order) {
            const panel = byId.get(id)
            if (panel) {
                ordered.push(panel)
            }
        }
        for (const panel of panels) {
            if (!orderSet.has(panel.id)) {
                ordered.push(panel)
            }
        }
        return ordered
    }

    toggleMaximize (): void {
        this.hostWindow.toggleMaximize()
    }

    toggleSidePanel (panel: SidePanelRegistration): void {
        this.sidePanel.toggle(panel)
    }

    hasSidePanel (id: string): boolean {
        return this.sidePanels.some(p => p.id === id)
    }

    openSidePanelById (id: string): void {
        const panel = this.sidePanels.find(p => p.id === id)
        if (!panel) {
            return
        }
        if (this.sidePanelVisible && this.sidePanelId === id) {
            this.sidePanel.hide()
            return
        }
        this.sidePanel.show(panel)
    }

    async openProfileSelector (): Promise<void> {
        if (this.selector.active) {
            return
        }
        const profile = await this.profiles.showProfileSelector().catch(() => null)
        if (profile) {
            await this.profiles.openNewTabForProfile(profile)
        }
    }

    async saveWorkspaceFromMenu (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent, {
            backdrop: 'static',
        })
        modal.componentInstance.prompt = this.translate.instant('Workspace name')
        modal.componentInstance.value = ''
        modal.componentInstance.password = false

        try {
            const result = await modal.result
            const name = result?.value?.trim?.()
            if (!name) {
                return
            }
            await this.workspaceService.saveWorkspace(name, '', false)
            this.notifications.notice(this.translate.instant('Workspace saved'))
        } catch {
            // User cancelled
        }
    }

    async loadWorkspaceFromMenu (): Promise<void> {
        if (this.selector.active) {
            return
        }

        const workspaces = this.workspaceService
            .getWorkspaces()
            .slice()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

        if (!workspaces.length) {
            this.notifications.notice(this.translate.instant('No workspaces saved yet. Save your current workspace to get started.'))
            return
        }

        const options: SelectorOption<void>[] = workspaces.map((workspace: Workspace) => {
            const tabsText = `${this.translate.instant('Tabs')}: ${workspace.tabs.length}`
            const foldersText = workspace.codeEditorFolders.length
                ? ` • ${this.translate.instant('Folders')}: ${workspace.codeEditorFolders.length}`
                : ''

            return {
                name: workspace.name,
                description: `${tabsText}${foldersText}`,
                callback: async () => {
                    const success = await this.workspaceService.loadWorkspace(workspace.id)
                    if (success) {
                        this.notifications.notice(this.translate.instant('Workspace loaded: {name}', { name: workspace.name }))
                    } else {
                        this.notifications.error(this.translate.instant('Failed to load workspace'))
                    }
                },
            }
        })

        await this.selector.show(this.translate.instant('Load workspace'), options).catch(() => null)
    }

    async exportWorkspaceFromMenu (): Promise<void> {
        if (this.selector.active) {
            return
        }

        const workspaces = this.workspaceService
            .getWorkspaces()
            .slice()
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

        if (!workspaces.length) {
            this.notifications.notice(this.translate.instant('No workspaces saved yet. Save your current workspace to get started.'))
            return
        }

        const options: SelectorOption<void>[] = workspaces.map((workspace: Workspace) => {
            const tabsText = `${this.translate.instant('Tabs')}: ${workspace.tabs.length}`
            const foldersText = workspace.codeEditorFolders.length
                ? ` • ${this.translate.instant('Folders')}: ${workspace.codeEditorFolders.length}`
                : ''

            return {
                name: workspace.name,
                description: `${tabsText}${foldersText}`,
                callback: async () => {
                    const json = this.workspaceService.exportWorkspace(workspace.id)
                    if (!json) {
                        this.notifications.error(this.translate.instant('Failed to export workspace'))
                        return
                    }

                    const data = new TextEncoder().encode(json)
                    const filename = this.buildWorkspaceExportFilename(workspace.name)
                    const download = await this.platform.startDownload(filename, 0o644, data.length)
                    if (!download) {
                        return
                    }

                    try {
                        await download.write(data)
                        this.notifications.notice(this.translate.instant('Workspace exported: {name}', { name: workspace.name }))
                    } catch (error: any) {
                        this.logger.error('Failed to export workspace:', error)
                        this.notifications.error(this.translate.instant('Failed to export workspace'))
                    } finally {
                        (download as any).close?.()
                    }
                },
            }
        })

        await this.selector.show(this.translate.instant('Export workspace'), options).catch(() => null)
    }

    async importWorkspaceFromMenu (): Promise<void> {
        const uploads = await this.platform.startUpload({ multiple: false })
        if (!uploads.length) {
            return
        }

        const upload = uploads[0]
        try {
            const data = await upload.readAll()
            const json = new TextDecoder().decode(data)
            const workspace = await this.workspaceService.importFromJson(json)
            if (!workspace) {
                this.notifications.error(this.translate.instant('Failed to import workspace'))
                return
            }
            this.notifications.notice(this.translate.instant('Workspace imported: {name}', { name: workspace.name }))
        } catch (error: any) {
            this.logger.error('Failed to import workspace:', error)
            this.notifications.error(this.translate.instant('Failed to import workspace'))
        } finally {
            (upload as any).close?.()
        }
    }

    private buildWorkspaceExportFilename (workspaceName: string): string {
        const normalized = (workspaceName || '')
            .trim()
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, ' ')
            .slice(0, 80)
        return `${normalized || 'workspace'}.tlink-workspace.json`
    }

    async openSftpProfileSelector (): Promise<void> {
        if (this.selector.active) {
            return
        }
        const allProfiles = await this.profiles.getProfiles({ includeBuiltin: true })
        const sshProfiles = allProfiles.filter(p => p.type === 'ssh')
        
        const options: SelectorOption<void>[] = sshProfiles.map(p => {
            const { result, ...opt } = this.profiles.selectorOptionForProfile(p)
            return {
                ...opt,
                result: undefined,
                callback: async () => {
                    await this.profiles.openNewTabForProfile(p, 'r', { startInSFTP: true })
                },
            }
        })

        // Add quick connect option for SSH with SFTP
        this.profiles.getProviders().forEach(provider => {
            const quickConnectProvider = provider as any
            if (provider.id === 'ssh' && typeof quickConnectProvider.quickConnect === 'function') {
                options.push({
                    name: `${this.translate.instant('Quick connect')} (${provider.name.toUpperCase()})`,
                    freeInputPattern: `${this.translate.instant('Connect to "%s"...')} (${provider.name.toUpperCase()})`,
                    icon: 'fas fa-arrow-right',
                    weight: 0,
                    callback: async (query?: string) => {
                        if (!query) {
                            return
                        }
                        const profile = quickConnectProvider.quickConnect(query)
                        if (profile) {
                            await this.profiles.openNewTabForProfile(profile as PartialProfile<Profile>, 'r', { startInSFTP: true })
                        }
                    },
                })
            }
        })

        await this.selector.show<void>('Open SFTP', options).catch(() => null)
    }

    async openAIChat (): Promise<void> {
        const context: CommandContext = {}
        const tab = this.app.activeTab
        if (tab instanceof SplitTabComponent) {
            context.tab = tab.getFocusedTab() ?? undefined
        } else if (tab) {
            context.tab = tab
        }
        await this.commands.run('tlink-chatgpt:open', context)
    }

    async openIntelliJEditor (): Promise<void> {
        const preferredId = this.intellijEditorCommand?.id
        if (preferredId) {
            await this.commands.run(preferredId, this.buildCommandContext())
            return
        }
        const commands = await this.commands.getCommands(this.buildCommandContext())
        const fallback = commands.find(cmd => cmd.id === 'intellij-bridge:open-editor')
        if (fallback) {
            await fallback.run()
            return
        }
        this.logger.warn('IntelliJ bridge command not found')
    }

    openAIAssistant (): void {
        // Open AI Assistant window directly via IPC (not command search)
        try {
            const electron = (window as any).require?.('electron')
                ?? (window as any).nodeRequire?.('electron')
            const ipcRenderer = electron?.ipcRenderer
            if (ipcRenderer) {
                ipcRenderer.send('app:open-ai-assistant-window')
                return
            }
        } catch {
            // Fallback to command search
        }
        this.commands.getCommands(this.buildCommandContext()).then(commands => {
            const aiAssistantCmd = commands.find(cmd =>
                cmd.label?.toLowerCase() === 'ai assistant' ||
                cmd.label?.toLowerCase().includes('ai assistant'),
            )
            if (aiAssistantCmd) {
                aiAssistantCmd.run()
            }
        }).catch((err) => {
            this.logger.warn('Failed to find AI Assistant command:', err)
        })
    }

    openCopilotChat (): void {
        // Open Copilot/Code Editor window directly via IPC (not command search)
        try {
            const electron = (window as any).require?.('electron')
                ?? (window as any).nodeRequire?.('electron')
            const ipcRenderer = electron?.ipcRenderer
            if (ipcRenderer) {
                ipcRenderer.send('app:open-code-editor-window')
                return
            }
        } catch {
            // Fallback to command search
        }
        this.commands.getCommands(this.buildCommandContext()).then(async commands => {
            const copilotCmd = commands.find(cmd => {
                const label = cmd.label?.toLowerCase() ?? ''
                return label === 'open copilot chat' || label.includes('copilot')
            })
            if (copilotCmd) {
                await copilotCmd.run()
                return
            }
            this.logger.warn('Open Copilot Chat command not found')
            await this.platform.showMessageBox({
                type: 'warning',
                message: 'Copilot Agent not available',
                detail: 'Enable the Copilot Agent plugin in Settings > Plugins to use Open Copilot Chat.',
                buttons: ['OK'],
            })
        }).catch((err) => {
            this.logger.warn('Failed to run Open Copilot Chat:', err)
        })
    }

    websocketServerRunning = false
    websocketServerStarting = false
    websocketServerPort = 0
    shareAllSessionsInProgress = false
    openSharedLinkInProgress = false

    private isElectron (): boolean {
        return typeof window !== 'undefined' && (window as any).require && typeof process !== 'undefined' && (process as any).type === 'renderer'
    }

    private getIpcRenderer (): any {
        try {
            if (this.isElectron()) {
                const electron = (window as any).require('electron')
                if (electron && electron.ipcRenderer) {
                    return electron.ipcRenderer
                }
            }
        } catch {
            // Not in Electron
        }
        return null
    }

    async checkWebSocketServerStatus (): Promise<void> {
        const ipcRenderer = this.getIpcRenderer()
        if (!ipcRenderer) {
            return
        }

        try {
            const status = await ipcRenderer.invoke('session-sharing:get-server-status')
            this.websocketServerRunning = status.isRunning
            this.websocketServerPort = status.port || 0
        } catch (error) {
            this.logger.debug('Could not check WebSocket server status:', error)
        }
    }

    async toggleWebSocketServer (): Promise<void> {
        if (this.websocketServerStarting) {
            return
        }

        const ipcRenderer = this.getIpcRenderer()
        if (!ipcRenderer) {
            return
        }

        this.websocketServerStarting = true

        try {
            if (this.websocketServerRunning) {
                // Stop server
                const result = await ipcRenderer.invoke('session-sharing:stop-server')
                if (result.success) {
                    this.logger.info('WebSocket server stopped')
                } else {
                    this.logger.error('Failed to stop WebSocket server:', result.error)
                    await this.platform.showMessageBox({
                        type: 'error',
                        message: 'Failed to stop WebSocket server',
                        detail: result.error,
                        buttons: ['OK'],
                    })
                }
            } else {
                // Start server
                const result = await ipcRenderer.invoke('session-sharing:start-server')
                if (result.success) {
                    this.logger.info(`WebSocket server started on port ${result.port}`)
                    this.websocketServerPort = result.port
                } else {
                    this.logger.error('Failed to start WebSocket server:', result.error)
                    await this.platform.showMessageBox({
                        type: 'error',
                        message: 'Failed to start WebSocket server',
                        detail: result.error,
                        buttons: ['OK'],
                    })
                }
            }
            
            // Refresh status
            await this.checkWebSocketServerStatus()
        } catch (error) {
            this.logger.error('Error toggling WebSocket server:', error)
            await this.platform.showMessageBox({
                type: 'error',
                message: 'Error controlling WebSocket server',
                detail: String(error),
                buttons: ['OK'],
            })
        } finally {
            this.websocketServerStarting = false
        }
    }

    openCodeEditor (): void {
        if (this.hostApp.openCodeEditorWindow()) {
            return
        }
        const existing = this.app.tabs.find(tab => tab instanceof CodeEditorTabComponent)
        if (existing) {
            this.app.selectTab(existing)
            return
        }
        this.app.openNewTab({ type: CodeEditorTabComponent })
    }

    onSidePanelMouseUp (event: MouseEvent, panel: SidePanelRegistration): void {
        if (event.button !== 2) {
            return
        }
        void this.openSidePanelMenu(event, panel)
    }

    getSidePanelAccentRgb (panel: SidePanelRegistration): string|null {
        const color = this.getSidePanelColor(panel)
        if (!color) {
            return null
        }
        try {
            return Color(color).rgb().array().join(', ')
        } catch {
            return null
        }
    }

    async openSidePanelMenu (event: MouseEvent, panel: SidePanelRegistration): Promise<void> {
        event.preventDefault()
        event.stopPropagation()
        if (this.sidePanelColorPickerOpen) {
            return
        }
        this.sidePanelColorPickerOpen = true
        try {
            const currentColor = this.getSidePanelColor(panel)
            const defaultColor = this.getDefaultSidePanelColor()
            const modal = this.ngbModal.open(ColorPickerModalComponent)
            modal.componentInstance.title = panel.label
            modal.componentInstance.value = this.normalizeColorToHex(currentColor || defaultColor, defaultColor)
            modal.componentInstance.canReset = !!currentColor
            const result = await modal.result.catch(() => null)
            if (!result) {
                return
            }
            if (result.cleared) {
                this.setSidePanelColor(panel, null)
                return
            }
            const value = (result.value ?? '').trim()
            if (!value) {
                return
            }
            this.setSidePanelColor(panel, value)
        } finally {
            this.sidePanelColorPickerOpen = false
        }
    }

    private setSidePanelColor (panel: SidePanelRegistration, color: string|null): void {
        if (!this.config.store.appearance.sidePanelColors) {
            this.config.store.appearance.sidePanelColors = {}
        }
        if (color) {
            this.config.store.appearance.sidePanelColors[panel.id] = color
        } else {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.config.store.appearance.sidePanelColors[panel.id]
        }
        this.config.save()
    }

    private getSidePanelColor (panel: SidePanelRegistration): string {
        return this.config.store?.appearance?.sidePanelColors?.[panel.id] ?? ''
    }

    private getDefaultSidePanelColor (): string {
        const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--bs-primary').trim()
        return this.normalizeColorToHex(cssValue, '#3b82f6')
    }

    private normalizeColorToHex (value: string, fallback: string): string {
        if (!value) {
            return fallback
        }
        try {
            return Color(value).hex()
        } catch {
            return fallback
        }
    }

    protected isTitleBarNeeded (): boolean {
        return (
            this.config.store.appearance.frame === 'full'
            ||
                this.hostApp.platform !== Platform.macOS
                && this.config.store.appearance.frame === 'thin'
                && this.config.store.appearance.tabsLocation !== 'top'
                && this.config.store.appearance.tabsLocation !== 'bottom'
        )
    }
}
// v1.0.2 release build
