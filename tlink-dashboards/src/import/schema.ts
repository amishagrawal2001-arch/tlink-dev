import { Dashboard, DashboardTile, DashboardSourceRef, TileThreshold, DashboardExportAny } from '../api'

/**
 * Validation returns a structured result instead of throwing so the
 * caller can surface a specific error toast without wrapping every
 * call in try/catch. `path` is a dotted JSON pointer — e.g.
 * `dashboard.tiles[2].source.kind` — that pinpoints the first offending
 * field. Walks the whole envelope depth-first; the first failure wins.
 */
export type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false, path: string; reason: string }

const TILE_TYPES = new Set(['value', 'sparkline', 'chart'])
const SOURCE_KINDS = new Set(['gnmi', 'collector'])
const THRESHOLD_OPS = new Set(['>', '>=', '<', '<=', '=='])
const THRESHOLD_SEVERITIES = new Set(['info', 'warning', 'critical'])

export function validateDashboardExport (x: unknown): ValidationResult<DashboardExportAny> {
    if (!isObj(x)) {
        return fail('', 'envelope must be a JSON object')
    }
    const r = x
    if (r.tlinkDashboardFormat !== 1) {
        const got = r.tlinkDashboardFormat === undefined
            ? 'missing'
            : JSON.stringify(r.tlinkDashboardFormat)
        return fail('tlinkDashboardFormat', `expected 1, got ${got}`)
    }
    if (typeof r.exportedAt !== 'string') {
        return fail('exportedAt', 'must be an ISO-8601 string')
    }
    if (r.exportedBy !== undefined && typeof r.exportedBy !== 'string') {
        return fail('exportedBy', 'must be a string when present')
    }
    const d = validateDashboard(r.dashboard, 'dashboard')
    if (!d.ok) { return d }
    // Soft-reject: unknown top-level fields are ignored. Log once so
    // forward-compat inputs (a v2 file opened by a v1 build) leave a
    // breadcrumb without failing the import.
    const known = new Set(['tlinkDashboardFormat', 'exportedAt', 'exportedBy', 'dashboard'])
    const extra = Object.keys(r).filter(k => !known.has(k))
    if (extra.length) {
        // eslint-disable-next-line no-console
        console.info(`[dashboards] import: ignoring unknown envelope field(s): ${extra.join(', ')}`)
    }
    return { ok: true, value: { tlinkDashboardFormat: 1, exportedAt: r.exportedAt, exportedBy: r.exportedBy, dashboard: d.value } }
}

function validateDashboard (x: unknown, path: string): ValidationResult<Dashboard> {
    if (!isObj(x)) { return fail(path, 'must be a JSON object') }
    const d = x
    if (typeof d.id !== 'string' || !d.id) { return fail(`${path}.id`, 'must be a non-empty string') }
    if (typeof d.name !== 'string' || !d.name) { return fail(`${path}.name`, 'must be a non-empty string') }
    if (!Array.isArray(d.tiles)) { return fail(`${path}.tiles`, 'must be an array') }
    const tiles: DashboardTile[] = []
    for (let i = 0; i < d.tiles.length; i++) {
        const t = validateTile(d.tiles[i], `${path}.tiles[${i}]`)
        if (!t.ok) { return t }
        tiles.push(t.value)
    }
    return { ok: true, value: { id: d.id, name: d.name, tiles } }
}

function validateTile (x: unknown, path: string): ValidationResult<DashboardTile> {
    if (!isObj(x)) { return fail(path, 'must be a JSON object') }
    const t = x
    if (typeof t.id !== 'string' || !t.id) { return fail(`${path}.id`, 'must be a non-empty string') }
    if (typeof t.type !== 'string' || !TILE_TYPES.has(t.type)) {
        return fail(`${path}.type`, `must be one of value|sparkline|chart, got ${JSON.stringify(t.type)}`)
    }
    if (t.title !== undefined && typeof t.title !== 'string') {
        return fail(`${path}.title`, 'must be a string when present')
    }
    const src = validateSourceRef(t.source, `${path}.source`)
    if (!src.ok) { return src }
    if (typeof t.path !== 'string' || !t.path) { return fail(`${path}.path`, 'must be a non-empty string') }
    const tile: DashboardTile = {
        id: t.id,
        type: t.type as DashboardTile['type'],
        source: src.value,
        path: t.path,
    }
    if (t.title !== undefined) { tile.title = t.title }
    for (const k of ['col', 'row', 'w', 'h'] as const) {
        if (t[k] !== undefined) {
            if (!isFiniteNonNegativeInt(t[k])) {
                return fail(`${path}.${k}`, 'must be a finite non-negative integer when present')
            }
            tile[k] = t[k] as number
        }
    }
    if (t.threshold !== undefined) {
        const th = validateThreshold(t.threshold, `${path}.threshold`)
        if (!th.ok) { return th }
        tile.threshold = th.value
    }
    return { ok: true, value: tile }
}

function validateSourceRef (x: unknown, path: string): ValidationResult<DashboardSourceRef> {
    if (!isObj(x)) { return fail(path, 'must be a JSON object') }
    const s = x
    if (typeof s.kind !== 'string' || !SOURCE_KINDS.has(s.kind)) {
        return fail(`${path}.kind`, `must be gnmi|collector, got ${JSON.stringify(s.kind)}`)
    }
    if (typeof s.profileId !== 'string' || !s.profileId) {
        return fail(`${path}.profileId`, 'must be a non-empty string')
    }
    return { ok: true, value: { kind: s.kind as DashboardSourceRef['kind'], profileId: s.profileId } }
}

function validateThreshold (x: unknown, path: string): ValidationResult<TileThreshold> {
    if (!isObj(x)) { return fail(path, 'must be a JSON object') }
    const th = x
    if (typeof th.op !== 'string' || !THRESHOLD_OPS.has(th.op)) {
        return fail(`${path}.op`, `must be one of >|>=|<|<=|==, got ${JSON.stringify(th.op)}`)
    }
    if (typeof th.value !== 'number' || !Number.isFinite(th.value)) {
        return fail(`${path}.value`, 'must be a finite number')
    }
    const out: TileThreshold = { op: th.op as TileThreshold['op'], value: th.value }
    if (th.severity !== undefined) {
        if (typeof th.severity !== 'string' || !THRESHOLD_SEVERITIES.has(th.severity)) {
            return fail(`${path}.severity`, `must be info|warning|critical, got ${JSON.stringify(th.severity)}`)
        }
        out.severity = th.severity as TileThreshold['severity']
    }
    if (th.notify !== undefined) {
        if (typeof th.notify !== 'boolean') {
            return fail(`${path}.notify`, 'must be a boolean when present')
        }
        out.notify = th.notify
    }
    if (th.cooldownSec !== undefined) {
        if (!isFiniteNonNegativeInt(th.cooldownSec)) {
            return fail(`${path}.cooldownSec`, 'must be a finite non-negative integer when present')
        }
        out.cooldownSec = th.cooldownSec as number
    }
    return { ok: true, value: out }
}

function isObj (x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isFiniteNonNegativeInt (x: unknown): boolean {
    return typeof x === 'number' && Number.isFinite(x) && Math.floor(x) === x && x >= 0
}

function fail (path: string, reason: string): ValidationResult<never> {
    return { ok: false, path, reason }
}

/** Compose a user-facing error message from a validation failure. */
export function formatValidationError (err: { path: string; reason: string }): string {
    return err.path ? `${err.path}: ${err.reason}` : err.reason
}
