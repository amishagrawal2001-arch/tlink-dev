import { Component, HostBinding, Injector, Input } from '@angular/core'
import { AppService, BaseTabComponent as CoreBaseTabComponent, BottomPanelService, GetRecoveryTokenOptions, MenuItemOptions, NotificationsService, PlatformService, RecoveryToken, SplitTabComponent } from 'tlink-core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'

// Fallback base class to avoid runtime crashes if the core export is undefined
const BaseTabComponentRuntime: typeof CoreBaseTabComponent = (CoreBaseTabComponent ?? class extends (Object as any) {}) as typeof CoreBaseTabComponent
type BaseTabComponent = CoreBaseTabComponent

type TargetMode = 'active' | 'visible' | 'all'

@Component({
    selector: 'command-window-tab',
    templateUrl: './commandWindowTab.component.pug',
    styleUrls: ['./commandWindowTab.component.scss'],
})
export class CommandWindowTabComponent extends BaseTabComponentRuntime {
    @HostBinding('class.command-window-host') hostClass = true
    @HostBinding('class.command-window-tab') get isTabHost (): boolean {
        return !this.inBottomPanel && !(this.parent instanceof SplitTabComponent)
    }
    @HostBinding('class.command-window-split') get isSplitHost (): boolean { return this.parent instanceof SplitTabComponent }
    @HostBinding('class.command-window-bottom') get isBottomPanelHost (): boolean { return this.inBottomPanel }

    @Input() inBottomPanel = false
    commandText = ''
    targetMode: TargetMode = 'active'
    terminalTargets: BaseTerminalTabComponent<any>[] = []
    commandAreaHidden = false

    private lastTerminalTab?: BaseTerminalTabComponent<any>

    constructor (
        private app: AppService,
        private notifications: NotificationsService,
        private bottomPanel: BottomPanelService,
        private platform: PlatformService,
        injector: Injector,
    ) {
        super(injector)
        this.setTitle('Command Window')
    }

    ngOnInit (): void {
        this.setupTerminalTracking()
    }

    get connectedCount (): number {
        return this.terminalTargets.filter(tab => tab.session?.open).length
    }

    get targetStatusLabel (): string {
        switch (this.targetMode) {
            case 'all':
                return 'Send command to all sessions'
            case 'visible':
                return 'Send command to visible sessions'
            case 'active':
            default:
                return 'Send command to active session'
        }
    }

    get canSend (): boolean {
        return this.commandText.trim().length > 0 && this.resolveTargets().length > 0
    }

    get editorRows (): number {
        if (this.inBottomPanel) {
            return 4
        }
        return this.isSplitHost ? 6 : 30
    }

    async getRecoveryToken (_options?: GetRecoveryTokenOptions): Promise<RecoveryToken> {
        return {
            type: 'app:command-window',
            commandAreaHidden: this.commandAreaHidden,
        }
    }

    openTargetContextMenu (event: MouseEvent): void {
        event.preventDefault()
        event.stopPropagation()
        const menu: MenuItemOptions[] = [
            {
                type: 'radio',
                label: 'Active session',
                checked: this.targetMode === 'active',
                click: () => this.setTargetMode('active'),
            },
            {
                type: 'radio',
                label: 'Visible sessions',
                checked: this.targetMode === 'visible',
                click: () => this.setTargetMode('visible'),
            },
            {
                type: 'radio',
                label: 'All sessions',
                checked: this.targetMode === 'all',
                click: () => this.setTargetMode('all'),
            },
        ]
        this.platform.popupContextMenu(menu, event)
    }

    private setTargetMode (mode: TargetMode): void {
        this.targetMode = mode
    }

    cycleTargetMode (): void {
        this.targetMode = this.targetMode === 'active'
            ? 'visible'
            : this.targetMode === 'visible'
                ? 'all'
                : 'active'
    }

    get targetModeTooltip (): string {
        switch (this.targetMode) {
            case 'all':
                return 'Target: all sessions'
            case 'visible':
                return 'Target: visible sessions'
            case 'active':
            default:
                return 'Target: active session'
        }
    }

    clearCommands (): void {
        this.commandText = ''
    }

    toggleCommandArea (): void {
        this.commandAreaHidden = !this.commandAreaHidden
    }

