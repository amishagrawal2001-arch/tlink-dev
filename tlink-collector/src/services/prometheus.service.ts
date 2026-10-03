/* eslint-disable @typescript-eslint/no-use-before-define, @typescript-eslint/max-params */
import { Injectable } from '@angular/core'
import { EventEmitter } from 'events'
import * as http from 'http'
import * as https from 'https'
import * as url from 'url'
import { CollectorProfile, CollectorSample } from '../api'
import { CollectorHandle } from './mock.service'

/**
 * One sample parsed from the Prometheus text-exposition format. Labels
 * are the (optional) label map inside `{…}`; value and optional
 * timestampMs are the trailing numeric fields.
 */
export interface PrometheusSample {
    name: string
    labels: Record<string, string>
    value: number
    timestampMs?: number
}

/** Request timeout (per scrape). Overrides scrape interval for runaway endpoints. */
const SCRAPE_TIMEOUT_MS = 15_000

/**
 * HTTP scrape adapter for Prometheus / Telegraf endpoints.
 *
 * Hits `profile.options.url` every `scrapeIntervalSec` seconds, parses
 * the text-exposition response, and emits one `CollectorSample` per
 * metric time-series. Path convention mirrors gNMI so the Latest /
 * Graphical views already group correctly:
 *
 *   up{instance="localhost:9090",job="prometheus"} 1
 *   → /prometheus/up[instance=localhost:9090][job=prometheus]
 *
 *   go_goroutines 42
 *   → /prometheus/go_goroutines
 *
 * Transient failures (one HTTP 500, a dropped socket) emit an error
 * event but KEEP THE TIMER RUNNING — users want a flapping endpoint
 * surfaced in the tab's error strip, not a torn-down connection they
 * have to manually restart. Fatal config issues (invalid URL) throw
 * synchronously from start() so the session tab surfaces them in
 * lastError on first connect.
 *
 * Also covers Telegraf — its `prometheus_client` output serves the
 * same format at port 9273 by default, so no separate code path.
 */
@Injectable({ providedIn: 'root' })
export class PrometheusCollectorService {
    start (profile: CollectorProfile): CollectorHandle {
        const scrapeUrl = (profile.options.url ?? '').trim()
        if (!scrapeUrl) {
            throw new Error('Prometheus source needs a URL (e.g. http://localhost:9090/metrics)')
        }
        // Validate up front so the user doesn't wait a full interval
        // for a typo to surface. IIFE keeps `parsed` a non-nullable
        // const — the throw-in-catch is safe at runtime, but TS flow
        // analysis + the init-declarations lint rule don't like a
        // `let parsed: URL` that's conditionally initialized.
        const parsed = ((): url.URL => {
            try {
                return new url.URL(scrapeUrl)
            } catch {
                throw new Error(`Invalid Prometheus URL: ${scrapeUrl}`)
            }
        })()
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`Prometheus URL must be http:// or https:// — got ${parsed.protocol}`)
        }

        const intervalMs = Math.max(1, profile.options.scrapeIntervalSec ?? 10) * 1000
        const filterRe = compileFilter(profile.options.metricFilter)
        const auth = buildAuthHeader(profile)
        const insecureTls = Boolean(profile.options.insecureTls)
        const handle = new EventEmitter() as unknown as CollectorHandle

        const doScrape = async (): Promise<void> => {
            try {
                const scraped = await scrapeOnce(parsed, auth, insecureTls)
                const nowMs = Date.now()
                const filtered = filterRe
                    ? scraped.filter(s => filterRe.test(s.name))
                    : scraped
                for (const s of filtered) {
                    const sample: CollectorSample = {
                        timestampNs: (s.timestampMs ?? nowMs) * 1_000_000,
                        path: pathForSample(s),
                        value: s.value,
                        kind: 'update',
                        target: profile.name,
                    }
                    handle.emit('sample', sample)
                }
            } catch (err) {
                // Emit per-scrape errors but keep the timer alive. The
                // session tab wires an .on('error') listener that will
                // surface the latest failure in its error strip.
                handle.emit('error', err instanceof Error ? err : new Error(String(err)))
            }
        }

        // Fire the first scrape immediately so the UI has data on
        // first render instead of waiting a full interval.
        const kickoff = setTimeout(() => void doScrape(), 50)
        const timer = setInterval(() => void doScrape(), intervalMs)
        handle.stop = () => {
            clearTimeout(kickoff)
            clearInterval(timer)
        }
        return handle
    }
}

