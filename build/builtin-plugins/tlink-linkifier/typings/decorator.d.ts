import { ConfigService, PlatformService } from 'tlink-core';
import { TerminalDecorator, BaseTerminalTabComponent } from 'tlink-terminal';
import { LinkHandler } from './api';
export declare class LinkHighlighterDecorator extends TerminalDecorator {
    private config;
    private platform;
    private handlers;
    constructor(config: ConfigService, platform: PlatformService, handlers: LinkHandler[]);
    attach(tab: BaseTerminalTabComponent<any>): void;
    private willHandleEvent;
}
