import { OnDestroy, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService, PartialProfile, Profile, ProfilesService, SidePanelService, TranslateService, NotificationsService } from 'tlink-core';
export declare class ProfileColorsPanelComponent implements OnInit, OnDestroy {
    private profilesService;
    private config;
    private sidePanel;
    private modal;
    private translate;
    private notifications;
    filterText: string;
    profiles: PartialProfile<Profile>[];
    filteredProfiles: PartialProfile<Profile>[];
    palette: ({
        name: "No color";
        value: null;
    } | {
        name: "Blue";
        value: string;
    } | {
        name: "Green";
        value: string;
    } | {
        name: "Orange";
        value: string;
    } | {
        name: "Purple";
        value: string;
    } | {
        name: "Red";
        value: string;
    } | {
        name: "Yellow";
        value: string;
    })[];
    saving: Set<string>;
    loading: boolean;
    private destroy$;
    constructor(profilesService: ProfilesService, config: ConfigService, sidePanel: SidePanelService, modal: NgbModal, translate: TranslateService, notifications: NotificationsService);
    ngOnInit(): void;
    ngOnDestroy(): void;
    loadProfiles(): Promise<void>;
    applyFilter(): void;
    onFilterChange(value: string): void;
    quickApplyColor(profile: PartialProfile<Profile>, value: string): Promise<void>;
    openColorPicker(profile: PartialProfile<Profile>): Promise<void>;
    clearColor(profile: PartialProfile<Profile>): Promise<void>;
    isSaving(profile: PartialProfile<Profile>): boolean;
    groupLabel(profile: PartialProfile<Profile>): string;
    badgeColor(profile: PartialProfile<Profile>): string;
    closePanel(): void;
    private setColor;
}