// ─── HTTP transport ───────────────────────────────────────────────

/**
 * Fetch a Prometheus-format /metrics endpoint and return parsed samples.
 * Uses node:http / node:https directly rather than global fetch — need
 * granular TLS control (rejectUnauthorized) for self-signed test certs
 * and the native API gives it to us without an undici workaround.
 */
async function scrapeOnce (
    parsed: url.URL,
    authHeader: string | null,
    insecureTls: boolean,
): Promise<PrometheusSample[]> {
    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? https : http

    const headers: Record<string, string> = {
        accept: 'text/plain; version=0.0.4, */*',
        'user-agent': 'tlink-collector/1.0',
    }
    if (authHeader) { headers.authorization = authHeader }

    const requestOptions: https.RequestOptions = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers,
        timeout: SCRAPE_TIMEOUT_MS,
    }
    if (isHttps && insecureTls) {
        // rejectUnauthorized=false is only honored on the HTTPS request —
        // the http module ignores it. Guard the cast so TS stays happy.
        (requestOptions).rejectUnauthorized = false
    }

    return new Promise<PrometheusSample[]>((resolve, reject) => {
        const req = lib.request(requestOptions, res => {
            // Prometheus endpoints should return 200. Follow one redirect
            // (common when a reverse proxy adds trailing slashes) and
            // reject anything else so transient 500s surface clearly.
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume()
                reject(new Error(`${res.statusCode} redirect to ${res.headers.location} — update profile URL`))
                return
            }
            if (res.statusCode !== 200) {
                res.resume()
                reject(new Error(`HTTP ${res.statusCode ?? '?'} ${res.statusMessage ?? ''}`.trim()))
                return
            }
            let body = ''
            res.setEncoding('utf8')
            res.on('data', chunk => { body += chunk })
            res.on('end', () => {
                try {
                    resolve(parsePromText(body))
                } catch (err) {
                    reject(err instanceof Error ? err : new Error(String(err)))
                }
            })
        })
        req.on('timeout', () => {
            req.destroy(new Error(`Scrape timed out after ${SCRAPE_TIMEOUT_MS / 1000}s`))
        })
        req.on('error', reject)
        req.end()
    })
}

function buildAuthHeader (profile: CollectorProfile): string | null {
    const { username, password, bearerToken } = profile.options
    // Bearer wins when both are set — matches how most exporters
    // document their auth options.
    if (bearerToken) { return `Bearer ${bearerToken}` }
    if ((username ?? '') || (password ?? '')) {
        const token = Buffer.from(`${username ?? ''}:${password ?? ''}`).toString('base64')
        return `Basic ${token}`
    }
    return null
}

function compileFilter (filter: string | null | undefined): RegExp | null {
    if (!filter) { return null }
    try {
        return new RegExp(filter)
    } catch {
        // Invalid regex: fall back to substring match wrapped in a safe regex.
        const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(escaped)
    }
}

// ─── Path formatting ──────────────────────────────────────────────

/**
 * Build the CollectorSample path for a Prometheus series. Sorted-key
 * label encoding keeps paths stable across scrapes — Prometheus doesn't
 * guarantee label ordering in /metrics output, and the Latest view
 * groups by path identity.
 */
function pathForSample (s: PrometheusSample): string {
    const keys = Object.keys(s.labels).sort()
    if (!keys.length) { return `/prometheus/${s.name}` }
    const parts = keys.map(k => `[${k}=${s.labels[k]}]`).join('')
    return `/prometheus/${s.name}${parts}`
}

// ─── Text-format parser ───────────────────────────────────────────

/**
 * Parse Prometheus text-exposition format (see
 * https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details).
 *
 * Handles:
 *   - Comment / HELP / TYPE lines (skipped — not surfaced as data today).
 *   - Metric lines WITHOUT labels: `name 42` / `name 42 1700000000000`.
 *   - Metric lines WITH labels: `name{k="v",k2="v2"} 42`.
 *   - Special values: +Inf, -Inf, NaN.
 *   - Escaped label values: \\, \", \n.
 *
 * Keeps parsing on a bad line — Prometheus endpoints occasionally emit
 * malformed metrics, and discarding the entire scrape over one bad row
 * is worse than skipping that row.
 */
