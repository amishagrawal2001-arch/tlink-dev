import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Subject, takeUntil } from 'rxjs'
import deepClone from 'clone-deep'

import { ConfigService, PartialProfile, Profile, ProfilesService, SidePanelService, TAB_COLORS, TranslateService, NotificationsService } from 'tlink-core'
import { ColorPickerModalComponent } from 'tlink-core'

@Component({
    selector: 'profile-colors-panel',
    templateUrl: './profileColorsPanel.component.pug',
    styleUrls: ['./profileColorsPanel.component.scss'],
})
export class ProfileColorsPanelComponent implements OnInit, OnDestroy {
    filterText = ''
    profiles: PartialProfile<Profile>[] = []
    filteredProfiles: PartialProfile<Profile>[] = []
    palette = TAB_COLORS.filter(c => c.value)
    saving = new Set<string>()
    loading = true
    private destroy$ = new Subject<void>()

    constructor (
        private profilesService: ProfilesService,
        private config: ConfigService,
        private sidePanel: SidePanelService,
        private modal: NgbModal,
        private translate: TranslateService,
        private notifications: NotificationsService,
    ) { }

    ngOnInit (): void {
        void this.loadProfiles()
        this.config.changed$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            void this.loadProfiles()
        })
    }

    ngOnDestroy (): void {
        this.destroy$.next()
        this.destroy$.complete()
    }

    async loadProfiles (): Promise<void> {
        this.loading = true
        try {
            const list = await this.profilesService.getProfiles({ includeBuiltin: false, clone: true })
            this.profiles = list.filter(p => !p.isTemplate)
            this.applyFilter()
        } finally {
            this.loading = false
        }
    }

    applyFilter (): void {
        const query = this.filterText.trim().toLowerCase()
        const sorted = [...this.profiles].sort((a, b) => {
            const groupA = this.groupLabel(a).toLowerCase()
            const groupB = this.groupLabel(b).toLowerCase()
            if (groupA === groupB) {
                return (a.name ?? '').localeCompare(b.name ?? '')
            }
            return groupA.localeCompare(groupB)
        })

        this.filteredProfiles = sorted.filter(profile => {
            if (!query) {
                return true
            }
            const group = this.groupLabel(profile).toLowerCase()
            return (profile.name ?? '').toLowerCase().includes(query) || group.includes(query)
        })
    }

    onFilterChange (value: string): void {
        this.filterText = value
        this.applyFilter()
    }

    async quickApplyColor (profile: PartialProfile<Profile>, value: string): Promise<void> {
        await this.setColor(profile, value)
    }

    async openColorPicker (profile: PartialProfile<Profile>): Promise<void> {
        const modal = this.modal.open(ColorPickerModalComponent)
        modal.componentInstance.title = this.translate.instant('Profile color')
        modal.componentInstance.value = profile.color || '#3b82f6'
        modal.componentInstance.canReset = !!profile.color
        const result = await modal.result.catch(() => null)
        if (!result) {
            return
        }
        if (result.cleared) {
            await this.setColor(profile, null)
            return
        }
        const value = (result.value ?? '').trim()
        if (!value) {
            return
        }
        await this.setColor(profile, value)
    }

    async clearColor (profile: PartialProfile<Profile>): Promise<void> {
        await this.setColor(profile, null)
    }

    isSaving (profile: PartialProfile<Profile>): boolean {
        return this.saving.has(profile.id ?? '')
    }

    groupLabel (profile: PartialProfile<Profile>): string {
        if (profile.group) {
            return this.profilesService.resolveProfileGroupName(profile.group)
        }
        return this.translate.instant('Ungrouped')
    }

    badgeColor (profile: PartialProfile<Profile>): string {
        return profile.color || 'transparent'
    }

    closePanel (): void {
        this.sidePanel.hide()
    }

    private async setColor (profile: PartialProfile<Profile>, value: string|null): Promise<void> {
        const id = profile.id ?? ''
        if (!id) {
            return
        }
        if (this.isSaving(profile)) {
            return
        }
        this.saving.add(id)
        try {
            const updated = deepClone(profile)
            updated.color = value ?? null
            await this.profilesService.writeProfile(updated)
            await this.config.save()
            profile.color = updated.color
        } catch (error) {
            console.error(error)
            this.notifications.error(this.translate.instant('Could not update profile color'))
        } finally {
            this.saving.delete(id)
        }
    }
}
