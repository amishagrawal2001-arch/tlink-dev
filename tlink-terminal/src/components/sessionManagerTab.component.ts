import { Component, HostBinding, Inject, Injector } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import deepClone from 'clone-deep'
import { AppService, BaseTabComponent as CoreBaseTabComponent, MenuItemOptions, NotificationsService, PartialProfile, PartialProfileGroup, PlatformService, Profile, ProfileGroup, ProfileProvider, ProfilesService, PromptModalComponent, SidePanelService, SplitTabComponent, TranslateService } from 'tlink-core'
import { EditProfileGroupModalComponent, EditProfileGroupModalComponentResult, EditProfileModalComponent } from 'tlink-settings'
import { BaseTerminalTabComponent } from '../api/baseTerminalTab.component'

// Fallback base class to avoid runtime crashes if the core export is undefined
const BaseTabComponentRuntime: typeof CoreBaseTabComponent = (CoreBaseTabComponent ?? class extends (Object as any) {}) as typeof CoreBaseTabComponent
type BaseTabComponent = CoreBaseTabComponent

interface SessionConnection {
    id: string
    title: string
    detail: string
    protocol: string
    isOpen: boolean
    tab: BaseTerminalTabComponent<any>
}

type SessionProfileGroup = PartialProfileGroup<ProfileGroup> & {
    collapsed?: boolean
    profiles?: PartialProfile<Profile>[]
}

function generateId (): string {
    return Math.random().toString(36).slice(2, 10)
}

@Component({
    selector: 'session-manager-tab',
    templateUrl: './sessionManagerTab.component.pug',
    styleUrls: ['./sessionManagerTab.component.scss'],
})
export class SessionManagerTabComponent extends BaseTabComponentRuntime {
    @HostBinding('class.session-manager-tab') hostClass = true
    @HostBinding('class.session-manager-split') get isSplitHost (): boolean { return this.parent instanceof SplitTabComponent }

    filterText = ''
    profileGroups: SessionProfileGroup[] = []
    connections: SessionConnection[] = []
    filteredConnections: SessionConnection[] = []
    filteredGroups: SessionProfileGroup[] = []
    visibleGroups: SessionProfileGroup[] = []
    selectedProfileIds = new Set<string>()
    selectedGroupIds = new Set<string>()
    viewMode: 'all' | 'connections' | 'built-in' = 'all'
    activePanelId = 'session-manager'
    private lastPanelId = 'session-manager'

    private collapsedByGroupId: Record<string, boolean> = {}
    private connectionIdByTab = new WeakMap<BaseTerminalTabComponent<any>, string>()

    constructor (
        private app: AppService,
        private profiles: ProfilesService,
        private sidePanel: SidePanelService,
        private ngbModal: NgbModal,
        private notifications: NotificationsService,
        private platform: PlatformService,
        private translate: TranslateService,
        @Inject(ProfileProvider) private profileProviders: ProfileProvider<Profile>[],
        injector: Injector,
    ) {
        super(injector)
        this.setTitle('Session Manager')
    }

    ngOnInit (): void {
        this.refreshConnections()
        void this.refreshProfiles()
        this.subscribeUntilDestroyed(this.app.tabsChanged$, () => this.refreshConnections())
        this.subscribeUntilDestroyed(this.app.activeTabChange$, () => this.refreshConnections())
        this.subscribeUntilDestroyed(this.config.changed$, () => {
            void this.refreshProfiles()
        })
        this.subscribeUntilDestroyed(this.sidePanel.state$, state => {
            if (state.component !== SessionManagerTabComponent) {
                return
            }
            this.activePanelId = state.id || 'session-manager'
            if (state.id === 'active-connections') {
                this.viewMode = 'connections'
                if (this.lastPanelId !== this.activePanelId) {
                    this.lastPanelId = this.activePanelId
                    void this.refreshProfiles()
                }
                return
            }
            if (state.id === 'built-in-connections') {
                this.viewMode = 'built-in'
                if (this.lastPanelId !== this.activePanelId) {
                    this.lastPanelId = this.activePanelId
                    void this.refreshProfiles()
                }
                return
            }
            if (state.id === 'remote-desktop') {
                this.viewMode = 'built-in'
                if (this.lastPanelId !== this.activePanelId) {
                    this.lastPanelId = this.activePanelId
                    void this.refreshProfiles()
                }
                return
            }
            if (state.id === 'session-manager') {
                this.viewMode = 'all'
                if (this.lastPanelId !== this.activePanelId) {
                    this.lastPanelId = this.activePanelId
                    void this.refreshProfiles()
                }
                return
            }

            const mode = state.mode ?? 'all'
            if (mode === 'connections' || mode === 'built-in' || mode === 'all') {
                this.viewMode = mode
            } else {
                this.viewMode = 'all'
            }
            if (this.lastPanelId !== this.activePanelId) {
                this.lastPanelId = this.activePanelId
                void this.refreshProfiles()
            }
        })
    }

