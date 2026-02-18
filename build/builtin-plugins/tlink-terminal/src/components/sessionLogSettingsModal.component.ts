import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { NotificationsService, PlatformService, TranslateService } from 'tlink-core'

/** @hidden */
@Component({
    templateUrl: './sessionLogSettingsModal.component.pug',
    styleUrls: ['./sessionLogSettingsModal.component.scss'],
})
export class SessionLogSettingsModalComponent {
    @Input() enabled = true
    @Input() directory = ''
    @Input() filenameTemplate = ''
    @Input() append = false
    @Input() canPickDirectory = false

    constructor (
        private modalInstance: NgbActiveModal,
        private platform: PlatformService,
        private notifications: NotificationsService,
        private translate: TranslateService,
    ) { }

    async browseDirectory (): Promise<void> {
        if (!this.canPickDirectory) {
            return
        }
        try {
            const directory = await this.platform.pickDirectory()
            if (directory) {
                this.directory = directory
            }
        } catch {
            this.notifications.error(this.translate.instant('Directory selection is not supported on this platform'))
        }
    }

    ok (): void {
        this.modalInstance.close({
            enabled: this.enabled,
            directory: this.directory,
            filenameTemplate: this.filenameTemplate,
            append: this.append,
        })
    }

    cancel (): void {
        this.modalInstance.dismiss()
    }
}
