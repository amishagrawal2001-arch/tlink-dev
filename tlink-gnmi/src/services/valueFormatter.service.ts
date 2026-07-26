import { Injectable } from '@angular/core'

/**
 * Type-aware formatter for gNMI leaf values.
 *
 * gNMI values arrive as raw JSON primitives (number / string / bool /
 * object). Without help, the UI shows `60000000000` for a 60-second
 * interval and `1785053106332992000` for a timestamp — both technically
 * correct, both unreadable at a glance. This service inspects the leaf
 * *name* (via the full path) and the *value shape* to decide how to
 * render it.
 *
 * Detection is intentionally heuristic — the gNMI spec doesn't carry
 * units, so we recognize common OpenConfig leaf-name patterns:
 *   - `*-time`, `*timestamp`, `last-*` on an integer > 1e15 → nanosecond
 *     epoch timestamp, format as relative age ("34s ago").
 *   - `interval`, `uptime`, `age`, `duration` on an integer > 1e7 →
 *     nanosecond duration, format as human units ("60s", "1h 12m").
 *   - `utilization`, `percent`, `usage` on a 0-100 integer → percentage
 *     with `%` unit suffix.
 *   - `octets`, `bytes`, `packets` on any integer → thousands separator
 *     for readability at scale (12,349,102 not 12349102).
 *
 * Kept as a service (not a static util) so a future revision can
 * inject config (e.g. user-preferred locale, 12h vs 24h clock) without
 * a plumbing rewrite.
 */
@Injectable({ providedIn: 'root' })
export class GnmiValueFormatterService {
    /**
     * Return a display object with the formatted value + optional unit.
     * The template shows unit in a smaller/muted style separate from
     * the value, so we return them apart instead of pre-concatenating.
     */
    format (value: unknown, path: string): FormattedValue {
        // Null / undefined / delete marker.
        if (value === null || value === undefined) {
            return { value: '—', unit: '', kind: 'null' }
        }

        // Booleans render as chips; caller styles the pill.
        if (typeof value === 'boolean') {
            return { value: value ? 'true' : 'false', unit: '', kind: 'bool' }
        }

        // Strings — pass through except for the special case of a
        // digit-only string that turns out to be a nanosecond timestamp
        // or duration (some vendors emit these as strings to avoid
        // JS's 53-bit int loss).
        if (typeof value === 'string') {
            if (/^\d+$/.test(value)) {
                const n = Number(value)
                if (Number.isFinite(n)) {
                    return this.formatNumber(n, path)
                }
            }
            return { value, unit: '', kind: 'string' }
        }

        // Numbers — the interesting case.
        if (typeof value === 'number' && Number.isFinite(value)) {
            return this.formatNumber(value, path)
        }

        // Objects / arrays — the JSON viewer downstream shows the full
        // shape; here we just report the structural summary.
        try {
            const preview = JSON.stringify(value)
            return { value: preview, unit: '', kind: 'json' }
        } catch {
            return { value: '[uninspectable]', unit: '', kind: 'unknown' }
        }
    }