    get hasConnections (): boolean {
        return this.filteredConnections.length > 0
    }

    get hasProfiles (): boolean {
        return this.visibleGroups.some(group => (group.profiles?.length ?? 0) > 0)
    }

    get showConnections (): boolean {
        if (this.activePanelId === 'active-connections') {
            return true
        }
        if (this.isBuiltInPanel() || this.isRemoteDesktopPanel()) {
            return false
        }
        return this.viewMode === 'connections'
    }

    get showProfiles (): boolean {
        if (this.activePanelId === 'active-connections') {
            return false
        }
        if (this.isBuiltInPanel() || this.isRemoteDesktopPanel()) {
            return true
        }
        return this.viewMode !== 'connections'
    }

    get selectionCount (): number {
        return this.selectedProfiles.length + this.selectedGroups.length
    }

    get canEditSelection (): boolean {
        const profiles = this.selectedProfiles
        const groups = this.selectedGroups
        if (profiles.length === 1 && groups.length === 0) {
            return true
        }
        if (groups.length === 1 && profiles.length === 0) {
            return true
        }
        return false
    }

    clearFilter (): void {
        this.filterText = ''
        this.applyFilter()
    }

    onFilterTextChange (value: string): void {
        this.filterText = value
        this.applyFilter()
    }

    clearSelection (): void {
        this.selectedProfileIds.clear()
        this.selectedGroupIds.clear()
    }

    toggleGroup (group: SessionProfileGroup): void {
        group.collapsed = !group.collapsed
        this.collapsedByGroupId[group.id ?? ''] = group.collapsed ?? false
    }

    openGroupContextMenu (event: MouseEvent, group: SessionProfileGroup): void {
        event.preventDefault()
        event.stopPropagation()
        const canCreate = !!group && (group.editable || group.id === 'ungrouped')
        const canEdit = !!group?.editable
        const menu: MenuItemOptions[] = [
            {
                label: this.translate.instant('New profile'),
                enabled: canCreate,
                click: () => this.createProfile(group),
            },
            { type: 'separator' },
            {
                label: this.translate.instant('Edit group'),
                enabled: canEdit,
                click: () => this.editGroup(group),
            },
            {
                label: this.translate.instant('Delete group'),
                enabled: canEdit,
                click: () => this.deleteGroup(group),
            },
        ]
        this.platform.popupContextMenu(menu, event)
    }

    openProfileContextMenu (event: MouseEvent, profile: PartialProfile<Profile>): void {
        event.preventDefault()
        event.stopPropagation()
        const canEdit = !!profile && !profile.isBuiltin
        const menu: MenuItemOptions[] = [
            {
                label: this.translate.instant('Edit profile'),
                enabled: canEdit,
                click: () => this.editProfile(profile),
            },
            {
                label: this.translate.instant('Delete profile'),
                enabled: canEdit,
                click: () => this.deleteProfile(profile),
            },
        ]
        this.platform.popupContextMenu(menu, event)
    }

    selectGroup (group: SessionProfileGroup, event: MouseEvent): void {
        if (!group.editable || !group.id) {
            return
        }
        const multi = this.isMultiSelect(event)
        if (!multi) {
            this.clearSelection()
        }
        if (this.selectedGroupIds.has(group.id) && multi) {
            this.selectedGroupIds.delete(group.id)
        } else {
            this.selectedGroupIds.add(group.id)
        }
    }

