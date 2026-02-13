import { HotkeysService, AppService } from 'tlink-core';
import { SettingsTabComponent } from './components/settingsTab.component';
import { ConfigSyncService } from './services/configSync.service';
/** @hidden */
export default class SettingsModule {
    configSync: ConfigSyncService;
    constructor(configSync: ConfigSyncService, app: AppService, hotkeys: HotkeysService);
}
export * from './api';
export { SettingsTabComponent };
export { EditProfileModalComponent } from './components/editProfileModal.component';
export { EditProfileGroupModalComponent, EditProfileGroupModalComponentResult } from './components/editProfileGroupModal.component';
