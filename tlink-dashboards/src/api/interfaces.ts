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
    /**
     * Optional threshold predicate — when the latest numeric sample
     * satisfies it, the tile lights up (border + badge) and (if
     * `notify`) fires an in-app toast or OS notification. M4.4.
     */
    threshold?: TileThreshold
}

/**
 * A single-op predicate against a tile's latest numeric sample.
 * Non-numeric samples (gnmi string labels, etc.) are skipped silently.
 * Compound AND/OR expressions are out of scope for M4.4 — a future
 * slice can add a discriminated-union variant alongside this shape.
 */
export interface TileThreshold {
    /** Comparison operator applied as `(latest op value)`. */
    op: '>' | '>=' | '<' | '<=' | '=='
    /** Right-hand side of the comparison. */
    value: number
    /** Drives the badge/border color and notification tag. Default 'warning'. */
    severity?: 'info' | 'warning' | 'critical'
    /** Fire in-app toast + native OS notification on 0→1 crossing. Default true. */
    notify?: boolean
    /** Minimum seconds between notifications for the same tile while active. Default 60. */
    cooldownSec?: number
}

/** Number of columns on a dashboard grid. Fixed at 3 for M4.3. */
export const DASHBOARD_GRID_COLS = 3

/**
 * Top-level JSON envelope written by `buildExport()` and consumed by
 * the import flow. The format version lets future shape changes land
 * without breaking older exports — `migrate()` upgrades any supported
 * version to the current one before the preview modal opens.
 *
 * Privacy posture: this envelope deliberately omits credentials,
 * bearer tokens, and keychain refs. Dashboards reference profiles by
 * id only (`DashboardSourceRef`), and profiles themselves (with their
 * secrets) are NOT serialized here. `exportedBy` is optional and only
 * written when the caller supplies it.
 */
export interface DashboardExportV1 {
    tlinkDashboardFormat: 1
    /** ISO-8601 timestamp recorded at `buildExport()` call time. */
    exportedAt: string
    /** Caller-supplied identifier. Omitted if absent — never auto-filled. */
    exportedBy?: string
    /** The serialized dashboard. Round-trips every optional field. */
    dashboard: Dashboard
}

/** Current exported shape. Keep in sync with the latest `DashboardExportVn`. */
export type DashboardExport = DashboardExportV1

/**
 * Union over every supported input version. `migrate()` walks this
 * union up to the latest shape. Add `| DashboardExportV2` when v2 lands.
 */
export type DashboardExportAny = DashboardExportV1

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
