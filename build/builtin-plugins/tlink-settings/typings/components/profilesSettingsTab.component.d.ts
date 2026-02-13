import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService, HostAppService, Profile, SelectorService, ProfilesService, PlatformService, PartialProfile, ProfileProvider, TranslateService, Platform, ProfileGroup, PartialProfileGroup, NotificationsService } from 'tlink-core';
declare const BaseComponent: any;
interface CollapsableProfileGroup extends ProfileGroup {
    collapsed: boolean;
}
/** @hidden */
export declare class ProfilesSettingsTabComponent extends BaseComponent {
    config: ConfigService;
    hostApp: HostAppService;
    profileProviders: ProfileProvider<Profile>[];
    private profilesService;
    private selector;
    private ngbModal;
    private platform;
    private translate;
    private notifications;
    builtinProfiles: PartialProfile<Profile>[];
    profiles: PartialProfile<Profile>[];
    templateProfiles: PartialProfile<Profile>[];
    customProfiles: PartialProfile<Profile>[];
    profileGroups: PartialProfileGroup<CollapsableProfileGroup>[];
    filter: string;
    Platform: typeof Platform;
    constructor(config: ConfigService, hostApp: HostAppService, profileProviders: ProfileProvider<Profile>[], profilesService: ProfilesService, selector: SelectorService, ngbModal: NgbModal, platform: PlatformService, translate: TranslateService, notifications: NotificationsService);
    ngOnInit(): Promise<void>;
    refreshProfiles(): Promise<void>;
    launchProfile(profile: PartialProfile<Profile>): void;
    newProfile(base?: PartialProfile<Profile>): Promise<void>;
    editProfile(profile: PartialProfile<Profile>): Promise<void>;
    showProfileEditModal(profile: PartialProfile<Profile>): Promise<PartialProfile<Profile> | null>;
    deleteProfile(profile: PartialProfile<Profile>): Promise<void>;
    get canPickLogDirectory(): boolean;
    setProfileLogDirectory(profile: PartialProfile<Profile>): Promise<void>;
    newProfileGroup(): Promise<void>;
    editProfileGroup(group: PartialProfileGroup<CollapsableProfileGroup>): Promise<void>;
    showProfileGroupEditModal(group: PartialProfileGroup<CollapsableProfileGroup>): Promise<PartialProfileGroup<CollapsableProfileGroup> | null>;
    private editProfileGroupDefaults;
    deleteProfileGroup(group: PartialProfileGroup<ProfileGroup>): Promise<void>;
    refreshProfileGroups(): Promise<void>;
    isGroupVisible(group: PartialProfileGroup<ProfileGroup>): boolean;
    isProfileVisible(profile: PartialProfile<Profile>): boolean;
    getDescription(profile: PartialProfile<Profile>): string | null;
    getTypeLabel(profile: PartialProfile<Profile>): string;
    getTypeColorClass(profile: PartialProfile<Profile>): string;
    toggleGroupCollapse(group: PartialProfileGroup<CollapsableProfileGroup>): void;
    editDefaults(provider: ProfileProvider<Profile>): Promise<void>;
    deleteDefaults(provider: ProfileProvider<Profile>): Promise<void>;
    blacklistProfile(profile: PartialProfile<Profile>): void;
    unblacklistProfile(profile: PartialProfile<Profile>): void;
    isProfileBlacklisted(profile: PartialProfile<Profile>): boolean;
    getQuickConnectProviders(): ProfileProvider<Profile>[];
    /**
    * Save ProfileGroup collapse state in localStorage
    */
    private saveProfileGroupCollapse;
    private getProfileGroupCollapsedState;
    private static collapsableIntoPartialProfileGroup;
    private static intoPartialCollapsableProfileGroup;
}
export {};