    selectProfile (profile: PartialProfile<Profile>, event: MouseEvent): void {
        if (profile.isBuiltin || !profile.id) {
            return
        }
        const multi = this.isMultiSelect(event)
        if (!multi) {
            this.clearSelection()
        }
        if (this.selectedProfileIds.has(profile.id) && multi) {
            this.selectedProfileIds.delete(profile.id)
        } else {
            this.selectedProfileIds.add(profile.id)
        }
        if (!multi) {
            // Try to find and focus the existing tab, but don't open a new one
            const existing = this.findTabForProfile(profile)
            if (existing) {
                this.focusTab(existing)
                return
            }
            
            // If not found by profile matching, try the connections list as fallback
            this.refreshConnections()
            
            const matchingConnection = this.connections.find(conn => {
                const connProfile = (conn.tab.profile ?? null) as PartialProfile<Profile> | null
                if (!connProfile) {
                    return false
                }
                // Try exact ID match first
                if (connProfile.id === profile.id) {
                    return true
                }
                // Fallback to name and type match
                if (profile.name && profile.type && 
                    connProfile.name === profile.name && 
                    connProfile.type === profile.type) {
                    return true
                }
                // Also try matching by host/user for SSH profiles
                if (profile.type === 'ssh' && connProfile.type === 'ssh') {
                    const profileHost = profile.options?.host
                    const profileUser = profile.options?.user
                    const connHost = connProfile.options?.host
                    const connUser = connProfile.options?.user
                    if (profileHost && connHost && profileHost === connHost) {
                        if (!profileUser || !connUser || profileUser === connUser) {
                            return true
                        }
                    }
                }
                // Try matching by connection title containing profile name
                if (profile.name && conn.title?.toLowerCase().includes(profile.name.toLowerCase())) {
                    return true
                }
                return false
            })
            if (matchingConnection) {
                this.focusTab(matchingConnection.tab)
            }
        }
    }

    isGroupSelected (group: SessionProfileGroup): boolean {
        return !!group.id && this.selectedGroupIds.has(group.id)
    }

    isProfileSelected (profile: PartialProfile<Profile>): boolean {
        return !!profile.id && this.selectedProfileIds.has(profile.id)
    }

    focusConnection (connection: SessionConnection): void {
        const tab = this.findConnectionTab(connection)
        if (!tab) {
            return
        }
        this.focusTab(tab)
    }

    async openProfile (profile: PartialProfile<Profile>): Promise<void> {
        const existing = this.findTabForProfile(profile)
        if (existing) {
            this.focusTab(existing)
            return
        }
        await this.profiles.openNewTabForProfile(profile)
    }

    async editSelected (): Promise<void> {
        const profiles = this.selectedProfiles
        const groups = this.selectedGroups
        if (profiles.length === 1 && groups.length === 0) {
            await this.editProfile(profiles[0])
            return
        }
        if (groups.length === 1 && profiles.length === 0) {
            await this.editGroup(groups[0])
        }
    }

    async deleteSelected (): Promise<void> {
        const profiles = this.selectedProfiles
        const groups = this.selectedGroups
        if (!profiles.length && !groups.length) {
            return
        }

        const confirmMessage = this.translate.instant('Delete selected items?')
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: confirmMessage,
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response !== 0) {
            return
        }

        let deleteProfilesForGroups = false
        const groupsWithProfiles = groups.filter(group => (group.profiles?.length ?? 0) > 0)
        if (groupsWithProfiles.length > 0) {
            const response = await this.platform.showMessageBox({
                type: 'warning',
                message: this.translate.instant('Delete the group\'s profiles?'),
                buttons: [
                    this.translate.instant('Move to "Ungrouped"'),
                    this.translate.instant('Delete'),
                    this.translate.instant('Cancel'),
                ],
                defaultId: 0,
                cancelId: 2,
            })
            if (response.response === 2) {
                return
            }
            deleteProfilesForGroups = response.response === 1
        }

        const groupIds = new Set(groups.map(group => group.id))
        for (const profile of profiles) {
            if (deleteProfilesForGroups && profile.group && groupIds.has(profile.group)) {
                continue
            }
            await this.profiles.deleteProfile(profile)
        }

