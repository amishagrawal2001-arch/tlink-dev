import { Component, HostBinding, InjectFlags, Injector } from '@angular/core'
import { X11Socket } from '../session/x11'
import { ConfigService, HostAppService, NotificationsService, Platform } from 'tlink-core'
import { SSHProfileImporter } from '../api/importer'

/** @hidden */
@Component({
    templateUrl: './sshSettingsTab.component.pug',
})
export class SSHSettingsTabComponent {
    Platform = Platform
    defaultX11Display: string
    reimporting = false
    lastImportInfo: { count: number, time: string } | null = null

    @HostBinding('class.content-box') true

    private importers: SSHProfileImporter[] = []

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        private injector: Injector,
        private notifications: NotificationsService,
    ) {
        const spec = X11Socket.resolveDisplaySpec()
        if ('path' in spec) {
            this.defaultX11Display = spec.path
        } else {
            this.defaultX11Display = `${spec.host}:${spec.port}`
        }

        this.importers = this.injector.get<SSHProfileImporter[]>(SSHProfileImporter as any, [], InjectFlags.Optional)

        // Show last import info from the OpenSSH importer
        for (const importer of this.importers) {
            if ((importer as any).lastImportedAt) {
                this.lastImportInfo = {
                    count: (importer as any).lastImportedCount ?? 0,
                    time: (importer as any).lastImportedAt?.toLocaleTimeString() ?? '',
                }
            }
        }
    }

    async reimportSSHConfig (): Promise<void> {
        if (this.reimporting) {
            return
        }
        this.reimporting = true
        let totalCount = 0
        try {
            for (const importer of this.importers) {
                const profiles = await importer.getProfiles()
                totalCount += profiles.length
            }
            this.lastImportInfo = {
                count: totalCount,
                time: new Date().toLocaleTimeString(),
            }
            this.notifications.info(`Imported ${totalCount} SSH hosts from config`)
            // Trigger a config save to refresh the profile list in the UI
            this.config.save()
        } catch (error: any) {
            this.notifications.error('Failed to import: ' + (error?.message ?? ''))
        } finally {
            this.reimporting = false
        }
    }
}
