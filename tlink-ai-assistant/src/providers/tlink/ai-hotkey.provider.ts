import { Injectable } from '@angular/core';
import { HotkeyProvider, HotkeyDescription, TranslateService } from 'tlink-core';
import { AiSidebarService } from '../../services/chat/ai-sidebar.service';

/**
 * Tlink hotkey provider
 * Adds AI assistant hotkey support to Tlink
 * 
 * Note: Hotkey IDs must match those defined in AiConfigProvider.defaults.hotkeys
 */
@Injectable()
export class AiHotkeyProvider extends HotkeyProvider {
    hotkeys: HotkeyDescription[] = [
        {
            id: 'ai-assistant-toggle',
            name: 'Open AI Assistant',
        },
        {
            id: 'ai-command-generation',
            name: 'Generate Command',
        },
        {
            id: 'ai-explain-command',
            name: 'Explain Command',
        }
    ];

    constructor(
        private sidebarService: AiSidebarService,
        private translate: TranslateService
    ) {
        super();
    }

    async provide(): Promise<HotkeyDescription[]> {
        return this.hotkeys;
    }
}