        for (const group of groups) {
            await this.profiles.deleteProfileGroup(group, { deleteProfiles: deleteProfilesForGroups })
        }

        await this.config.save()
        await this.refreshProfiles()
        this.clearSelection()
    }

    async editProfile (profile: PartialProfile<Profile>): Promise<void> {
        if (profile.isBuiltin) {
            return
        }
        const result = await this.showProfileEditModal(profile)
        if (!result) {
            return
        }
        await this.profiles.writeProfile(result)
        await this.config.save()
        await this.refreshProfiles()
    }

    async deleteProfile (profile: PartialProfile<Profile>): Promise<void> {
        if (profile.isBuiltin) {
            return
        }
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Delete "{name}"?', profile),
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response === 0) {
            await this.profiles.deleteProfile(profile)
            await this.config.save()
            await this.refreshProfiles()
        }
    }

    async editGroup (group: SessionProfileGroup): Promise<void> {
        if (!group.editable) {
            return
        }
        const result = await this.showProfileGroupEditModal(group)
        if (!result) {
            return
        }
        await this.profiles.writeProfileGroup(this.cleanProfileGroup(result))
        await this.config.save()
        await this.refreshProfiles()
    }

    async deleteGroup (group: SessionProfileGroup): Promise<void> {
        if (!group.editable) {
            return
        }
        if ((await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Delete "{name}"?', group),
                buttons: [
                    this.translate.instant('Delete'),
                    this.translate.instant('Keep'),
                ],
                defaultId: 1,
                cancelId: 1,
            },
        )).response !== 0) {
            return
        }

        let deleteProfiles = false
        if ((group.profiles?.length ?? 0) > 0 && (await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Delete the group\'s profiles?'),
                buttons: [
                    this.translate.instant('Move to "Ungrouped"'),
                    this.translate.instant('Delete'),
                ],
                defaultId: 0,
                cancelId: 0,
            },
        )).response !== 0) {
            deleteProfiles = true
        }

        await this.profiles.deleteProfileGroup(group, { deleteProfiles })
        await this.config.save()
        await this.refreshProfiles()
    }

    async createProfile (group?: SessionProfileGroup): Promise<void> {
        // Show profile selector with quick connect instead of just the create modal
        const profile = await this.profiles.showProfileSelector().catch(() => null)
        if (!profile) {
            return
        }

        // Determine target group: use passed group, or selected group, or null
        let targetGroup: SessionProfileGroup | null = group || null
        if (!targetGroup && this.selectedGroups.length === 1) {
            targetGroup = this.selectedGroups[0]
        }

        // If it's a quick connect profile (no ID), mark it for auto-save after connection
        const isQuickConnect = !profile.id
        const shouldAutoSave = isQuickConnect && targetGroup?.editable && targetGroup.id

        if (shouldAutoSave && targetGroup) {
            // Store the target group ID in the profile temporarily so we can save it after connection
            ;(profile as any).__autoSaveGroupId = targetGroup.id
            
            // Ensure profile has a name (quick connect usually sets name to query, but be safe)
            if (!profile.name || profile.name.trim() === '') {
                // Try to extract name from connection options
                const host = (profile as any).options?.host || 
                            (profile as any).options?.hostname ||
                            (profile as any).options?.address ||
                            'Quick Connect'
                profile.name = host
            }
        }

        // Open the profile connection - we'll save it after successful connection
        const tab = await this.profiles.openNewTabForProfile(profile)
        
        // If this is a quick connect profile that should be auto-saved, set up a listener
        if (shouldAutoSave && tab && targetGroup?.id) {
            // Wait for connection to be established, then save the profile
            this.autoSaveQuickConnectProfile(tab, profile, targetGroup.id)
        }
    }

    private async autoSaveQuickConnectProfile (tab: BaseTabComponent, profile: PartialProfile<Profile>, groupId: string): Promise<void> {
        // For SSH profiles, wait for the session to be ready and password to be saved
        if (profile.type === 'ssh') {
            try {
                // Get the SSH tab component
                const sshTab = tab as any
                if (sshTab.sshSession) {
                    // Wait for the session to be open/connected
                    // Check every 500ms for up to 10 seconds
                    let attempts = 0
                    const checkInterval = setInterval(async () => {
                        attempts++
                        if (sshTab.sshSession?.open || attempts > 20) {
                            clearInterval(checkInterval)
                            if (sshTab.sshSession?.open) {
                                // Connection established, wait a bit more to ensure password is saved
                                // Password is saved after session.open is set, so add a small delay
                                await new Promise(resolve => setTimeout(resolve, 1500))
                                
                                // Use the profile from the session
                                const sessionProfile = deepClone(sshTab.sshSession.profile)
                                
                                // CRITICAL: Ensure the profile has the authUsername that was used during authentication
                                // The password is saved with authUsername, so we need to match it
                                // This is essential for password retrieval on reconnect
                                if (sshTab.sshSession.authUsername) {
                                    // Always set the username to match what was used for password storage
                                    if (!sessionProfile.options) {
                                        sessionProfile.options = {}
                                    }
                                    sessionProfile.options.user = sshTab.sshSession.authUsername
                                }
                                
                                // CRITICAL: Ensure port is set (defaults to 22 if not specified)
                                // Password storage uses host:port as key, so port must match exactly
                                if (!sessionProfile.options.port) {
                                    sessionProfile.options.port = 22
                                }
                                
                                // Save the profile with correct username
                                this.saveQuickConnectProfile(sessionProfile, groupId)
                            }
                        }
                    }, 500)
                } else {
                    // Session not created yet, wait a bit and try again
                    setTimeout(() => this.autoSaveQuickConnectProfile(tab, profile, groupId), 1000)
                }
            } catch (err) {
                console.error('Error auto-saving quick connect profile:', err)
            }
        } else {
            // For other profile types (RDP, Telnet), save immediately
            this.saveQuickConnectProfile(profile, groupId)
        }
    }

    private async saveQuickConnectProfile (profile: PartialProfile<Profile>, groupId: string): Promise<void> {
        try {
            // Create a copy to avoid modifying the original
            const profileToSave = deepClone(profile)
            
            // Assign to the group
            profileToSave.group = groupId
            
            // Ensure profile has a name
            if (!profileToSave.name || profileToSave.name.trim() === '') {
                const host = (profileToSave as any).options?.host || 
                            (profileToSave as any).options?.hostname ||
                            (profileToSave as any).options?.address ||
                            'Quick Connect'
                profileToSave.name = host
            }
            
            // CRITICAL: Ensure options object exists and has the user field set
            // This is essential for password retrieval on reconnect
            if (!profileToSave.options) {
                profileToSave.options = {}
            }
            
            // For SSH profiles, ensure user and port are set correctly
            if (profileToSave.type === 'ssh') {
                // Ensure user is set (it should already be set from autoSaveQuickConnectProfile)
                if (!(profileToSave as any).options.user) {
                    // Fallback: try to get from the original profile
                    const originalUser = (profile as any).options?.user
                    if (originalUser) {
                        (profileToSave as any).options.user = originalUser
                    }
                }
                
                // Ensure port is set (defaults to 22 if not specified)
                // Password storage uses host:port as key, so port must match exactly
                if (!(profileToSave as any).options.port) {
                    (profileToSave as any).options.port = 22
                }
            }
            
            // Save the profile with auto-generated ID
            await this.profiles.newProfile(profileToSave)
            await this.config.save()
            
            // Refresh to show the new profile in the group
            await this.refreshProfiles()
        } catch (err) {
            console.error('Error saving quick connect profile:', err)
            this.notifications.error('Failed to save profile')
        }
    }

    async createGroup (): Promise<void> {
        const modal = this.ngbModal.open(PromptModalComponent)
        modal.componentInstance.prompt = 'New profile group name'
        const result = await modal.result.catch(() => null)
        const name = result?.value?.trim()
        if (!name) {
            return
        }

        const existing = (await this.profiles.getProfileGroups({ includeProfiles: false, includeNonUserGroup: false }))
            .find(group => group.name?.toLowerCase() === name.toLowerCase())
        if (existing) {
            this.notifications.error('Group already exists')
            return
        }

        try {
            await this.profiles.newProfileGroup({ id: '', name })
            await this.config.save()
            await this.refreshProfiles()
        } catch (error) {
            console.error('Failed to create profile group', error)
            this.notifications.error('Failed to create group')
        }
    }

    closePanel (): void {
        if (this.sidePanel.isShowing(SessionManagerTabComponent)) {
            this.sidePanel.hide()
            return
        }
        if (this.parent instanceof SplitTabComponent) {
            this.destroy()
            return
        }
        this.app.closeTab(this, true)
    }

    private async refreshProfiles (): Promise<void> {
        const panelState = this.sidePanel.getState()
        if (panelState.component === SessionManagerTabComponent && panelState.id) {
            this.activePanelId = panelState.id
        }
        const includeBuiltIn = this.isBuiltInPanel() || this.isRemoteDesktopPanel()
        const groups = await this.profiles.getProfileGroups({ includeProfiles: true, includeNonUserGroup: includeBuiltIn })
        const normalized = groups.map(group => ({
            ...group,
            name: group.id === 'built-in' ? 'Built-in Connections' : group.name,
            profiles: group.profiles ?? [],
            collapsed: this.collapsedByGroupId[group.id ?? ''] ?? false,
        }))
        if (this.isBuiltInPanel()) {
            this.profileGroups = normalized.filter(group => this.isBuiltInGroup(group))
        } else if (this.isRemoteDesktopPanel()) {
            this.profileGroups = normalized
        } else {
            this.profileGroups = normalized.filter(group => !this.isBuiltInGroup(group))
        }
        if (this.isRemoteDesktopPanel()) {
            this.profileGroups = this.profileGroups
                .map(group => ({
                    ...group,
                    profiles: (group.profiles ?? []).filter(profile => profile.type === 'rdp' && !profile.isBuiltin),
                }))
                .filter(group => (group.profiles?.length ?? 0) > 0)
        }
        this.pruneSelections()
        this.applyFilter()
    }

    private refreshConnections (): void {
        const terminals = this.getAllTerminalTabs()
        this.connections = terminals.map(tab => this.buildConnection(tab))
            .sort((a, b) => a.title.localeCompare(b.title))
        this.applyFilter()
    }

    private buildConnection (tab: BaseTerminalTabComponent<any>): SessionConnection {
        const profile = (tab.profile ?? null) as PartialProfile<Profile> | null
        const title = tab.title || profile?.name || 'Terminal'
        const host = profile?.options?.host ?? ''
        const user = profile?.options?.user ?? ''
        const detail = user && host ? `${user}@${host}` : (host || user || '')
        const protocol = profile?.type ?? 'terminal'
        return {
            id: this.getConnectionId(tab),
            title,
            detail,
            protocol,
            isOpen: !!tab.session?.open,
            tab,
        }
    }

    private isBuiltInGroup (group: SessionProfileGroup): boolean {
        if (group.id === 'ungrouped') {
            return false
        }
        if (group.editable !== true) {
            return true
        }
        if (group.id === 'built-in') {
            return true
        }
        return (group.profiles ?? []).some(profile => profile.isBuiltin)
    }

    private isBuiltInPanel (): boolean {
        return this.activePanelId === 'built-in-connections'
    }

    private isRemoteDesktopPanel (): boolean {
        return this.activePanelId === 'remote-desktop'
    }

    trackByConnection (_index: number, connection: SessionConnection): string {
        return connection.id
    }

    trackByGroup (index: number, group: SessionProfileGroup): string | number {
        return group.id ?? group.name ?? index
    }

    trackByProfile (index: number, profile: PartialProfile<Profile>): string | number {
        return profile.id ?? profile.name ?? index
    }

    private getAllTerminalTabs (): BaseTerminalTabComponent<any>[] {
        const expanded: BaseTabComponent[] = []
        for (const tab of this.app.tabs) {
            if (tab instanceof SplitTabComponent) {
                expanded.push(...tab.getAllTabs())
            } else {
                expanded.push(tab)
            }
        }
        return expanded.filter(tab => tab instanceof BaseTerminalTabComponent) as BaseTerminalTabComponent<any>[]
    }

    private findTabForProfile (profile: PartialProfile<Profile>): BaseTerminalTabComponent<any> | null {
        if (!profile?.id) {
            return null
        }
        const profileName = profile.name?.toLowerCase() ?? ''
        for (const tab of this.getAllTerminalTabs()) {
            const tabProfile = tab.profile as PartialProfile<Profile> | undefined
            if (!tabProfile) {
                // Try matching by tab title as last resort
                if (profileName && tab.title?.toLowerCase().includes(profileName)) {
                    return tab
                }
                continue
            }
            // First try exact ID match
            if (tabProfile.id === profile.id) {
                return tab
            }
            // Fallback: match by name and type if both are available
            if (profile.name && profile.type && 
                tabProfile.name === profile.name && 
                tabProfile.type === profile.type) {
                return tab
            }
            // For SSH profiles, also try matching by host and user
            if (profile.type === 'ssh' && tabProfile.type === 'ssh') {
                const profileHost = profile.options?.host
                const profileUser = profile.options?.user
                const tabHost = tabProfile.options?.host
                const tabUser = tabProfile.options?.user
                if (profileHost && tabHost && profileHost === tabHost) {
                    if (!profileUser || !tabUser || profileUser === tabUser) {
                        return tab
                    }
                }
            }
            // Also try matching by tab title containing profile name
            if (profileName && tab.title?.toLowerCase().includes(profileName)) {
                return tab
            }
        }
        return null
    }

    private focusTab (tab: BaseTabComponent): void {
        // Find the parent split tab if this tab is in a split pane
        const parent = this.app.getParentTab(tab)
        if (parent) {
            // Check if this tab is already focused in the split
            if (parent.getFocusedTab() === tab && this.app.activeTab === parent) {
                // Already focused, no need to do anything
                return
            }
            // If parent is already active, focus immediately
            if (this.app.activeTab === parent) {
                parent.focus(tab)
                return
            }
            // Otherwise, select the parent first, then focus after selection completes
            this.app.selectTab(parent)
            // Use setImmediate to ensure selectTab's setImmediate completes first
            setImmediate(() => {
                // Double-check the parent is still active and tab is still valid
                if (this.app.activeTab === parent && parent.getAllTabs().includes(tab)) {
                    parent.focus(tab)
                }
            })
            return
        }
        // For non-split tabs, just select them directly
        this.app.selectTab(tab)
    }

    private getConnectionId (tab: BaseTerminalTabComponent<any>): string {
        let id = this.connectionIdByTab.get(tab)
        if (!id) {
            id = generateId()
            this.connectionIdByTab.set(tab, id)
        }
        return id
    }

    private findConnectionTab (connection: SessionConnection): BaseTerminalTabComponent<any> | null {
        const tabs = this.getAllTerminalTabs()
        if (tabs.includes(connection.tab)) {
            return connection.tab
        }
        const match = tabs.find(tab => this.getConnectionId(tab) === connection.id)
        return match ?? null
    }

    private get normalizedFilter (): string {
        return this.filterText.trim().toLowerCase()
    }

    private matchesFilter (filter: string, candidates: string[]): boolean {
        return candidates.some(candidate => candidate.toLowerCase().includes(filter))
    }

    private profileMatchesFilter (profile: PartialProfile<Profile>, filter: string, groupMatches: boolean): boolean {
        if (groupMatches) {
            return true
        }
        const candidates = [
            profile.name ?? '',
            profile.group ?? '',
            profile.type ?? '',
            profile.options?.host ?? '',
            profile.options?.user ?? '',
        ]
        return this.matchesFilter(filter, candidates)
    }

    private applyFilter (): void {
        const filter = this.normalizedFilter
        if (!filter) {
            this.filteredConnections = this.connections
            this.filteredGroups = this.profileGroups
        } else {
            this.filteredConnections = this.connections.filter(connection => this.matchesFilter(filter, [
                connection.title,
                connection.detail,
                connection.protocol,
            ]))

            const filtered: SessionProfileGroup[] = []
            for (const group of this.profileGroups) {
                const groupMatches = this.matchesFilter(filter, [group.name ?? ''])
                const profiles = (group.profiles ?? []).filter(profile => this.profileMatchesFilter(profile, filter, groupMatches))
                if (profiles.length || groupMatches) {
                    filtered.push({
                        ...group,
                        profiles,
                        collapsed: this.collapsedByGroupId[group.id ?? ''] ?? group.collapsed ?? false,
                    })
                }
            }
            this.filteredGroups = filtered
        }

        if (this.isBuiltInPanel()) {
            this.visibleGroups = this.filteredGroups.filter(group => this.isBuiltInGroup(group))
        } else if (this.isRemoteDesktopPanel()) {
            this.visibleGroups = this.filteredGroups
        } else {
            this.visibleGroups = this.filteredGroups.filter(group => !this.isBuiltInGroup(group))
        }
        if (this.isRemoteDesktopPanel()) {
            this.visibleGroups = this.visibleGroups.filter(group => (group.profiles?.length ?? 0) > 0)
        }
    }

    private pruneSelections (): void {
        const groupIds = new Set(this.profileGroups.map(group => group.id))
        for (const id of Array.from(this.selectedGroupIds)) {
            if (!groupIds.has(id)) {
                this.selectedGroupIds.delete(id)
            }
        }

        const profileIds = new Set<string>()
        for (const group of this.profileGroups) {
            for (const profile of group.profiles ?? []) {
                if (profile.id) {
                    profileIds.add(profile.id)
                }
            }
        }
        for (const id of Array.from(this.selectedProfileIds)) {
            if (!profileIds.has(id)) {
                this.selectedProfileIds.delete(id)
            }
        }
    }

    private get selectedProfiles (): PartialProfile<Profile>[] {
        const results: PartialProfile<Profile>[] = []
        for (const group of this.profileGroups) {
            for (const profile of group.profiles ?? []) {
                if (profile.id && this.selectedProfileIds.has(profile.id)) {
                    results.push(profile)
                }
            }
        }
        return results
    }

    private get selectedGroups (): SessionProfileGroup[] {
        return this.profileGroups.filter(group => group.id && this.selectedGroupIds.has(group.id))
    }

    private isMultiSelect (event: MouseEvent): boolean {
        return event.metaKey || event.ctrlKey
    }

    private async showProfileEditModal (profile: PartialProfile<Profile>): Promise<PartialProfile<Profile> | null> {
        const provider = this.profiles.providerForProfile(profile)
        if (!provider) {
            this.notifications.error('Cannot edit a profile without a provider')
            return null
        }
        const modal = this.ngbModal.open(EditProfileModalComponent, { size: 'lg' })
        modal.componentInstance.profile = deepClone(profile)
        modal.componentInstance.profileProvider = provider

        const result = await modal.result.catch(() => null)
        if (!result) {
            return null
        }

        result.type = provider.id
        return result
    }

    private async showProfileGroupEditModal (group: SessionProfileGroup): Promise<SessionProfileGroup | null> {
        this.profileProviders.sort((a, b) => a.name.localeCompare(b.name))
        const modal = this.ngbModal.open(EditProfileGroupModalComponent, { size: 'lg' })
        modal.componentInstance.group = deepClone(group)
        modal.componentInstance.providers = this.profileProviders

        const result: EditProfileGroupModalComponentResult<ProfileGroup> | null = await modal.result.catch(() => null)
        if (!result) {
            return null
        }

        if (result.provider) {
            return this.editProfileGroupDefaults(result.group, result.provider)
        }

        return result.group
    }

    private async editProfileGroupDefaults (group: SessionProfileGroup, provider: ProfileProvider<Profile>): Promise<SessionProfileGroup | null> {
        const modal = this.ngbModal.open(EditProfileModalComponent, { size: 'lg' })
        const model = group.defaults?.[provider.id] ?? {}
        model.type = provider.id
        modal.componentInstance.profile = Object.assign({}, model)
        modal.componentInstance.profileProvider = provider
        modal.componentInstance.defaultsMode = 'group'

        const result = await modal.result.catch(() => null)
        if (result) {
            for (const key in model) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete model[key]
            }
            Object.assign(model, result)
            if (!group.defaults) {
                group.defaults = {}
            }
            group.defaults[provider.id] = model
        }

        return this.showProfileGroupEditModal(group)
    }

    private cleanProfileGroup (group: SessionProfileGroup): PartialProfileGroup<ProfileGroup> {
        const cleaned: any = { ...group }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete cleaned.profiles
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete cleaned.editable
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete cleaned.collapsed
        return cleaned
    }
}
