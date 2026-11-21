import { Sample } from '../util/paths'

/**
 * The data contract every tile component accepts. Pure data — no
 * observables, no injected services on the tile side. The dashboard
 * tab resolves each tile's (source, path) ref to a TileData each
 * render cycle. M4.1 produces this from a mock stub; M4.2 replaces
 * that stub with the shared subscription runner feed.
 */
export interface TileData {
    /** Latest value, or null when no sample has arrived yet. */
    current: number | string | null
    /** Optional display unit (e.g. '%', 'ms', 'B/s'). */
    unit?: string
    /** Recent samples for sparkline / chart rendering. Oldest-first. */
    samples?: Sample[]
    /** Delta vs. previous value — up / down / same with a label. */
    delta?: TileDelta
    /** Human-readable age of the latest sample ('3s', '2m'). */
    ageLabel?: string
    /**
     * Present when the latest sample satisfies the tile's threshold
     * predicate. Ephemeral — re-evaluated on every sample, never
     * persisted across tab reopen (M4.4).
     */
    alert?: TileAlertState
}

export interface TileDelta {
    kind: 'up' | 'down' | 'same'
    label: string
}

export interface TileAlertState {
    severity: 'info' | 'warning' | 'critical'
    /** Short human predicate for tooltip, e.g. '> 80'. */
    predicate: string
}
