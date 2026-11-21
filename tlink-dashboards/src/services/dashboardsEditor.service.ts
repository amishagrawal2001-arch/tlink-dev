import { Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Dashboard, DashboardTile, DashboardSourceRef } from '../api'
import { DashboardEditorModalComponent } from '../components/dashboardEditorModal.component'
import { normalizeDashboard, findFreeCell } from '../util/layout'

/**
 * Opens the dashboard editor modal. Uses a deep-cloned draft so Save
 * commits a full Dashboard and Cancel discards without ever mutating
 * `config.store.dashboards`. The caller is responsible for persisting
 * the returned draft via ConfigService.save().
 */
@Injectable({ providedIn: 'root' })
export class DashboardsEditorService {
    constructor (
        private readonly ngbModal: NgbModal,
    ) { }

    /** Edit an existing dashboard. Returns the saved draft, or null if cancelled. */
    async openForDashboard (source: Dashboard): Promise<Dashboard | null> {
        const normalized = normalizeDashboard(source)
        const draft: Dashboard = {
            ...normalized,
            tiles: normalized.tiles.map(t => ({ ...t, source: { ...t.source } })),
        }
        return this.openModal(draft, false)
    }

    /** Open the editor with an empty draft. Returns a new dashboard, or null if cancelled. */
    async openForNewDashboard (): Promise<Dashboard | null> {
        const now = Date.now().toString(36)
        const emptyTile: DashboardTile = {
            id: `tile-${now}`,
            type: 'value',
            title: '',
            source: { kind: 'collector', profileId: '' } as DashboardSourceRef,
            path: '',
            col: 0,
            row: 0,
            w: 1,
            h: 1,
        }
        // Leave col/row at (0,0) — findFreeCell call just picks (0,0)
        // for a single-tile draft; this is here for clarity.
        void findFreeCell
        const draft: Dashboard = {
            id: `dash-${now}`,
            name: '',
            tiles: [emptyTile],
        }
        return this.openModal(draft, true)
    }

    private async openModal (draft: Dashboard, isNew: boolean): Promise<Dashboard | null> {
        const modal = this.ngbModal.open(DashboardEditorModalComponent, {
            size: 'lg',
            backdrop: 'static',
        })
        modal.componentInstance.draft = draft
        modal.componentInstance.isNew = isNew
        try {
            const result = (await modal.result) as Dashboard | null
            return result ?? null
        } catch {
            return null
        }
    }
}
