import { Component } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { BaseComponent as CoreBaseComponent, ConfigService, NotificationsService, PartialProfile, Profile, PartialProfileGroup, ProfileGroup, ProfilesService } from 'tlink-core'

// Fallback base class to avoid runtime crashes if the core export is undefined
const BaseComponent: any = CoreBaseComponent ?? class {}

type ProviderOption = {
    id: string
    name: string
    provider: any
}

@Component({
    templateUrl: './profileCreateModal.component.pug',
})
export class ProfileCreateModalComponent extends BaseComponent {
    providers: ProviderOption[] = []
    providerId = ''
    target = ''
    name = ''
    groupId = ''
    password = ''
    groups: PartialProfileGroup<ProfileGroup>[] = []

    constructor (
        private modalInstance: NgbActiveModal,
        private profiles: ProfilesService,
        private config: ConfigService,
        private notifications: NotificationsService,
    ) {
        super()
    }

    async ngOnInit (): Promise<void> {
        const providers = this.profiles.getProviders()
        this.providers = providers
            .filter(provider => typeof (provider as any).quickConnect === 'function')
            .map(provider => ({
                id: provider.id,
                name: provider.name,
                provider,
            }))

        this.providerId = this.providers.find(p => p.id === 'ssh')?.id ?? this.providers[0]?.id ?? ''

        this.groups = await this.profiles.getProfileGroups({ includeProfiles: false, includeNonUserGroup: true })
        if (this.groupId && !this.groups.find(g => g.id === this.groupId)) {
            // ensure preselected group (e.g., built-in) is shown in the dropdown
            this.groups.push({ id: this.groupId, name: this.groupId })
        }
    }

    cancel (): void {
        this.modalInstance.close(null)
    }

    async create (): Promise<void> {
        const provider = this.providers.find(p => p.id === this.providerId)
        if (!provider) {
            this.notifications.error('No connectable providers available')
            return
        }

        const target = this.target.trim()
        if (!target) {
            this.notifications.error('Target is required')
            return
        }

        const baseProfile = provider.provider.quickConnect(target) as PartialProfile<Profile> | null
        if (!baseProfile) {
            this.notifications.error('Could not parse target')
            return
        }

        const suggested = provider.provider.getSuggestedName?.(baseProfile) ?? null
        const name = this.name.trim() || suggested || baseProfile.name || target
        if (!name) {
            this.notifications.error('Profile name is required')
            return
        }

        const profile: PartialProfile<Profile> = {
            ...baseProfile,
            type: provider.id,
            name,
            options: baseProfile.options ?? {},
        }

        if (this.groupId) {
            profile.group = this.groupId
        }
        if (this.password.trim()) {
            profile.options = {
                ...(profile.options ?? {}),
                password: this.password.trim(),
            }
        }

        try {
            await this.profiles.newProfile(profile)
            await this.config.save()
            this.modalInstance.close(profile)
        } catch (error) {
            console.error('Failed to create profile', error)
            this.notifications.error('Failed to create profile')
        }
    }
}
