import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tlink-core'

/** @hidden */
@Injectable()
export class SerialHotkeyProvider extends HotkeyProvider {
    hotkeys: HotkeyDescription[] = [
        {
            id: 'serial',
            name: this.translate.instant('Show Serial connections'),
        },
        {
            id: 'restart-serial-session',
            name: this.translate.instant('Restart current serial session'),
        },
        {
            id: 'serial-snippets',
            name: this.translate.instant('Open network-vendor snippet picker (Serial)'),
        },
    ]

    constructor (private translate: TranslateService) { super() }

    async provide (): Promise<HotkeyDescription[]> {
        return this.hotkeys
    }
}
