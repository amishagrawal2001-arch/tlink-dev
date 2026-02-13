import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService, NotificationsService, PartialProfileGroup, ProfileGroup, ProfilesService } from 'tlink-core';
declare const BaseComponent: any;
type ProviderOption = {
    id: string;
    name: string;
    provider: any;
};
export declare class ProfileCreateModalComponent extends BaseComponent {
    private modalInstance;
    private profiles;
    private config;
    private notifications;
    providers: ProviderOption[];
    providerId: string;
    target: string;
    name: string;
    groupId: string;
    password: string;
    groups: PartialProfileGroup<ProfileGroup>[];
    constructor(modalInstance: NgbActiveModal, profiles: ProfilesService, config: ConfigService, notifications: NotificationsService);
    ngOnInit(): Promise<void>;
    cancel(): void;
    create(): Promise<void>;
}
export {};
