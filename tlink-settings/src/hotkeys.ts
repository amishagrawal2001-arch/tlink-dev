import { Inject, Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider as CoreHotkeyProvider, TranslateService } from 'tlink-core'
import { SettingsTabProvider } from './api'

// Fallback base to avoid runtime crashes if the core export is undefined
const HotkeyProvider: any = CoreHotkeyProvider ?? class {}

/** @hidden */
@Injectable()
export class SettingsHotkeyProvider extends HotkeyProvider {
    hotkeys: HotkeyDescription[] = [
        {
            id: 'settings',
            name: this.translate.instant('Open Settings'),
        },
    ]

    constructor (
        private translate: TranslateService,
        @Inject(SettingsTabProvider) private settingsProviders: SettingsTabProvider[],
    ) { super() }

    async provide (): Promise<HotkeyDescription[]> {
        return [
            ...this.hotkeys,
            ...this.settingsProviders.map(provider => ({
                id: `settings-tab.${provider.id}`,
                name: this.translate.instant('Open settings tab: {tab}', { tab: provider.title }),
            })),
        ]
    }
}
