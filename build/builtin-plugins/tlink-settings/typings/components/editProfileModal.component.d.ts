import { OperatorFunction } from 'rxjs';
import { ViewContainerRef, ComponentFactoryResolver, Injector } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigProxy, PartialProfileGroup, Profile, ProfileProvider, ProfileSettingsComponent, ProfilesService, ProfileGroup, HostAppService, PlatformService, NotificationsService, TranslateService } from 'tlink-core';
/** @hidden */
export declare class EditProfileModalComponent<P extends Profile> {
    private injector;
    private componentFactoryResolver;
    private profilesService;
    private modalInstance;
    private hostApp;
    private platform;
    private notifications;
    private translate;
    profile: P & ConfigProxy;
    profileProvider: ProfileProvider<P>;
    settingsComponent: new () => ProfileSettingsComponent<P>;
    defaultsMode: 'enabled' | 'group' | 'disabled';
    profileGroup: PartialProfileGroup<ProfileGroup> | undefined;
    groups: PartialProfileGroup<ProfileGroup>[];
    placeholder: ViewContainerRef;
    private _profile;
    private settingsComponentInstance?;
    sessionLog: {
        enabled: boolean;
        directory: string;
        filenameTemplate: string;
        append: boolean;
    };
    constructor(injector: Injector, componentFactoryResolver: ComponentFactoryResolver, profilesService: ProfilesService, modalInstance: NgbActiveModal, hostApp: HostAppService, platform: PlatformService, notifications: NotificationsService, translate: TranslateService);
    colorsAutocomplete: (text$: any) => any;
    colorsFormatter: (value: any) => any;
    ngOnInit(): void;
    ngAfterViewInit(): void;
    groupTypeahead: OperatorFunction<string, readonly PartialProfileGroup<ProfileGroup>[]>;
    groupFormatter: (g: PartialProfileGroup<ProfileGroup>) => string;
    iconSearch: OperatorFunction<string, string[]>;
    get canPickLogDirectory(): boolean;
    chooseLogDirectory(): Promise<void>;
    save(): void;
    cancel(): void;
    isConnectable(): boolean;
}
