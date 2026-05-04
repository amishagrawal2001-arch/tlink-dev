import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tlink-core'

/** @hidden */
@Injectable()
export class SSHHotkeyProvider extends HotkeyProvider {
    hotkeys: HotkeyDescription[] = [
        {
            id: 'restart-ssh-session',
            name: this.translate.instant('Restart current SSH session'),
        },
        {
            id: 'launch-winscp',
            name: this.translate.instant('Launch WinSCP for current SSH session'),
        },
        {
            id: 'ssh-snippets',
            name: this.translate.instant('Open network-vendor snippet picker'),
        },
        {
            id: 'ssh-help',
            name: this.translate.instant('Open SSH tab help'),
        },
    ]

    constructor (private translate: TranslateService) { super() }

    async provide (): Promise<HotkeyDescription[]> {
        return this.hotkeys
    }
}
