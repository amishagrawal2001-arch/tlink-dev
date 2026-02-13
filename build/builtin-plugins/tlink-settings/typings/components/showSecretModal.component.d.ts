import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { NotificationsService, VaultFileSecret } from 'tlink-core';
/** @hidden */
export declare class ShowSecretModalComponent {
    modalInstance: NgbActiveModal;
    private notifications;
    title: string;
    secret: VaultFileSecret;
    constructor(modalInstance: NgbActiveModal, notifications: NotificationsService);
    close(): void;
    copySecret(): void;
}
