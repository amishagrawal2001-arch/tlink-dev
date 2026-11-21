import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core'
import { Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { AppService, ConfigService, NotificationsService, PromptModalComponent, TranslateService } from 'tlink-core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Dashboard } from '../api'
import { DashboardTabComponent } from './dashboardTab.component'
import { DashboardsEditorService } from '../services/dashboardsEditor.service'
import { DashboardsImportExportService } from '../services/dashboardsImportExport.service'
import { ImportDashboardModalComponent } from './importDashboardModal.component'

/**
 * Side panel that lists every entry in `config.dashboards[]`. The row
 * is the primary surface for opening and editing dashboards in M4.3 —
 * the M4.1 toolbar button stays as a shortcut, but the panel is the
 * real home.
 *
 * Interactions:
 *  - Row click opens the dashboard in a tab.
 *  - Row "Edit" opens the editor modal against that dashboard.
 *  - Row "Duplicate" clones the dashboard with "— Copy" appended.
 *  - Row "Rename" prompts for a new display name (id stays the same).
 *  - Row "Delete" confirms and removes the entry.
 *  - Header "+ Add" opens the editor with an empty draft.
 *
 * Config writes go through ConfigService.save() so persistence matches
 * every other config change surface in tlink.
 */
@Component({
    selector: 'dashboards-panel',
    templateUrl: './dashboardsPanel.component.pug',
    styleUrls: ['./dashboardsPanel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardsPanelComponent implements OnInit, OnDestroy {
    dashboards: Dashboard[] = []
    menuOpenFor: string | null = null

    private readonly destroy$ = new Subject<void>()

    constructor (
        private readonly app: AppService,
        private readonly config: ConfigService,
        private readonly notifications: NotificationsService,
        private readonly translate: TranslateService,
        private readonly ngbModal: NgbModal,
        private readonly editor: DashboardsEditorService,
        private readonly importExport: DashboardsImportExportService,
        private readonly cdr: ChangeDetectorRef,
    ) { }

    ngOnInit (): void {
        this.refresh()
        this.config.changed$
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                this.refresh()
                this.cdr.markForCheck()
            })
    }

    ngOnDestroy (): void {
        this.destroy$.next()
        this.destroy$.complete()
    }

    trackById (_i: number, d: Dashboard): string {
        return d.id
    }

    openDashboard (d: Dashboard): void {
        this.menuOpenFor = null
        this.app.openNewTab({
            type: DashboardTabComponent,
            inputs: { dashboardId: d.id },
        })
    }

    async addDashboard (): Promise<void> {
        const draft = await this.editor.openForNewDashboard()
        if (draft) {
            this.commit(draft)
            this.notifications.notice(this.translate.instant('Dashboard added'))
        }
    }

    async importDashboard (): Promise<void> {
        const preview = await this.importExport.readImportFile()
        if (!preview) {
            // Cancelled or failed; the service surfaced any error toast.
            return
        }
        const modal = this.ngbModal.open(ImportDashboardModalComponent, {
            size: 'lg',
            backdrop: 'static',
        })
        modal.componentInstance.preview = preview
        try {
            await modal.result
        } catch {
            return
        }
        const imported = await this.importExport.commitImport(preview)
        this.refresh()
        this.cdr.markForCheck()
        this.app.openNewTab({
            type: DashboardTabComponent,
            inputs: { dashboardId: imported.id },
        })
    }

    async editDashboard (d: Dashboard): Promise<void> {
        this.menuOpenFor = null
        const draft = await this.editor.openForDashboard(d)
        if (draft) {
            this.commit(draft)
            this.notifications.notice(this.translate.instant('Dashboard saved'))
        }
    }

    duplicateDashboard (d: Dashboard): void {
        this.menuOpenFor = null
        const copy: Dashboard = {
            ...d,
            id: `${d.id}-copy-${Date.now().toString(36)}`,
            name: `${d.name} — Copy`,
            tiles: d.tiles.map(t => ({ ...t, id: `${t.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000)}` })),
        }
        this.commit(copy)
        this.notifications.notice(this.translate.instant('Dashboard duplicated'))
    }

    async renameDashboard (d: Dashboard): Promise<void> {
        this.menuOpenFor = null
        const modal = this.ngbModal.open(PromptModalComponent, { backdrop: 'static' })
        modal.componentInstance.prompt = this.translate.instant('Dashboard name')
        modal.componentInstance.value = d.name
        modal.componentInstance.password = false
        try {
            const result = await modal.result
            const next = typeof result?.value === 'string' ? result.value.trim() : ''
            if (!next || next === d.name) {
                return
            }
            this.commit({ ...d, name: next })
            this.notifications.notice(this.translate.instant('Renamed'))
        } catch {
            // dismissed
        }
    }

    deleteDashboard (d: Dashboard): void {
        this.menuOpenFor = null
        // eslint-disable-next-line no-alert
        if (!confirm(this.translate.instant('Delete dashboard "{name}"?', { name: d.name }))) {
            return
        }
        const store = this.config.store as { dashboards?: Dashboard[] }
        store.dashboards = (store.dashboards ?? []).filter(x => x.id !== d.id)
        void this.config.save()
        this.refresh()
        this.notifications.notice(this.translate.instant('Dashboard deleted'))
        this.cdr.markForCheck()
    }

    toggleMenu (id: string, event: Event): void {
        event.stopPropagation()
        this.menuOpenFor = this.menuOpenFor === id ? null : id
        this.cdr.markForCheck()
    }

    closeMenu (): void {
        if (this.menuOpenFor !== null) {
            this.menuOpenFor = null
            this.cdr.markForCheck()
        }
    }

    tileCountLabel (d: Dashboard): string {
        const n = d.tiles.length
        return n === 1
            ? this.translate.instant('1 tile')
            : this.translate.instant('{n} tiles', { n })
    }

    private refresh (): void {
        const store = this.config.store as { dashboards?: Dashboard[] }
        this.dashboards = [...(store.dashboards ?? [])]
    }

    private commit (dashboard: Dashboard): void {
        const store = this.config.store as { dashboards?: Dashboard[] }
        const list = store.dashboards ?? []
        const i = list.findIndex(x => x.id === dashboard.id)
        if (i === -1) {
            list.push(dashboard)
        } else {
            list.splice(i, 1, dashboard)
        }
        store.dashboards = list
        void this.config.save()
        this.refresh()
        this.cdr.markForCheck()
    }
}
