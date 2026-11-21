import { Injectable } from '@angular/core'
import { NotificationsService } from 'tlink-core'
import { Dashboard, DashboardTile, TileThreshold } from '../api'

/**
 * Fires a threshold alert — in-app toast when the window is focused,
 * native OS Notification when it isn't — with per-tile cooldown so a
 * flapping value doesn't produce a notification storm.
 *
 * Evaluation of whether a sample crosses the threshold lives in the
 * dashboard tab (per-sample loop already has the tile, the coerced
 * numeric, and the change detector in hand). This service owns only
 * the *fire* path: cooldown bookkeeping, focus detection, and the
 * focus-and-select hop on click.
 *
 * Shared across dashboards and windows because it's `providedIn: 'root'`
 * — one singleton per renderer. Two tabs showing the same dashboard
 * share cooldown state and fire exactly one notification on a 0→1
 * crossing instead of two.
 */
@Injectable({ providedIn: 'root' })
export class DashboardAlertService {
    /** Key = `<dashboard.id>::<tile.id>`; value = wall-clock ms of last fire. */
    private readonly lastFired = new Map<string, number>()

    constructor (
        private readonly notifications: NotificationsService,
    ) { }

    /**
     * Call this on an inactive→active threshold crossing. The caller
     * passes a `focus` closure that selects the originating tab —
     * invoked when the user clicks the toast or native notification.
     */
    fire (
        dashboard: Dashboard,
        tile: DashboardTile,
        currentValue: number,
        focus: () => void,
    ): void {
        const t = tile.threshold
        if (!t || t.notify === false) { return }

        const key = `${dashboard.id}::${tile.id}`
        const now = Date.now()
        const cooldownMs = Math.max(1, t.cooldownSec ?? 60) * 1000
        const last = this.lastFired.get(key) ?? 0
        if (now - last < cooldownMs) { return }
        this.lastFired.set(key, now)

        const title = `${dashboard.name} — ${tile.title || pathLeaf(tile.path)}`
        const body = `${tile.path}\n${formatPredicate(t)} (currently ${currentValue})`

        // Window-focused: use the in-app toast with a tap action.
        // Window blurred: use the native Notification API — Electron's
        // default behavior surfaces it as the OS's notification and
        // addEventListener('click') works both on macOS and Windows.
        // document.hasFocus() is the decisive check at fire time.
        const focused = typeof document !== 'undefined' && document.hasFocus()
        if (focused) {
            this.notifications.actionable(title, body, focus)
            return
        }
        try {
            const note = new Notification(title, { body })
            note.addEventListener('click', () => {
                try { window.focus() } catch { /* ignore */ }
                focus()
            })
        } catch {
            // Notification constructor can throw if permission was denied
            // or in headless contexts. Fall back to the toast — at least
            // the user sees SOMETHING next time they look at the window.
            this.notifications.actionable(title, body, focus)
        }
    }
}

/**
 * Pure predicate evaluator. Exported so DashboardTabComponent can call
 * it from its per-sample loop without re-implementing the switch.
 * Non-numeric samples are skipped upstream — this function only runs
 * on coerced finite numbers.
 */
export function evaluateThreshold (v: number, t: TileThreshold): boolean {
    switch (t.op) {
        case '>':  return v >  t.value
        case '>=': return v >= t.value
        case '<':  return v <  t.value
        case '<=': return v <= t.value
        case '==': return v === t.value
    }
}

function formatPredicate (t: TileThreshold): string {
    return `${t.op} ${t.value}`
}

function pathLeaf (path: string): string {
    const parts = path.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : path
}
