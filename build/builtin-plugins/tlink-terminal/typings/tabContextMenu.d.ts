import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BaseTabComponent as CoreBaseTabComponent, TabContextMenuItemProvider as CoreTabContextMenuItemProvider, NotificationsService, MenuItemOptions, TranslateService, ConfigService, HostAppService, PlatformService, SessionSharingService, LogService, SelectorService } from 'tlink-core';
import { TerminalContextMenuItemProvider } from './api/contextMenuProvider';
import { MultifocusService } from './services/multifocus.service';
declare const TabContextMenuItemProviderRuntime: typeof CoreTabContextMenuItemProvider;
/** @hidden */
export declare class CopyPasteContextMenu extends TabContextMenuItemProviderRuntime {
    private notifications;
    private translate;
    weight: number;
    constructor(notifications: NotificationsService, translate: TranslateService);
    getItems(tab: CoreBaseTabComponent, tabHeader?: boolean): Promise<MenuItemOptions[]>;
}
/** @hidden */
export declare class MiscContextMenu extends TabContextMenuItemProviderRuntime {
    private translate;
    private multifocus;
    weight: number;
    constructor(translate: TranslateService, multifocus: MultifocusService);
    getItems(tab: CoreBaseTabComponent): Promise<MenuItemOptions[]>;
}
/** @hidden */
export declare class ReconnectContextMenu extends TabContextMenuItemProviderRuntime {
    private translate;
    private notifications;
    weight: number;
    constructor(translate: TranslateService, notifications: NotificationsService);
    getItems(tab: CoreBaseTabComponent): Promise<MenuItemOptions[]>;
}
/** @hidden */
export declare class LegacyContextMenu extends TabContextMenuItemProviderRuntime {
    protected contextMenuProviders: TerminalContextMenuItemProvider[] | null;
    weight: number;
    constructor(contextMenuProviders: TerminalContextMenuItemProvider[] | null);
    getItems(tab: CoreBaseTabComponent): Promise<MenuItemOptions[]>;
}
/** @hidden */
export declare class SessionSharingContextMenu extends TabContextMenuItemProviderRuntime {
    private sessionSharing;
    private ngbModal;
    private notifications;
    private translate;
    private selector;
    weight: number;
    private logger;
    constructor(sessionSharing: SessionSharingService, ngbModal: NgbModal, notifications: NotificationsService, translate: TranslateService, selector: SelectorService, log: LogService);
    getItems(tab: CoreBaseTabComponent): Promise<MenuItemOptions[]>;
    private shareWithMode;
}
/** @hidden */
export declare class SaveAsProfileContextMenu extends TabContextMenuItemProviderRuntime {
    private config;
    private ngbModal;
    private notifications;
    private translate;
    private hostApp;
    private platform;
    constructor(config: ConfigService, ngbModal: NgbModal, notifications: NotificationsService, translate: TranslateService, hostApp: HostAppService, platform: PlatformService);
    getItems(tab: CoreBaseTabComponent): Promise<MenuItemOptions[]>;
}
export {};
