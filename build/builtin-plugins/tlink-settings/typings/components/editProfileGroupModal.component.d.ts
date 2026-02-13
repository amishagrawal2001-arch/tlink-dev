import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigProxy, ProfileGroup, Profile, ProfileProvider, PlatformService, TranslateService } from 'tlink-core';
/** @hidden */
export declare class EditProfileGroupModalComponent<G extends ProfileGroup> {
    private modalInstance;
    private platform;
    private translate;
    group: G & ConfigProxy;
    providers: ProfileProvider<Profile>[];
    constructor(modalInstance: NgbActiveModal, platform: PlatformService, translate: TranslateService);
    save(): void;
    cancel(): void;
    editDefaults(provider: ProfileProvider<Profile>): void;
    deleteDefaults(provider: ProfileProvider<Profile>): Promise<void>;
}
export interface EditProfileGroupModalComponentResult<G extends ProfileGroup> {
    group: G;
    provider?: ProfileProvider<Profile>;
}
