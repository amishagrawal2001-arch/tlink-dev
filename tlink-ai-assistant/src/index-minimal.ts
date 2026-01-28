import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

// Tlink modules
import TlinkCorePlugin, { ToolbarButtonProvider, ConfigProvider, HotkeyProvider } from 'tlink-core';
import TlinkTerminalPlugin from 'tlink-terminal';
import { SettingsTabProvider } from 'tlink-settings';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TlinkCorePlugin,
        TlinkTerminalPlugin,
        NgbModule
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: (class {}), multi: true },
        { provide: SettingsTabProvider, useClass: (class {}), multi: true },
        { provide: ConfigProvider, useClass: (class {}), multi: true },
        { provide: HotkeyProvider, useClass: (class {}), multi: true }
    ],
    declarations: [],
    entryComponents: []
})
export default class AiAssistantModule {
    constructor() {
        console.log('AiAssistantModule initialized (minimal version)');
    }
}
