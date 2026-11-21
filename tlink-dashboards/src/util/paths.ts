/**
 * Pure SVG path generators for dashboard tiles. Lifted from
 * tlink-collector's sparklinePaths / chartPaths — kept parallel in
 * geometry (viewBox, dx math, baseline Y) so a dashboard tile looks
 * visually identical to the equivalent Latest / Graphical row in the
 * live session tab. Keep in sync if the collector's versions change.
 *
 * Shared across tile components so both the sparkline and chart tiles
 * use one implementation. No Angular DI; pure functions only.
 */

export interface Sample {
    /** Timestamp — milliseconds since epoch. */
    t: number
    /** Numeric value at that timestamp. */
    v: number
}

export interface SparklinePath {
    /** Stroked line path (M… L… form). */
    line: string
    /** Filled area path for the sub-line shading. */
    fill: string
    /** Endpoint x / y — used to render the final-sample dot. */
    endX: number
    endY: number
}

export interface ChartPath {
    line: string
    area: string
    endX: number
    endY: number
    min: number
    max: number
    singleSample: boolean
}

/**
 * Sparkline — compact 100×22 viewBox. Returns null when the sample
 * count is too small to render anything meaningful.
 */
export function sparklinePath (samples: readonly Sample[]): SparklinePath | null {
    if (samples.length < 2) { return null }
    const vs = samples.map(s => s.v)
    const min = Math.min(...vs)
    const max = Math.max(...vs)
    const range = max - min || 1
    const dx = 100 / (samples.length - 1)
    const pts = vs.map((v, i) => {
        const x = i * dx
        const y = 20 - ((v - min) / range) * 16
        return [x, y] as const
    })
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const fill = `M0 22 L${line.slice(1)} L100,22 Z`
    const [endX, endY] = pts[pts.length - 1]
    return { line, fill, endX, endY }
}

/**
 * Larger chart — 100×50 viewBox, same geometry collectorSessionTab
 * uses for Graphical cards. Returns a flat-line result when the series
 * is a single sample or has no variance.
 */
export function chartPath (samples: readonly Sample[]): ChartPath | null {
    if (!samples.length) { return null }
    const vs = samples.map(s => s.v)
    const min = Math.min(...vs)
    const max = Math.max(...vs)
    if (samples.length === 1 || max === min) {
        const value = max
        const y = 25
        return {
            line: `M0,${y} L100,${y}`,
            area: `M0 50 L0,${y} L100,${y} L100,50 Z`,
            endX: 100, endY: y,
            min: value, max: value,
            singleSample: true,
        }
    }
    const range = max - min || 1
    const dx = 100 / (samples.length - 1)
    const pts = vs.map((v, i) => {
        const x = i * dx
        const y = 46 - ((v - min) / range) * 40
        return [x, y] as const
    })
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const area = `M0 50 L${line.slice(1)} L100,50 Z`
    const [endX, endY] = pts[pts.length - 1]
    return { line, area, endX, endY, min, max, singleSample: false }
}

/**
 * Compact numeric formatter. Mirrors the `compactNumber` helper in
 * the collector tab so axis labels match the session view.
 */
export function compactNumber (n: number): string {
    if (Number.isInteger(n)) { return String(n) }
    return String(Number(n.toFixed(2)))
}
