import { Component, HostBinding } from '@angular/core'
import { ConfigService, HostAppService, Platform, PlatformService, altKeyName, metaKeyName } from 'tlink-core'
import type { TerminalButtonBarButton } from '../api/interfaces'

/** @hidden */
@Component({
    templateUrl: './terminalSettingsTab.component.pug',
})
export class TerminalSettingsTabComponent {
    Platform = Platform
    altKeyName = altKeyName
    metaKeyName = metaKeyName
    buttonColors = [
        { value: 'default', label: 'Default' },
        { value: 'primary', label: 'Blue' },
        { value: 'success', label: 'Green' },
        { value: 'warning', label: 'Yellow' },
        { value: 'danger', label: 'Red' },
        { value: 'info', label: 'Teal' },
    ]
    buttonActions = [
        { value: 'send-string', label: 'Send String' },
        { value: 'run-script', label: 'Push Script (Device)' },
        { value: 'run-local', label: 'Run Script (Local)' },
    ]

    @HostBinding('class.content-box') true

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        private platform: PlatformService,
    ) { }

    ngOnInit (): void {
        this.normalizeButtons()
    }

    openWSLVolumeMixer (): void {
        this.platform.openPath('sndvol.exe')
        this.platform.exec('wsl.exe', ['tput', 'bel'])
    }

    trackByIndex (_index: number): number {
        return _index
    }

    addButton (): void {
        this.config.store.terminal.buttonBar.buttons.push({
            label: '',
            command: '',
            color: 'default',
            appendEnter: true,
            action: 'send-string',
            description: '',
            disableTooltip: false,
            scriptArgs: '',
        })
        this.config.save()
    }

    removeButton (button: TerminalButtonBarButton): void {
        this.config.store.terminal.buttonBar.buttons =
            this.config.store.terminal.buttonBar.buttons.filter(candidate => candidate !== button)
        this.config.save()
    }

    private normalizeButtons (): void {
        let changed = false
        for (const button of this.config.store.terminal.buttonBar.buttons) {
            if (!button.action) {
                button.action = 'send-string'
                changed = true
            }
            if (!button.color) {
                button.color = 'default'
                changed = true
            }
            if (button.appendEnter === undefined) {
                button.appendEnter = true
                changed = true
            }
            if (button.disableTooltip === undefined) {
                button.disableTooltip = false
                changed = true
            }
            if (button.description === undefined) {
                button.description = ''
                changed = true
            }
            if (button.scriptArgs === undefined) {
                button.scriptArgs = ''
                changed = true
            }
        }
        if (changed) {
            this.config.save()
        }
    }
}
