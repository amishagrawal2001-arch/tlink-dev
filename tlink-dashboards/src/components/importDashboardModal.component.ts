import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { ImportPreview, SourceResolution } from '../services/dashboardsImportExport.service'

/**
 * Preview an about-to-be-imported dashboard. Lists every tile with a
 * ✓ / ✗ against local profiles. Unresolved tiles still import — they
 * render in the M4.2a "profile not found" error state at runtime, and
 * can be re-pointed via the editor later.
 *
 * The caller supplies an `ImportPreview` built by
 * `DashboardsImportExportService.readImportFile()`. Save dispatches
 * `commitImport()` via the caller.
 */
@Component({
    selector: 'import-dashboard-modal',
    templateUrl: './importDashboardModal.component.pug',
    styleUrls: ['./importDashboardModal.component.scss'],
})
export class ImportDashboardModalComponent {
    @Input() preview!: ImportPreview

    constructor (
        private readonly modal: NgbActiveModal,
    ) { }

    get unmatchedCount (): number {
        return this.preview.resolutions.filter(r => !r.matched).length
    }

    trackByTileId (_i: number, r: SourceResolution): string {
        return r.tileId
    }

    confirm (): void {
        this.modal.close(true)
    }

    cancel (): void {
        this.modal.dismiss()
    }
}
