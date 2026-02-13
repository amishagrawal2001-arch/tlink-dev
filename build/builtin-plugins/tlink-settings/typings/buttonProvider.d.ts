import { ToolbarButton, AppService, HostAppService, HotkeysService, TranslateService } from 'tlink-core';
declare const ToolbarButtonProvider: any;
/** @hidden */
export declare class ButtonProvider extends ToolbarButtonProvider {
    private app;
    private translate;
    constructor(hostApp: HostAppService, hotkeys: HotkeysService, app: AppService, translate: TranslateService);
    provide(): ToolbarButton[];
    open(): void;
}
export {};
