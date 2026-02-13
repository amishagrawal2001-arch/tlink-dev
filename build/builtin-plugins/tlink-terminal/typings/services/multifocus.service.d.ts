import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component';
import { TranslateService, AppService, HotkeysService } from 'tlink-core';
export declare class MultifocusService {
    private app;
    private inputSubscription;
    private currentTab;
    private warningElement;
    constructor(app: AppService, hotkeys: HotkeysService, translate: TranslateService);
    start(currentTab: BaseTerminalTabComponent<any>, tabs: BaseTerminalTabComponent<any>[]): void;
    cancel(): void;
    focusAllTabs(): void;
    focusAllPanes(): void;
}
