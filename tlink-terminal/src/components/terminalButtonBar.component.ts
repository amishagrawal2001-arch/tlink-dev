import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { firstValueFrom } from 'rxjs'
import { ConfigService, NotificationsService, PlatformService, MenuItemOptions, ProfilesService } from 'tlink-core'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'
import type { TerminalButtonBarButton, TerminalButtonBarAction } from '../api/interfaces'
import { MapButtonModalComponent } from './mapButtonModal.component'

type ButtonToken = { type: 'text', value: string } | { type: 'pause', ms: number }

/** @hidden */
@Component({
    selector: 'terminal-button-bar',
    templateUrl: './terminalButtonBar.component.pug',
    styleUrls: ['./terminalButtonBar.component.scss'],
})
export class TerminalButtonBarComponent {
    @Input() tab: BaseTerminalTabComponent<any>

    constructor (
        public config: ConfigService,
        private notifications: NotificationsService,
        private platform: PlatformService,
        private ngbModal: NgbModal,
        private profiles: ProfilesService,
    ) { }

    trackByIndex (_index: number): number {
        return _index
    }

    get buttons (): TerminalButtonBarButton[] {
        return this.config.store.terminal.buttonBar.buttons ?? []
    }

    get isEnabled (): boolean {
        return this.config.store.terminal.buttonBar.enabled
    }

    getButtonLabel (button: TerminalButtonBarButton): string {
        const label = (button.label ?? '').trim()
        if (label.length) {
            return label
        }
        const command = (button.command ?? '').trim()
        if (command.length) {
            return command.split('\n')[0]
        }
        return 'Command'
    }

    getButtonClass (button: TerminalButtonBarButton): string {
        const color = button.color || 'default'
        if (color === 'default') {
            return 'btn-outline-secondary'
        }
        return `btn-outline-${color}`
    }

    getDotClass (button: TerminalButtonBarButton): string {
        const color = button.color || 'default'
        return `dot-${color}`
    }

    getTooltip (button: TerminalButtonBarButton): string|null {
        if (button.disableTooltip) {
            return null
        }
        const description = (button.description ?? '').trim()
        if (description.length) {
            return description
        }
        const command = (button.command ?? '').trim()
        return command.length ? command : null
    }

    openContextMenu (event: MouseEvent, button?: TerminalButtonBarButton): void {
        event.preventDefault()
        event.stopPropagation()
        const menu: MenuItemOptions[] = [
            {
                label: 'Add button',
                click: () => this.openMapButton(),
            },
        ]
        if (button) {
            menu.push(
                { type: 'separator' },
                {
                    label: 'Edit button',
                    click: () => this.openMapButton(button),
                },
                {
                    label: 'Delete button',
                    click: () => this.deleteButton(button),
                },
            )
        }
        this.platform.popupContextMenu(menu, event)
    }

    async openMapButton (button?: TerminalButtonBarButton): Promise<void> {
        const modal = this.ngbModal.open(MapButtonModalComponent, { size: 'lg' })
        modal.componentInstance.button = button ?? null
        let result: TerminalButtonBarButton | null = null
        try {
            result = await modal.result
        } catch {
            return
        }
        if (!result) {
            return
        }
        if (button) {
            Object.assign(button, result)
        } else {
            this.config.store.terminal.buttonBar.buttons.push(result)
        }
        this.config.save()
    }

    deleteButton (button: TerminalButtonBarButton): void {
        this.config.store.terminal.buttonBar.buttons =
            this.config.store.terminal.buttonBar.buttons.filter(candidate => candidate !== button)
        this.config.save()
    }

    async sendButton (button: TerminalButtonBarButton): Promise<void> {
        if (!this.tab) {
            return
        }
        const action = this.getAction(button)
        if (action === 'run-script') {
            await this.runScript(button)
            return
        }
        if (action === 'run-local') {
            await this.runLocalScript(button)
            return
        }

        const command = button.command ?? ''
        if (!command.trim()) {
            this.notifications.notice('Button has no command')
            return
        }
        if (!this.tab.session?.open) {
            this.notifications.error('No connected terminal session available')
            return
        }

        const tokens = this.parseCommand(command)
        if (button.appendEnter !== false) {
            this.appendEnter(tokens)
        }
        if (!tokens.length) {
            this.notifications.notice('Button has no command')
            return
        }
        await this.sendTokens(tokens)
    }

    private getAction (button: TerminalButtonBarButton): TerminalButtonBarAction {
        const action = button.action ?? 'send-string'
        if (action === 'send-string') {
            const scriptType = this.detectScriptType(
                this.normalizeScript(button.command ?? ''),
                button.sourceFileName ?? '',
            )
            if (scriptType !== 'raw') {
                return 'run-script'
            }
        }
        return action
    }

    private async runScript (button: TerminalButtonBarButton): Promise<void> {
        const script = this.normalizeScript(button.command ?? '')
        if (!script.trim()) {
            this.notifications.notice('Script is empty')
            return
        }
        if (!this.tab.session?.open) {
            this.notifications.error('No connected terminal session available')
            return
        }

        await this.executeScriptOnTab(this.tab, button, script)
    }