export function parsePromText (text: string): PrometheusSample[] {
    const out: PrometheusSample[] = []
    const lines = text.split('\n')
    for (const raw of lines) {
        const line = raw.trim()
        if (!line) { continue }
        if (line.startsWith('#')) { continue }
        const sample = parseMetricLine(line)
        if (sample) { out.push(sample) }
    }
    return out
}

function parseMetricLine (line: string): PrometheusSample | null {
    // Find the end of the metric name — either `{` (labels follow) or
    // whitespace (no labels, value follows).
    let i = 0
    while (i < line.length && /[a-zA-Z0-9_:]/.test(line[i])) { i += 1 }
    if (i === 0) { return null }
    const name = line.slice(0, i)

    let labels: Record<string, string> = {}
    if (line[i] === '{') {
        const close = findMatchingBrace(line, i)
        if (close < 0) { return null }
        labels = parseLabels(line.slice(i + 1, close))
        i = close + 1
    }

    // Skip whitespace between labels / name and value.
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) { i += 1 }
    const rest = line.slice(i).trim()
    if (!rest) { return null }

    const parts = rest.split(/\s+/)
    const value = parsePromValue(parts[0])
    if (value === null) { return null }
    const timestampMs = parts[1] ? parseFloat(parts[1]) : undefined
    return { name, labels, value, timestampMs: Number.isFinite(timestampMs) ? timestampMs : undefined }
}

function parsePromValue (raw: string): number | null {
    // Prometheus special-cases these three strings.
    if (raw === '+Inf' || raw === 'Inf' || raw === 'inf') { return Number.POSITIVE_INFINITY }
    if (raw === '-Inf') { return Number.NEGATIVE_INFINITY }
    if (raw === 'NaN' || raw === 'nan') { return Number.NaN }
    const n = parseFloat(raw)
    return Number.isFinite(n) || Number.isNaN(n) ? n : null
}

/**
 * Walk the labels block (contents BETWEEN the braces) and return the
 * key→value map. Values are quoted strings with `\\`, `\"`, `\n`
 * escapes per spec.
 */
function parseLabels (body: string): Record<string, string> {
    const labels: Record<string, string> = {}
    let i = 0
    while (i < body.length) {
        // Skip whitespace + commas between entries.
        while (i < body.length && (body[i] === ',' || body[i] === ' ' || body[i] === '\t')) { i += 1 }
        if (i >= body.length) { break }
        // Read key.
        const keyStart = i
        while (i < body.length && /[a-zA-Z0-9_]/.test(body[i])) { i += 1 }
        if (i === keyStart) { break }
        const key = body.slice(keyStart, i)
        // Skip = and optional whitespace.
        while (i < body.length && (body[i] === ' ' || body[i] === '\t')) { i += 1 }
        if (body[i] !== '=') { break }
        i += 1
        while (i < body.length && (body[i] === ' ' || body[i] === '\t')) { i += 1 }
        if (body[i] !== '"') { break }
        i += 1
        // Read quoted value with escapes.
        let value = ''
        while (i < body.length && body[i] !== '"') {
            if (body[i] === '\\' && i + 1 < body.length) {
                const next = body[i + 1]
                if (next === 'n') { value += '\n' } else if (next === '"') { value += '"' } else if (next === '\\') { value += '\\' } else { value += next }
                i += 2
            } else {
                value += body[i]
                i += 1
            }
        }
        if (body[i] !== '"') { break }
        i += 1
        labels[key] = value
    }
    return labels
}

function findMatchingBrace (line: string, openIdx: number): number {
    // Labels can contain `}` inside quoted values, so a dumb index-of
    // search would truncate those. Walk char-by-char honoring quote state.
    let i = openIdx + 1
    let inQuote = false
    while (i < line.length) {
        const ch = line[i]
        if (inQuote) {
            if (ch === '\\' && i + 1 < line.length) { i += 2; continue }
            if (ch === '"') { inQuote = false }
        } else {
            if (ch === '"') { inQuote = true } else if (ch === '}') { return i }
        }
        i += 1
    }
    return -1
}
