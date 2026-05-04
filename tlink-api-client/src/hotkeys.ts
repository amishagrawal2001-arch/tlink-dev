import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tlink-core'

/** @hidden */
@Injectable()
export class APIClientHotkeyProvider extends HotkeyProvider {
    hotkeys: HotkeyDescription[] = [
        {
            id: 'api-client.send',
            name: this.translate.instant('Send API request'),
        },
        {
            id: 'api-client.save',
            name: this.translate.instant('Save API request to collection'),
        },
        {
            id: 'api-client.focus-url',
            name: this.translate.instant('Focus API URL bar'),
        },
        {
            id: 'api-client.toggle-history',
            name: this.translate.instant('Toggle API request history'),
        },
        {
            id: 'api-client.find',
            name: this.translate.instant('Find in API response'),
        },
        {
            id: 'api-client.cancel',
            name: this.translate.instant('Cancel in-flight API request'),
        },
        {
            id: 'api-client.import-curl',
            name: this.translate.instant('Import cURL into API client'),
        },
        {
            id: 'api-client.help',
            name: this.translate.instant('Open API client help'),
        },
    ]

    constructor (private translate: TranslateService) { super() }

    async provide (): Promise<HotkeyDescription[]> {
        return this.hotkeys
    }
}