    private formatNumber (n: number, path: string): FormattedValue {
        const leaf = this.leafName(path).toLowerCase()
        const pathLower = path.toLowerCase()

        // Nanosecond timestamp — leaf names ending in `-time` /
        // `timestamp` / `last-*`, AND magnitude looks like ns-since-epoch
        // (> 1e15 covers everything from year 2001 onward).
        if (this.looksLikeTimestampLeaf(leaf) && n > 1e15) {
            const ms = n / 1_000_000
            const now = Date.now()
            const deltaMs = now - ms
            if (Math.abs(deltaMs) < 60 * 60 * 24 * 1000) {
                return { value: this.humanizeAge(deltaMs), unit: 'ago', kind: 'timestamp' }
            }
            // Falls back to ISO for older-than-a-day timestamps.
            return { value: new Date(ms).toISOString().slice(0, 19).replace('T', ' '), unit: '', kind: 'timestamp' }
        }

        // Nanosecond duration — leaf names like `interval`, `uptime`,
        // `age`, `duration`. Magnitude threshold prevents mis-formatting
        // a value that happens to have a duration-ish name but is
        // actually a small integer (e.g. `age: 3` seconds).
        if (this.looksLikeDurationLeaf(leaf) && n > 1e7) {
            const seconds = n / 1_000_000_000
            return { value: this.humanizeDuration(seconds), unit: '', kind: 'duration' }
        }

        // Byte-count magnitudes — memory / storage / filesystem paths.
        // Detected by path prefix (memory/state, storage, filesystem)
        // OR by leaf name (used, free, available, physical, reserved,
        // capacity, size) combined with a >=1 KiB magnitude — so `size: 5`
        // on a totally different subtree doesn't get mis-formatted.
        if (this.looksLikeByteValue(pathLower, leaf) && Math.abs(n) >= 1024) {
            return this.humanizeBytes(n)
        }

        // Percentage — leaf names that suggest a 0..100 gauge.
        if (this.looksLikePercentLeaf(leaf) && n >= 0 && n <= 100) {
            return { value: this.trimZero(n), unit: '%', kind: 'percent' }
        }

        // Byte / packet counters — apply thousands separators when the
        // number is large enough to benefit.
        if (this.looksLikeCounterLeaf(leaf) && Math.abs(n) >= 10_000) {
            return { value: n.toLocaleString('en-US'), unit: '', kind: 'counter' }
        }

        // Plain number — trim trailing zeros on floats.
        return { value: this.trimZero(n), unit: '', kind: 'number' }
    }

