import { Injectable } from '@angular/core';
import { SettingsTabProvider } from 'tlink-settings';
import { TabbyServerSettingsTabComponent } from '../../components/settings/tabby-server-settings-tab.component';

@Injectable()
export class TabbyServerSettingsTabProvider extends SettingsTabProvider {
    id = 'tabby-server';
    icon = 'fa fa-wrench';
    title = 'Tabby Server';

    getComponentType(): any {
        return TabbyServerSettingsTabComponent;
    }
}
