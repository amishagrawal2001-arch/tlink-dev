import { AppService, ProfilesService, SelectorService, TabsService } from 'tlink-core';
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component';
/** @hidden */
export declare class TerminalToolbarComponent {
    private app;
    private profiles;
    private selector;
    private tabs;
    tab: BaseTerminalTabComponent<any>;
    constructor(app: AppService, profiles: ProfilesService, selector: SelectorService, tabs: TabsService);
    onTabDragStart(): void;
    onTabDragEnd(): void;
    get shouldShowDragHandle(): boolean;
    onMouseEnter(): void;
    onMouseLeave(): void;
    newWithProfile(): Promise<void>;
}
