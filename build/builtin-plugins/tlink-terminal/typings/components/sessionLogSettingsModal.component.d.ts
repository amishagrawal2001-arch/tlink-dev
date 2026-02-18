import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { NotificationsService, PlatformService, TranslateService } from 'tlink-core';
/** @hidden */
export declare class SessionLogSettingsModalComponent {
    private modalInstance;
    private platform;
    private notifications;
    private translate;
    enabled: boolean;
    directory: string;
    filenameTemplate: string;
    append: boolean;
    canPickDirectory: boolean;
    constructor(modalInstance: NgbActiveModal, platform: PlatformService, notifications: NotificationsService, translate: TranslateService);
    browseDirectory(): Promise<void>;
    ok(): void;
    cancel(): void;
}
