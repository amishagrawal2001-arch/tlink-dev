import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { PartialProfile, Profile, ProfilesService, TranslateService } from 'tlink-core'
import { GnmiPathCatalogService } from 'tlink-gnmi'
import { CollectorPathCatalogService } from 'tlink-collector'
import { Dashboard, DashboardTile, DashboardSourceRef, DASHBOARD_GRID_COLS } from '../api'
import { findFreeCell } from '../util/layout'

type SourceKind = DashboardSourceRef['kind']
type TileType = DashboardTile['type']

interface PathSuggestion {
    path: string
    label?: string
    category?: string
}

interface ProfileOption {
    id: string
    name: string
}

/**
 * Edit a dashboard. The caller passes a cloned `draft` — Save closes
 * the modal with the mutated draft, Cancel dismisses. Draft isolation
 * means no partial-state writes to `config.store.dashboards`.
 *
 * Layout: dashboard name field at the top, a reorderable list of tile
 * rows in the middle, and action buttons at the bottom. Each tile row
 * carries title / type / source kind / profile / path with an inline
 * "Suggest" dropdown drawn from `GnmiPathCatalogService` (gnmi) or
 * `CollectorPathCatalogService` (collector).
 */
@Component({
    selector: 'dashboard-editor-modal',
    templateUrl: './dashboardEditorModal.component.pug',
    styleUrls: ['./dashboardEditorModal.component.scss'],
})
export class DashboardEditorModalComponent implements OnInit {
    @Input() draft!: Dashboard
    @Input() isNew = false

    profilesByKind: Record<SourceKind, ProfileOption[]> = {
        gnmi: [],
        collector: [],
    }

    /** Per-tile open-suggest flag keyed by tile.id. */
    suggestOpenFor: string | null = null
    /** Per-tile cached suggestion list. */
    suggestions: Record<string, PathSuggestion[]> = {}
    /** Per-tile loading flag — true while observedFor() is running. */
    suggestLoading: Record<string, boolean> = {}

    readonly tileTypes: TileType[] = ['value', 'sparkline', 'chart']
    readonly sourceKinds: SourceKind[] = ['gnmi', 'collector']

    constructor (
        private readonly modal: NgbActiveModal,
        private readonly profilesService: ProfilesService,
        private readonly translate: TranslateService,
        private readonly gnmiCatalog: GnmiPathCatalogService,
        private readonly collectorCatalog: CollectorPathCatalogService,
    ) { }

    async ngOnInit (): Promise<void> {
        const list = await this.profilesService.getProfiles({ includeBuiltin: false }) as PartialProfile<Profile>[]
        this.profilesByKind = {
            gnmi: list.filter(p => p.type === 'gnmi' && p.id && p.name).map(p => ({ id: p.id!, name: p.name! })),
            collector: list.filter(p => p.type === 'collector' && p.id && p.name).map(p => ({ id: p.id!, name: p.name! })),
        }
    }

    trackByTileId (_i: number, t: DashboardTile): string {
        return t.id
    }

    addTile (): void {
        const freeCell = findFreeCell(this.draft.tiles)
        const now = Date.now().toString(36)
        const tile: DashboardTile = {
            id: `tile-${now}-${Math.floor(Math.random() * 1_000)}`,
            type: 'value',
            title: '',
            source: { kind: 'collector', profileId: '' },
            path: '',
            col: freeCell.col,
            row: freeCell.row,
            w: 1,
            h: 1,
        }
        this.draft.tiles.push(tile)
    }

    removeTile (tile: DashboardTile): void {
        this.draft.tiles = this.draft.tiles.filter(t => t.id !== tile.id)
        if (this.suggestOpenFor === tile.id) { this.suggestOpenFor = null }
    }

    onTileReordered (event: CdkDragDrop<DashboardTile[]>): void {
        if (event.previousIndex === event.currentIndex) { return }
        moveItemInArray(this.draft.tiles, event.previousIndex, event.currentIndex)
        // Re-assign col/row sequentially so the next Save renders tiles
        // in the user-chosen list order on the grid.
        this.draft.tiles.forEach((t, i) => {
            t.col = i % DASHBOARD_GRID_COLS
            t.row = Math.floor(i / DASHBOARD_GRID_COLS)
        })
    }

    onKindChange (tile: DashboardTile, kind: SourceKind): void {
        tile.source = { kind, profileId: '' }
    }

    profileExists (tile: DashboardTile): boolean {
        if (!tile.source.profileId) { return false }
        return this.profilesByKind[tile.source.kind]?.some(p => p.id === tile.source.profileId) ?? false
    }

    showProfileWarning (tile: DashboardTile): boolean {
        return !!tile.source.profileId && !this.profileExists(tile)
    }

    canSave (): boolean {
        const nameOk = (this.draft.name ?? '').trim().length > 0
        const tilesOk = this.draft.tiles.every(t =>
            !!t.source.profileId && (t.path ?? '').trim().length > 0,
        )
        return nameOk && tilesOk && this.draft.tiles.length > 0
    }

    save (): void {
        if (!this.canSave()) { return }
        // Snapshot the trimmed name back onto the draft.
        this.draft.name = this.draft.name.trim()
        for (const t of this.draft.tiles) {
            t.path = (t.path ?? '').trim()
            t.title = (t.title ?? '').trim()
        }
        this.modal.close(this.draft)
    }

    cancel (): void {
        this.modal.dismiss()
    }

    async toggleSuggest (tile: DashboardTile): Promise<void> {
        if (this.suggestOpenFor === tile.id) {
            this.suggestOpenFor = null
            return
        }
        this.suggestOpenFor = tile.id
        if (!this.suggestions[tile.id]) {
            await this.loadSuggestions(tile)
        }
    }

    pickSuggestion (tile: DashboardTile, s: PathSuggestion): void {
        tile.path = s.path
        if (!tile.title) {
            tile.title = s.label ?? pathLeaf(s.path)
        }
        this.suggestOpenFor = null
    }

    private async loadSuggestions (tile: DashboardTile): Promise<void> {
        if (tile.source.kind === 'gnmi') {
            const entries = this.gnmiCatalog.all()
            this.suggestions[tile.id] = entries.map(e => ({
                path: e.path,
                label: e.label,
                category: e.category,
            }))
            return
        }
        if (tile.source.kind === 'collector' && tile.source.profileId) {
            this.suggestLoading[tile.id] = true
            try {
                const starred = await this.collectorCatalog.starredFor(tile.source.profileId)
                // Starred shown immediately; observed streams in after the window.
                this.suggestions[tile.id] = starred.map(p => ({ path: p, category: this.translate.instant('Starred') }))
                const observed = await this.collectorCatalog.observedFor(tile.source.profileId, 3000)
                const known = new Set(starred)
                for (const p of observed) {
                    if (!known.has(p)) {
                        this.suggestions[tile.id].push({ path: p, category: this.translate.instant('Observed') })
                        known.add(p)
                    }
                }
            } finally {
                this.suggestLoading[tile.id] = false
            }
            return
        }
        this.suggestions[tile.id] = []
    }
}

function pathLeaf (path: string): string {
    const parts = path.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : path
}
