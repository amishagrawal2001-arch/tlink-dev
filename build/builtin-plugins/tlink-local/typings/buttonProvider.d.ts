import { ToolbarButtonProvider, ToolbarButton, TranslateService, ProfilesService, SelectorService, AppService } from 'tlink-core';
import { TerminalService } from './services/terminal.service';
/** @hidden */
export declare class ButtonProvider extends ToolbarButtonProvider {
    private terminal;
    private profiles;
    private selector;
    private app;
    private translate;
    constructor(terminal: TerminalService, profiles: ProfilesService, selector: SelectorService, app: AppService, translate: TranslateService);
    provide(): ToolbarButton[];
}
