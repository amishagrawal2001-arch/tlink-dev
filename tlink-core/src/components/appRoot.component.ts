/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Input, HostListener, HostBinding, ViewChildren, ViewChild, Type, OnInit } from '@angular/core'
import { trigger, style, animate, transition, state } from '@angular/animations'
import { NgbDropdown, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
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
import { TabBodyComponent } from './tabBody.component'
import { SplitTabComponent } from './splitTab.component'
import { AppService, BottomPanelRegistration, BottomPanelService, Command, CommandContext, CommandLocation, FileTransfer, HostWindowService, PlatformService, SidePanelRegistration, SidePanelService, ProfilesService, SelectorService, SelectorOption, PartialProfile, Profile } from '../api'
import { TabsService } from '../services/tabs.service'
import { CodeEditorTabComponent } from './codeEditorTab.component'

type SplitDirection = 'r' | 'l' | 't' | 'b'

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
        trigger('animateTab', makeTabAnimation('width', 200)),
    ],
})
export class AppRootComponent implements OnInit {
    Platform = Platform
    @Input() ready = false
    @Input() leftToolbarButtons: Command[]
    @Input() rightToolbarButtons: Command[]
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
    sidePanelVisible = false
    sidePanelComponent: Type<any> | null = null
    sidePanelWidth = 240
    sidePanelId = ''
    sidePanels: SidePanelRegistration[] = []
    rightDockPanels: SidePanelRegistration[] = []
    leftDockOrder: string[] = []
    leftDockVisibleOrder: string[] = []
    sshSidePanel: SidePanelRegistration | null = null
    sshSidebarCommand: Command | null = null
    intellijEditorCommand: Command | null = null
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
    private logger: Logger
    private readonly defaultLeftDockOrder = [
        'profiles',
        'sftp',
        'session-manager',
        'remote-desktop',
        'ssh',
        'code-editor',
        'intellij-editor',
        'ai-chat',
        'ai-assistant',
        'copilot-chat',
        'websocket',
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
            this.activeTransfersDropdown.open()
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
            this.leftToolbarButtons = await this.getToolbarButtons(false)
            this.rightToolbarButtons = await this.getToolbarButtons(true)
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
        if (!this.bottomPanelVisible || !this.bottomPanelComponent) {
            return false
        }
        if (this.bottomPanelId === 'command-window' && this.isChatTabActive) {
            return false
        }
        return true
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
    onBottomResizeMove (event: MouseEvent): void {
        if (!this.bottomPanelResizing) {
            return
        }
        const delta = this.bottomPanelResizeStartY - event.clientY
        const next = this.clampBottomPanelHeight(this.bottomPanelResizeStartHeight + delta)
        this.bottomPanelHeight = next
        this.bottomPanel.setHeight(next)
    }

    @HostListener('window:mousemove', ['$event'])
    onSidePanelResizeMove (event: MouseEvent): void {
        if (!this.sidePanelResizing) {
            return
        }
        const delta = this.sidePanelResizeStartX - event.clientX
        const next = this.clampSidePanelWidth(this.sidePanelResizeStartWidth + delta)
        this.sidePanelWidth = next
        this.sidePanel.setWidth(next)
    }

    @HostListener('window:mouseup')
    onBottomResizeEnd (): void {
        this.bottomPanelResizing = false
    }

    @HostListener('window:mouseup')
    onSidePanelResizeEnd (): void {
        this.sidePanelResizing = false
    }

    @HostListener('window:touchmove', ['$event'])
    onBottomResizeMoveTouch (event: TouchEvent): void {
        if (!this.bottomPanelResizing || !event.touches.length) {
            return
        }
        const delta = this.bottomPanelResizeStartY - event.touches[0].clientY
        const next = this.clampBottomPanelHeight(this.bottomPanelResizeStartHeight + delta)
        this.bottomPanelHeight = next
        this.bottomPanel.setHeight(next)
    }

    @HostListener('window:touchmove', ['$event'])
    onSidePanelResizeMoveTouch (event: TouchEvent): void {
        if (!this.sidePanelResizing || !event.touches.length) {
            return
        }
        const delta = this.sidePanelResizeStartX - event.touches[0].clientX
        const next = this.clampSidePanelWidth(this.sidePanelResizeStartWidth + delta)
        this.sidePanelWidth = next
        this.sidePanel.setWidth(next)
    }

    @HostListener('window:touchend')
    onBottomResizeEndTouch (): void {
        this.bottomPanelResizing = false
    }

    @HostListener('window:touchend')
    onSidePanelResizeEndTouch (): void {
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
        const current = this.config.store.appearance.colorSchemeMode as 'auto'|'dark'|'light'|undefined
        const currentIndex = Math.max(0, order.indexOf(current ?? 'dark'))
        const next = order[(currentIndex + 1) % order.length]
        this.config.store.appearance.colorSchemeMode = next
        this.config.save()
    }

    async ngOnInit () {
        this.config.ready$.toPromise().then(() => {
            this.ready = true
            this.app.emitReady()
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
        return this.config.store.appearance.flexTabs ? '*' : '200px'
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
        moveItemInArray(this.leftDockVisibleOrder, event.previousIndex, event.currentIndex)
        const nextOrder = this.mergeLeftDockOrder(this.leftDockVisibleOrder)
        this.leftDockOrder = nextOrder
        this.leftDockVisibleOrder = this.leftDockOrder.filter(id => this.isLeftDockItemVisible(id))
        this.config.store.appearance.leftDockOrder = nextOrder
    }

    onTransfersChange () {
        if (this.activeTransfers.length === 0) {
            this.activeTransfersDropdown.close()
        }
    }

    onTransfersFloatingChange (floating: boolean): void {
        this.transfersFloating = floating
        if (this.activeTransfers.length) {
            setTimeout(() => this.activeTransfersDropdown.open())
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

        const buttons = all
            .filter(x => x.locations?.includes(aboveZero ? CommandLocation.RightToolbar : CommandLocation.LeftToolbar))
            .filter(x => !x.label?.toLowerCase().includes('toggle ssh connections sidebar'))
            .filter(x => !x.label?.toLowerCase().includes('ai assistant')) // Filter AI Assistant from toolbar (only in dock)
            .filter(x => !x.label?.toLowerCase().includes('open copilot')) // Filter Open Copilot Chat from toolbar (only in dock)

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
        for (const id of this.defaultLeftDockOrder) {
            if (!cleaned.includes(id)) {
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
    }

    trackByLeftDockItem (_index: number, item: string): string {
        return item
    }

    isLeftDockItemVisible (item: string): boolean {
        if (item === 'ssh') {
            return !!(this.sshSidePanel || this.sshSidebarCommand)
        }
        if (item === 'intellij-editor') {
            return !!this.intellijEditorCommand
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
            return 'Code editor'
        case 'intellij-editor':
            return this.intellijEditorCommand?.label || 'Open IntelliJ editor'
        case 'ai-chat':
            return 'AI Chat'
        case 'ai-assistant':
            return 'AI Assistant'
        case 'copilot-chat':
            return 'Open Copilot Chat'
        case 'websocket':
            return this.websocketServerRunning
                ? `Session sharing server running on port ${this.websocketServerPort} (click to stop)`
                : 'Start session sharing server'
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
        case 'copilot-chat':
            this.openCopilotChat()
            break
        case 'websocket':
            void this.toggleWebSocketServer()
            break
        default:
            break
        }
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
        // Find AI Assistant command from toolbar button provider and execute it
        this.commands.getCommands(this.buildCommandContext()).then(commands => {
            const aiAssistantCmd = commands.find(cmd => 
                cmd.label?.toLowerCase() === 'ai assistant' ||
                cmd.label?.toLowerCase().includes('ai assistant')
            )
            if (aiAssistantCmd) {
                aiAssistantCmd.run()
            }
        }).catch((err) => {
            this.logger.warn('Failed to find AI Assistant command:', err)
        })
    }

    openCopilotChat (): void {
        // Find Open Copilot Chat command from toolbar button provider and execute it
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