    /**
     * Format a byte count using IEC units (KiB, MiB, GiB, TiB). IEC
     * (1024-based) not SI (1000-based) because we're overwhelmingly
     * dealing with memory / filesystem values that the OS itself
     * reports in binary units.
     */
    private humanizeBytes (n: number): FormattedValue {
        const sign = n < 0 ? '-' : ''
        const abs = Math.abs(n)
        const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
        let v = abs
        let i = 0
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024
            i += 1
        }
        // 2 significant fractional digits below 100, 1 above, none for whole units — reads cleanly.
        const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2
        return {
            value: sign + v.toFixed(digits),
            unit: units[i],
            kind: 'counter',
        }
    }

    /**
     * Byte-value detection. Path prefix wins fastest (e.g. everything
     * under /system/memory/state/ is bytes); leaf-name check backstops
     * when the path doesn't obviously indicate memory / storage but a
     * common byte-y leaf name shows up.
     */
    private looksLikeByteValue (pathLower: string, leaf: string): boolean {
        if (pathLower.includes('/memory/') ||
            pathLower.includes('/storage/') ||
            pathLower.includes('/filesystem/') ||
            pathLower.includes('/disk/')) {
            return true
        }
        return leaf === 'used' || leaf === 'free' || leaf === 'available' ||
               leaf === 'physical' || leaf === 'reserved' || leaf === 'capacity' ||
               leaf === 'size' || leaf === 'total' ||
               leaf.endsWith('-used') || leaf.endsWith('-free') || leaf.endsWith('-available')
    }

    /**
     * Age in ms → compact human string. Never returns more than one
     * unit of precision; a mixed "1m 34s" is harder to scan than "1m"
     * in a stream of rapidly changing values.
     */
    private humanizeAge (ms: number): string {
        const s = Math.max(0, Math.round(ms / 1000))
        if (s < 60) { return `${s}s` }
        const m = Math.round(s / 60)
        if (m < 60) { return `${m}m` }
        const h = Math.round(m / 60)
        if (h < 24) { return `${h}h` }
        return `${Math.round(h / 24)}d`
    }

    /**
     * Duration in seconds → compact human string. Slightly different
     * from humanizeAge: we allow one component of precision for the
     * fractional part when it's meaningful (e.g. "1.5s" for a
     * sub-minute duration), because durations are typically read as
     * measurements rather than "how stale is this row".
     */
    private humanizeDuration (seconds: number): string {
        if (seconds < 1) { return `${Math.round(seconds * 1000)}ms` }
        if (seconds < 60) {
            return seconds < 10 ? `${this.trimZero(seconds)}s` : `${Math.round(seconds)}s`
        }
        const m = seconds / 60
        if (m < 60) { return `${Math.round(m)}m` }
        const h = m / 60
        if (h < 24) { return `${Math.round(h)}h` }
        return `${Math.round(h / 24)}d`
    }

    /**
     * The last non-empty path segment, ignoring any `[…]` key selector
     * on it (leaf names never carry a key by convention). Used for
     * heuristic naming — full paths would be too noisy.
     */
    leafName (path: string): string {
        // Take the LAST /-segment first, then strip any trailing
        // [key=val] from that segment alone. Splitting the whole path
        // on '[' would eat the middle list-key and return the wrong
        // segment — a subtle bug that made every path with a middle
        // list-key collapse to the same leaf name (breaking the
        // Graphical view's fan-out detection).
        const parts = path.split('/').filter(Boolean)
        const last = parts[parts.length - 1] ?? ''
        const [leaf] = last.split('[')
        return leaf
    }

    private looksLikeTimestampLeaf (leaf: string): boolean {
        return leaf.endsWith('-time') || leaf.endsWith('_time') ||
               leaf.includes('timestamp') || leaf.startsWith('last-') ||
               leaf === 'time' || leaf === 'when'
    }

    private looksLikeDurationLeaf (leaf: string): boolean {
        return leaf === 'interval' || leaf === 'uptime' || leaf === 'age' ||
               leaf === 'duration' || leaf === 'elapsed' || leaf === 'timeout' ||
               leaf.endsWith('-interval') || leaf.endsWith('-duration') ||
               leaf.endsWith('-timeout')
    }

    private looksLikePercentLeaf (leaf: string): boolean {
        return leaf === 'utilization' || leaf === 'percent' ||
               leaf === 'usage' || leaf === 'used-percent' ||
               leaf.startsWith('percent-') || leaf.endsWith('-percent') ||
               leaf === 'instant' || leaf === 'avg' || leaf === 'min' || leaf === 'max'
    }

    private looksLikeCounterLeaf (leaf: string): boolean {
        return leaf.endsWith('-octets') || leaf.endsWith('-bytes') ||
               leaf.endsWith('-packets') || leaf.endsWith('-count') ||
               leaf.endsWith('-frames') || leaf === 'octets' || leaf === 'bytes' ||
               leaf === 'packets' || leaf === 'count'
    }

    /**
     * Trim trailing zeros on floats so `9.00` renders as `9` and
     * `9.50` as `9.5`. Keeps integers as integers (no forced decimal).
     */
    private trimZero (n: number): string {
        if (Number.isInteger(n)) { return String(n) }
        return String(parseFloat(n.toFixed(3)))
    }

    /**
     * Extract the list-key from a path like `.../component[name=RE0:CPU0]/…`.
     * Returns the last key value in the path, or null when there's no
     * bracketed selector. Used by the Latest values view to group
     * paths by their most-specific list element.
     */
    lastListKey (path: string): string | null {
        // Match all `[key=value]` bracketed segments and return the
        // value of the last one. Regex is intentionally permissive on
        // the key name — different YANG models use `name`, `id`,
        // `interface-name`, etc.
        const matches = [...path.matchAll(/\[([^=[\]]+)=([^\]]+)\]/g)]
        if (!matches.length) { return null }
        return matches[matches.length - 1][2]
    }

    /**
     * Strip trailing leaf + optional list-key so paths in the same
     * group share the same string. `/components/component[name=RE0:CPU0]/cpu/utilization/state/instant`
     * → `/components/component[name=RE0:CPU0]/cpu/utilization/state`. Used as the
     * Latest-values group key.
     */
    parentPath (path: string): string {
        const idx = path.lastIndexOf('/')
        return idx > 0 ? path.slice(0, idx) : path
    }

    /**
     * Shorten a path for compact rendering by keeping only the last N
     * segments. Used in the Latest values path column when the group
     * header already carries the prefix.
     */
    shortPath (path: string, tailSegments = 2): string {
        const parts = path.split('/').filter(Boolean)
        if (parts.length <= tailSegments) { return path }
        const tail = parts.slice(-tailSegments).join('/')
        return `…/${tail}`
    }
}

/**
 * Return shape from GnmiValueFormatterService.format(). Split value +
 * unit so the template can style the unit differently (muted, smaller
 * font) without string parsing.
 */
export interface FormattedValue {
    value: string
    unit: string
    kind: 'null' | 'bool' | 'string' | 'number' | 'percent' | 'counter' | 'timestamp' | 'duration' | 'json' | 'unknown'
}
