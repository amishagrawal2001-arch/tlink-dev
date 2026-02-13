/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Observable, OperatorFunction, debounceTime, map, distinctUntilChanged } from 'rxjs'
import { Component, Input, ViewChild, ViewContainerRef, ComponentFactoryResolver, Injector } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { ConfigProxy, PartialProfileGroup, Profile, ProfileProvider, ProfileSettingsComponent, ProfilesService, TAB_COLORS, ProfileGroup, ConnectableProfileProvider, HostAppService, Platform, PlatformService, NotificationsService, TranslateService } from 'tlink-core'

const iconsData = require('../../../tlink-core/src/icons.json')
const iconsClassList = Object.keys(iconsData).map(
    icon => iconsData[icon].map(
        style => `fa${style[0]} fa-${icon}`,
    ),
).flat()

/** @hidden */
@Component({
    templateUrl: './editProfileModal.component.pug',
    styleUrls: ['./editProfileModal.component.scss'],
})
export class EditProfileModalComponent<P extends Profile> {
    @Input() profile: P & ConfigProxy
    @Input() profileProvider: ProfileProvider<P>
    @Input() settingsComponent: new () => ProfileSettingsComponent<P>
    @Input() defaultsMode: 'enabled'|'group'|'disabled' = 'disabled'
    @Input() profileGroup: PartialProfileGroup<ProfileGroup> | undefined
    groups: PartialProfileGroup<ProfileGroup>[]
    @ViewChild('placeholder', { read: ViewContainerRef }) placeholder: ViewContainerRef

    private _profile: Profile
    private settingsComponentInstance?: ProfileSettingsComponent<P>
    sessionLog = {
        enabled: false,
        directory: '',
        filenameTemplate: '',
        append: false,
    }

    constructor (
        private injector: Injector,
        private componentFactoryResolver: ComponentFactoryResolver,
        private profilesService: ProfilesService,
        private modalInstance: NgbActiveModal,
        private hostApp: HostAppService,
        private platform: PlatformService,
        private notifications: NotificationsService,
        private translate: TranslateService,
    ) {
        if (this.defaultsMode === 'disabled') {
            this.profilesService.getProfileGroups().then(groups => {
                this.groups = groups
                this.profileGroup = groups.find(g => g.id === this.profile.group)
            })
        }
    }

    colorsAutocomplete = text$ => text$.pipe(
        debounceTime(200),
        distinctUntilChanged(),
        map((q: string) =>
            TAB_COLORS
                .filter(x => !q || x.name.toLowerCase().startsWith(q.toLowerCase()))
                .map(x => x.value),
        ),
    )

    colorsFormatter = value => {
        return TAB_COLORS.find(x => x.value === value)?.name ?? value
    }

    ngOnInit () {
        this._profile = this.profile
        this.profile = this.profilesService.getConfigProxyForProfile(this.profile, { skipGlobalDefaults: this.defaultsMode === 'enabled', skipGroupDefaults: this.defaultsMode === 'group' })
        const sessionLog = this.profile.sessionLog
        this.sessionLog = {
            enabled: sessionLog?.enabled ?? false,
            directory: sessionLog?.directory ?? '',
            filenameTemplate: sessionLog?.filenameTemplate ?? '',
            append: sessionLog?.append ?? false,
        }
    }

    ngAfterViewInit () {
        const componentType = this.profileProvider.settingsComponent
        if (componentType) {
            setTimeout(() => {
                const componentFactory = this.componentFactoryResolver.resolveComponentFactory(componentType)
                const componentRef = componentFactory.create(this.injector)
                this.settingsComponentInstance = componentRef.instance
                this.settingsComponentInstance.profile = this.profile
                this.placeholder.insert(componentRef.hostView)
            })
        }
    }

    groupTypeahead: OperatorFunction<string, readonly PartialProfileGroup<ProfileGroup>[]> = (text$: Observable<string>) =>
        text$.pipe(
            debounceTime(200),
            distinctUntilChanged(),
            map(q => this.groups.filter(g => !q || g.name.toLowerCase().includes(q.toLowerCase()))),
        )

    groupFormatter = (g: PartialProfileGroup<ProfileGroup>) => g.name

    iconSearch: OperatorFunction<string, string[]> = (text$: Observable<string>) =>
        text$.pipe(
            debounceTime(200),
            map(term => iconsClassList.filter(v => v.toLowerCase().includes(term.toLowerCase())).slice(0, 10)),
        )

    get canPickLogDirectory (): boolean {
        return this.hostApp.platform !== Platform.Web
    }

    async chooseLogDirectory (): Promise<void> {
        try {
            const directory = await this.platform.pickDirectory()
            if (directory) {
                this.sessionLog.directory = directory
            }
        } catch (error) {
            this.notifications.error(this.translate.instant('Directory selection is not supported on this platform'))
        }
    }

    save () {
        if (!this.profileGroup) {
            this.profile.group = undefined
        } else {
            this.profile.group = this.profileGroup.id
        }

        const sessionLog = {
            enabled: this.sessionLog.enabled,
            append: this.sessionLog.append,
            directory: this.sessionLog.directory.trim() || undefined,
            filenameTemplate: this.sessionLog.filenameTemplate.trim() || undefined,
        }
        const hasSessionLogSettings = sessionLog.enabled || sessionLog.append || sessionLog.directory || sessionLog.filenameTemplate
        this.profile.sessionLog = hasSessionLogSettings ? sessionLog : undefined

        this.settingsComponentInstance?.save?.()
        this.profile.__cleanup()
        this.modalInstance.close(this._profile)
    }

    cancel () {
        this.modalInstance.dismiss()
    }

    isConnectable (): boolean {
        return this.profileProvider instanceof ConnectableProfileProvider
    }

}
