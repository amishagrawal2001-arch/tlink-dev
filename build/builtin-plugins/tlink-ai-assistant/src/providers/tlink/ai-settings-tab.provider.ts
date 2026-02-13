import { Injectable } from '@angular/core';
import { SettingsTabProvider } from 'tlink-settings';
import { AiSettingsTabComponent } from '../../components/settings/ai-settings-tab.component';

/**
 * Tlink settings page provider
 * Adds AI assistant settings page to Tlink
 */
@Injectable()
export class AiSettingsTabProvider extends SettingsTabProvider {
    id = 'ai-assistant';
    icon = 'fa fa-robot';
    title = 'AI Assistant';

    getComponentType(): any {
        return AiSettingsTabComponent;
    }
}
