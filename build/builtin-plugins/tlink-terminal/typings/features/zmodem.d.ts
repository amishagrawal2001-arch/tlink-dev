import { TerminalDecorator } from '../api/decorator';
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component';
import { LogService, HotkeysService, PlatformService } from 'tlink-core';
/** @hidden */
export declare class ZModemDecorator extends TerminalDecorator {
    private log;
    private hotkeys;
    private platform;
    constructor(log: LogService, hotkeys: HotkeysService, platform: PlatformService);
    attach(terminal: BaseTerminalTabComponent<any>): void;
    private attachToSession;
}