    private async runLocalScript (button: TerminalButtonBarButton): Promise<void> {
        const script = this.normalizeScript(button.command ?? '')
        if (!script.trim()) {
            this.notifications.notice('Script is empty')
            return
        }

        const profiles = await this.profiles.getProfiles({ includeBuiltin: true })
        const localProfile = profiles.find(profile => profile.type === 'local')
        if (!localProfile) {
            this.notifications.error('No local profile available')
            return
        }

        const tab = await this.profiles.openNewTabForProfile(localProfile)
        if (!(tab instanceof BaseTerminalTabComponent)) {
            this.notifications.error('Could not open local terminal')
            return
        }

        if (!tab.frontendIsReady) {
            try {
                await firstValueFrom(tab.frontendReady)
            } catch {
                this.notifications.error('Local terminal not ready')
                return
            }
        }

        await this.executeScriptOnTab(tab, button, script)
    }

    private parseCommand (command: string): ButtonToken[] {
        const tokens: ButtonToken[] = []
        let buffer = ''
        for (let i = 0; i < command.length; i++) {
            const char = command[i]
            if (char === '\\' && i + 1 < command.length) {
                const next = command[i + 1]
                switch (next) {
                    case 'r':
                        buffer += '\r'
                        i++
                        break
                    case 'n':
                        buffer += '\n'
                        i++
                        break
                    case 't':
                        buffer += '\t'
                        i++
                        break
                    case 'e':
                        buffer += '\x1b'
                        i++
                        break
                    case 'b':
                        buffer += '\b'
                        i++
                        break
                    case 'v':
                        buffer += this.platform.readClipboard() ?? ''
                        i++
                        break
                    case 'p':
                        if (buffer.length) {
                            tokens.push({ type: 'text', value: buffer })
                            buffer = ''
                        }
                        tokens.push({ type: 'pause', ms: 1000 })
                        i++
                        break
                    case '\\':
                        buffer += '\\'
                        i++
                        break
                    default:
                        buffer += next
                        i++
                        break
                }
                continue
            }
            buffer += char
        }

        if (buffer.length) {
            tokens.push({ type: 'text', value: buffer })
        }
        return tokens
    }

    private appendEnter (tokens: ButtonToken[]): void {
        let lastTextToken: Extract<ButtonToken, { type: 'text' }> | null = null
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i]
            if (token.type === 'text') {
                lastTextToken = token
                break
            }
        }

        if (!lastTextToken) {
            tokens.push({ type: 'text', value: '\r' })
            return
        }

        const lastValue = lastTextToken.value
        if (!lastValue.endsWith('\r') && !lastValue.endsWith('\n')) {
            lastTextToken.value += '\r'
        }
    }

    private async sendTokens (tokens: ButtonToken[]): Promise<void> {
        await this.sendTokensToTab(this.tab, tokens)
    }

    private async sendTokensToTab (tab: BaseTerminalTabComponent<any>, tokens: ButtonToken[]): Promise<void> {
        for (const token of tokens) {
            if (token.type === 'pause') {
                await this.sleep(token.ms)
            } else if (token.value.length) {
                tab.sendInput(token.value)
            }
        }
    }

    private async sleep (ms: number): Promise<void> {
        await new Promise<void>(resolve => {
            setTimeout(resolve, ms)
        })
    }

    private async executeScriptOnTab (
        tab: BaseTerminalTabComponent<any>,
        button: TerminalButtonBarButton,
        script: string,
    ): Promise<void> {
        const scriptType = this.detectScriptType(script, button.sourceFileName ?? '')
        if (scriptType !== 'raw') {
            const payload = this.wrapScript(script, scriptType, button.scriptArgs ?? '')
            await this.sendRawToTab(tab, payload)
            return
        }

        const lines = script.split('\n')
        for (const line of lines) {
            if (!line.trim()) {
                continue
            }
            const tokens = this.parseCommand(line)
            if (button.appendEnter !== false) {
                this.appendEnter(tokens)
            }
            await this.sendTokensToTab(tab, tokens)
        }
    }

    private normalizeScript (script: string): string {
        return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    }

    private detectScriptType (script: string, fileName: string): 'python' | 'bash' | 'sh' | 'raw' {
        const loweredName = fileName.trim().toLowerCase()
        if (loweredName.endsWith('.py')) {
            return 'python'
        }
        if (loweredName.endsWith('.bash') || loweredName.endsWith('.bashrc')) {
            return 'bash'
        }
        if (loweredName.endsWith('.sh')) {
            return 'sh'
        }
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

    private wrapScript (script: string, scriptType: 'python' | 'bash' | 'sh', scriptArgs: string): string {
        const delimiter = this.getHeredocDelimiter(script)
        const trimmed = script.endsWith('\n') ? script.slice(0, -1) : script
        const interpreter = this.buildInterpreterCommand(scriptType, scriptArgs)
        return `${interpreter} <<'${delimiter}'\n${trimmed}\n${delimiter}\n`
    }

    private buildInterpreterCommand (
        scriptType: 'python' | 'bash' | 'sh',
        scriptArgs: string,
    ): string {
        const args = scriptArgs.trim()
        if (scriptType === 'python') {
            return args ? `python3 - ${args}` : 'python3 -'
        }
        if (scriptType === 'bash') {
            return args ? `bash -s -- ${args}` : 'bash -s'
        }
        return args ? `sh -s -- ${args}` : 'sh -s'
    }

    private getHeredocDelimiter (script: string): string {
        let delimiter = 'TLINK_EOF'
        while (script.includes(delimiter)) {
            delimiter = `${delimiter}_X`
        }
        return delimiter
    }

    private async sendRawToTab (tab: BaseTerminalTabComponent<any>, payload: string): Promise<void> {
        const normalized = payload.replace(/\r\n/g, '\n').replace(/\n/g, '\r')
        tab.sendInput(normalized)
    }
}
