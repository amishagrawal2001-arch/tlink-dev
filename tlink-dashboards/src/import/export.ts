// Privacy note: the exported envelope carries only the dashboard
// STRUCTURE — tile types, source refs by id, paths, grid positions,
// thresholds. It deliberately does NOT carry: passwords, bearer
// tokens, keychain refs, profile credentials of any kind, or any
// user-identifying field unless the caller explicitly passes
// `exportedBy`. A dashboard file is safe to share with a teammate
// who holds their own profiles under the same ids; moving the file
// never leaks secrets with it.
import { Dashboard, DashboardExport } from '../api'

export interface BuildExportOptions {
    /**
     * Optional caller-supplied identifier. Written verbatim into
     * `exportedBy`. Omitted from the envelope when absent — never
     * auto-filled from the host environment.
     */
    exportedBy?: string
}

/**
 * Build the v1 export envelope. ISO-8601 `exportedAt` is stamped at
 * call time. The dashboard is shallow-referenced; callers that need
 * to decouple from live edits should clone before passing.
 */
export function buildExport (dashboard: Dashboard, opts?: BuildExportOptions): DashboardExport {
    const envelope: DashboardExport = {
        tlinkDashboardFormat: 1,
        exportedAt: new Date().toISOString(),
        dashboard,
    }
    if (opts?.exportedBy) {
        envelope.exportedBy = opts.exportedBy
    }
    return envelope
}

/**
 * Slugify a dashboard name for a filename stem. Keeps the file
 * recognizable on disk without leaking spaces or OS-unfriendly chars.
 */
export function slugifyDashboardName (name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    return slug || 'dashboard'
}