    onCommandKeydown (event: KeyboardEvent): void {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.stopPropagation()
        }
    }

    closeWindow (): void {
        if (this.inBottomPanel || this.bottomPanel.isShowing(CommandWindowTabComponent)) {
            this.bottomPanel.hide()
            return
        }
        if (this.parent instanceof SplitTabComponent) {
            this.destroy()
            return
        }
        this.app.closeTab(this, true)
    }

    sendCommands (): void {
        const rawInput = this.commandText
        const script = this.normalizeScript(rawInput)
        const scriptType = this.detectScriptType(script)
        if (scriptType !== 'raw') {
            this.sendScript(script, scriptType)
            return
        }

        const commands = this.normalizeCommands(rawInput)
        if (!commands.length) {
            this.notifications.notice('Enter at least one command')
            return
        }
        const targets = this.resolveTargets()
        if (!targets.length) {
            this.notifications.error('No terminal session available')
            return
        }
        const openTargets = targets.filter(tab => tab.session?.open)
        if (!openTargets.length) {
            this.notifications.error('No connected terminal session available')
            return
        }

        for (const tab of openTargets) {
            for (const command of commands) {
                tab.sendInput(`${command}\r`)
            }
        }
        this.notifications.notice(`Sent ${commands.length} command${commands.length === 1 ? '' : 's'}`)
    }

    private setupTerminalTracking (): void {
        this.refreshTerminalTargets()
        this.subscribeUntilDestroyed(this.app.tabsChanged$, () => this.refreshTerminalTargets())
        this.subscribeUntilDestroyed(this.app.activeTabChange$, tab => {
            const focusedTab = this.resolveFocusedTab(tab)
            if (focusedTab instanceof BaseTerminalTabComponent) {
                this.lastTerminalTab = focusedTab
            }
            this.refreshTerminalTargets()
        })
        if (this.parent instanceof SplitTabComponent) {
            this.subscribeUntilDestroyed(this.parent.focusChanged$, tab => {
                if (tab instanceof BaseTerminalTabComponent) {
                    this.lastTerminalTab = tab
                }
            })
        }
    }

    private refreshTerminalTargets (): void {
        const terminals = this.getAllTabs()
            .filter(tab => tab instanceof BaseTerminalTabComponent) as BaseTerminalTabComponent<any>[]
        this.terminalTargets = terminals
        if (this.lastTerminalTab && terminals.includes(this.lastTerminalTab)) {
            return
        }
        this.lastTerminalTab = terminals[0]
    }

    private getAllTabs (): BaseTabComponent[] {
        const expanded: BaseTabComponent[] = []
        for (const tab of this.app.tabs) {
            if (tab instanceof SplitTabComponent) {
                expanded.push(...tab.getAllTabs())
            } else {
                expanded.push(tab)
            }
        }
        return expanded
    }

    private resolveFocusedTab (tab: BaseTabComponent | null): BaseTabComponent | null {
        if (tab instanceof SplitTabComponent) {
            return tab.getFocusedTab() ?? tab.getAllTabs()[0] ?? tab
        }
        return tab
    }

    private getActiveTerminalFromApp (): BaseTerminalTabComponent<any> | undefined {
        const focused = this.resolveFocusedTab(this.app.activeTab)
        if (focused instanceof BaseTerminalTabComponent) {
            return focused
        }
        return undefined
    }

    private getPreferredTerminalTarget (): BaseTerminalTabComponent<any> | undefined {
        return this.getActiveTerminalFromApp() ?? this.lastTerminalTab ?? this.terminalTargets[0]
    }

    private resolveTargets (): BaseTerminalTabComponent<any>[] {
        if (this.targetMode === 'all') {
            return this.terminalTargets
        }
        if (this.targetMode === 'visible') {
            return this.getVisibleTerminalTargets()
        }
        const active = this.getPreferredTerminalTarget()
        return active ? [active] : []
    }

    private getVisibleTerminalTargets (): BaseTerminalTabComponent<any>[] {
        const activeTab = this.app.activeTab
        if (activeTab instanceof SplitTabComponent) {
            return activeTab.getAllTabs()
                .filter(tab => tab instanceof BaseTerminalTabComponent) as BaseTerminalTabComponent<any>[]
        }
        if (activeTab instanceof BaseTerminalTabComponent) {
            return [activeTab]
        }
        return []
    }

    private normalizeCommands (value: string): string[] {
        return value
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
    }

    private normalizeScript (value: string): string {
        return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    }

    private detectScriptType (script: string): 'python' | 'bash' | 'sh' | 'raw' {
        const shebangMatch = script.match(/^[ \t]*#!.*$/m)
        if (shebangMatch) {
            const shebang = shebangMatch[0].trimStart().toLowerCase()
            if (shebang.includes('python')) {
                return 'python'
            }
            if (shebang.includes('bash')) {
                return 'bash'
            }
            if (shebang.includes('sh')) {
                return 'sh'
            }
            return 'raw'
        }
        let inspected = 0
        for (const line of script.split('\n')) {
            if (!line.trim()) {
                continue
            }
            inspected++
            const cleanedLine = line.replace(/^\uFEFF/, '').trimStart()
            if (cleanedLine.startsWith('#!')) {
                const shebang = cleanedLine.toLowerCase()
                if (shebang.includes('python')) {
                    return 'python'
                }
                if (shebang.includes('bash')) {
                    return 'bash'
                }
                if (shebang.includes('sh')) {
                    return 'sh'
                }
                return 'raw'
            }
            if (inspected >= 5) {
                break
            }
        }
        return 'raw'
    }

    private sendScript (script: string, scriptType: 'python' | 'bash' | 'sh'): void {
        const payload = this.wrapScript(script, scriptType)
        const targets = this.resolveTargets().filter(tab => tab.session?.open)
        if (!targets.length) {
            this.notifications.error('No connected terminal session available')
            return
        }
        for (const tab of targets) {
            this.sendRawToTab(tab, payload)
        }
        this.notifications.notice('Sent script to terminal')
    }

    private wrapScript (script: string, scriptType: 'python' | 'bash' | 'sh'): string {
        const delimiter = this.getHeredocDelimiter(script)
        const trimmed = script.endsWith('\n') ? script.slice(0, -1) : script
        let interpreter = 'sh -s'
        if (scriptType === 'python') {
            interpreter = 'python3 -'
        } else if (scriptType === 'bash') {
            interpreter = 'bash -s'
        }
        return `${interpreter} <<'${delimiter}'\n${trimmed}\n${delimiter}\n`
    }

    private getHeredocDelimiter (script: string): string {
        let delimiter = 'TLINK_EOF'
        while (script.includes(delimiter)) {
            delimiter = `${delimiter}_X`
        }
        return delimiter
    }

    private sendRawToTab (tab: BaseTerminalTabComponent<any>, payload: string): void {
        const normalized = payload.replace(/\r\n/g, '\n').replace(/\n/g, '\r')
        tab.sendInput(normalized)
    }
}
