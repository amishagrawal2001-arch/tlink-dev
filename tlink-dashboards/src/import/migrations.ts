import { DashboardExport, DashboardExportAny } from '../api'

/**
 * Upgrade any supported input version to the current export shape.
 *
 * Returns a structured result so the caller can surface a specific
 * error message without wrapping in try/catch. Pass-through for v1
 * today; when v2 lands, add a `migrateV1toV2` step and chain:
 *   v1 → v2 → v3 → … → latest
 * Right-fold composition keeps the matrix linear instead of pairwise.
 *
 * Export ALWAYS writes the current version (never emits a stale v1
 * envelope from a v2-aware codebase), so `migrate()` only ever walks
 * UP, never down.
 */
export function migrate (payload: DashboardExportAny): { ok: true, value: DashboardExport } | { ok: false, error: string } {
    if (payload.tlinkDashboardFormat === 1) {
        return { ok: true, value: payload }
    }
    // Unreachable today — kept here as the shape for the v2+ switch.
    const v = (payload as { tlinkDashboardFormat?: unknown }).tlinkDashboardFormat
    return { ok: false, error: `Format version ${String(v)} not supported by this build of Tlink — upgrade and retry.` }
}
