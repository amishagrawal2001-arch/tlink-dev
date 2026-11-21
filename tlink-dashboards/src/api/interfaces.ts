/**
 * A named dashboard — a set of telemetry tiles rendered side-by-side.
 * Lives in the app-wide config at `config.dashboards[]`. Open via the
 * dashboards toolbar button or (future) the dashboard editor UI.
 */
export interface Dashboard {
    /** Stable id referenced by tab inputs and toolbar options. */
    id: string
    /** User-visible name, shown as the tab title. */
    name: string
    /** Tiles rendered sequentially in a 3-column grid (M4.1). */
    tiles: DashboardTile[]
}

/**
 * One tile on a dashboard. Rendered by the matching tile component.
 * M4.1: grid position was implicit (sequential 3-col flow). M4.3 adds
 * explicit col/row/w/h fields here; w/h default to 1×1 (resize is a
 * future slice). Legacy no-layout tiles are normalized on load.
 */
export interface DashboardTile {
    /** Stable id unique within a dashboard. */
    id: string
    /** Tile shape — picks which tile component renders this entry. */
    type: 'value' | 'sparkline' | 'chart'
    /** Optional label; falls back to the path leaf when absent. */
    title?: string
    /** Which profile + plugin provides the data for this tile. */
    source: DashboardSourceRef
    /** Metric path on that source. */
    path: string
    /** 0-indexed column on the 3-column grid (M4.3+). Legacy: assigned from array order. */
    col?: number
    /** 0-indexed row — unbounded (M4.3+). Legacy: assigned from array order. */
    row?: number
    /** Width in grid cells. Defaults to 1. Resize affordance is a future slice. */
    w?: number
    /** Height in grid cells. Defaults to 1. */
    h?: number
}

/** Number of columns on a dashboard grid. Fixed at 3 for M4.3. */
export const DASHBOARD_GRID_COLS = 3

/**
 * Reference to a data source for a tile. The profile id matches an
 * existing `GnmiProfile.id` or `CollectorProfile.id` registered with
 * ProfilesService; the shared subscription runner in M4.2 will resolve
 * the ref to a live Observable<TileData>.
 */
export interface DashboardSourceRef {
    /** Which plugin owns the referenced profile. */
    kind: 'gnmi' | 'collector'
    /** Profile id on that plugin. */
    profileId: string
}
