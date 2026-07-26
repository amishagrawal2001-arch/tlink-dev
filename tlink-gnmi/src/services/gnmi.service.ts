import { Injectable } from '@angular/core'
import { EventEmitter } from 'events'
import * as childProcess from 'child_process'
import { LogService, Logger } from 'tlink-core'
import {
    GnmiCapabilities,
    GnmiNotification,
    GnmiProfile,
    GnmiSubscribeRequest,
} from '../api/interfaces'
import { GnmicDiscoveryService } from './gnmicDiscovery.service'

/**
 * Top-level façade over `gnmic` for the four gNMI RPCs the plugin
 * exposes: Capabilities, Get, Set, Subscribe.
 *
 * Design note — why child-process wrapping instead of pure JS gRPC:
 *   We ship gnmic (Apache-2.0) bundled per-platform under extras/gnmic/.
 *   gnmic already handles TLS/mTLS, JSON_IETF vs PROTO encoding
 *   quirks per vendor, reconnect/backoff, and target management.
 *   Reimplementing those in pure JS is ~5x the code with no user-
 *   visible benefit. See docs/code-graph.md for the deploy plan.
 *
 * This file is intentionally the SKELETON — actual JSON parsing and
 * error mapping arrive in M2 (Subscribe) and M3 (Get/Set).
 */
@Injectable({ providedIn: 'root' })
export class GnmiService {
    private logger: Logger

    constructor (
        log: LogService,
        private discovery: GnmicDiscoveryService,
    ) {
        this.logger = log.create('gnmi')
    }

    /**
     * Fetch the target's Capabilities response — supported YANG models,
     * encodings, and gNMI version. Used by the "Test connection" button
     * in the target-profile dialog and by the M2.2 path-autocomplete.
     *
     * The RPC is short-lived: we spawn `gnmic capabilities --format json`,
     * accumulate one JSON blob on stdout, and return once the process
     * exits. Timeout applied via the target's timeoutMs so a
     * mid-handshake TLS hang doesn't wedge the UI forever.
     */
    async capabilities (target: GnmiProfile): Promise<GnmiCapabilities> {
        this.assertGnmicAvailable()
        const args = [
            ...this.commonArgs(target),
            'capabilities',
            '--format', 'json',
        ]
        const raw = await this.runOneShot(args, target.options.timeoutMs ?? 10_000)
        return this.parseCapabilities(raw)
    }

    /**
     * Build the CLI flags every RPC needs — target address, credentials,
     * TLS mode, encoding, timeout. Kept centralized so a Set / Get /
     * Subscribe call in later milestones can't accidentally forget one.
     *
     * `includeEncoding=false` for Subscribe: some vendors advertise
     * JSON_IETF in Capabilities but silently emit nothing when you
     * actually ask for it on Subscribe (observed on Junos). Letting
     * gnmic + the device negotiate their default sidesteps the trap.
     * Capabilities and Get can safely honor the profile's encoding.
     */
    private commonArgs (target: GnmiProfile, includeEncoding = true): string[] {
        const o = target.options
        const args: string[] = []
        const port = o.port ? `:${o.port}` : ''
        args.push('-a', `${o.host}${port}`)
        if (o.username) { args.push('-u', o.username) }
        if (o.password) { args.push('-p', o.password) }
        if (includeEncoding) { args.push('-e', o.encoding ?? 'JSON_IETF') }
        args.push('--timeout', `${Math.max(1, Math.round((o.timeoutMs ?? 10_000) / 1000))}s`)

        switch (o.security) {
            case 'insecure':
                args.push('--insecure')
                break
            case 'skip-verify':
                args.push('--skip-verify')
                break
            case 'mtls':
                if (o.clientCertPath) { args.push('--cert', o.clientCertPath) }
                if (o.clientKeyPath) { args.push('--key', o.clientKeyPath) }
                if (o.caCertPath) { args.push('--tls-ca', o.caCertPath) }
                break
            case 'tls':
            default:
                if (o.caCertPath) { args.push('--tls-ca', o.caCertPath) }
                break
        }
        if (o.tlsServerName) { args.push('--tls-server-name', o.tlsServerName) }
        return args
    }

    /**
     * Run gnmic to completion and return whatever it wrote to stdout.
     * Used for one-shot RPCs (Capabilities, Get). Reject on non-zero
     * exit with the stderr tail so the UI can show the actual
     * reason (bad auth, cert mismatch, etc.) instead of "failed".
     */
    private runOneShot (args: string[], timeoutMs: number): Promise<string> {
        return new Promise((resolve, reject) => {
            let stdout = ''
            let stderr = ''
            const proc = this.spawnGnmic(
                args,
                line => { stdout += line + '\n' },
                line => { stderr += line + '\n' },
            )
            const timer = setTimeout(() => {
                proc.kill('SIGTERM')
                reject(new Error(`gnmic timed out after ${timeoutMs}ms`))
            }, timeoutMs)
            proc.on('exit', code => {
                clearTimeout(timer)
                if (code === 0) {
                    resolve(stdout.trim())
                } else {
                    const tail = stderr.trim().split('\n').slice(-4).join('\n')
                    reject(new Error(tail || `gnmic exited with code ${code}`))
                }
            })
            proc.on('error', err => {
                clearTimeout(timer)
                reject(err)
            })
        })
    }

    /**
     * Reshape gnmic's Capabilities JSON into GnmiCapabilities. gnmic
     * emits `{ supported_models: [{name, organization, version}], ...
     * supported_encodings: [...], gnmi_version: "..." }` — we normalize
     * casing / naming to match our interface.
     */
    private parseCapabilities (raw: string): GnmiCapabilities {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any = null
        try {
            parsed = JSON.parse(raw)
        } catch {
            throw new Error(`Capabilities response was not JSON: ${raw.slice(0, 200)}`)
        }
        // Some gnmic versions return a top-level array with one entry,
        // others return an object — accept both.
        const cap = Array.isArray(parsed) ? parsed[0] : parsed
        return {
            gnmiVersion: cap?.gnmi_version ?? cap?.gNMI_version ?? 'unknown',
            supportedModels: (cap?.supported_models ?? cap?.supportedModels ?? []).map((m: {
                name?: string; organization?: string; version?: string
            }) => ({
                name: m.name ?? '',
                organization: m.organization ?? '',
                version: m.version ?? '',
            })),
            supportedEncodings: (cap?.supported_encodings ?? cap?.supportedEncodings ?? []),
        }
    }

    /**
     * Snapshot one or more paths. Returns the notifications the target
     * emitted in a single Get response — no streaming.
     *
     * Not implemented in M1 — arrives in M3 (Get/Set).
     */
    async get (target: GnmiProfile, paths: string[]): Promise<GnmiNotification[]> {
        this.assertGnmicAvailable()
        // TODO(M3): spawn `gnmic -a host:port [tls flags] get --path <p1> --path <p2>`
        //           parse notifications.
        throw new Error(`GnmiService.get not implemented (M3). ${paths.length} paths requested for ${target.name}`)
    }

    /**
     * Apply a set of updates/replaces/deletes atomically per gNMI spec.
     * Arrives in M3 behind a per-target "writes enabled" gate — Set is
     * the highest-risk RPC (can brick production devices) and always
     * needs confirm-before-commit UX plus an audit log.
     */
    async set (
        target: GnmiProfile,
        _ops: unknown[],
    ): Promise<void> {
        this.assertGnmicAvailable()
        // TODO(M3): spawn `gnmic -a host:port set --update-path … --update-value …`
        //           enforce per-target "writes enabled" flag BEFORE spawn.
        throw new Error(`GnmiService.set not implemented (M3). Target: ${target.name}`)
    }

    /**
     * Open a streaming Subscribe RPC. Returns a handle that emits:
     *   - 'notification' (GnmiNotification) — one per Update/Delete
     *   - 'sync'                             — sync_response received
     *   - 'error' (Error)                    — fatal stream error
     *   - 'close' (code: number|null)        — subprocess exited
     *
     * Callers must retain the handle and call `.kill()` to tear the
     * stream down. gnmic handles reconnect/backoff internally when the
     * TCP connection drops — we surface those events through the
     * subprocess's stderr, which we tag onto the 'error' events with
     * a `transient:true` marker so the UI can distinguish "stream is
     * flaky" from "stream is dead."
     *
     * Uses `--format event` which gives us one JSON object per Update
     * — cleaner for a per-row stream table than raw gNMI Notifications
     * (which pack multiple Updates into one message and need unrolling).
     */
    subscribe (target: GnmiProfile, request: GnmiSubscribeRequest): GnmiSubscribeHandle {
        this.assertGnmicAvailable()
        if (!request.subscriptions.length) {
            throw new Error('subscribe: at least one subscription path is required')
        }

        const args = this.buildSubscribeArgs(target, request)
        const handle = new EventEmitter() as GnmiSubscribeHandle
        let killed = false

        // Per-subscription JSON document accumulator. gnmic --format json
        // emits one multi-line JSON object per notification, and
        // --format event emits multi-line arrays. In both cases we can't
        // parse line-by-line — we need to track brace/bracket depth
        // (respecting string literals + escapes) and hand a complete
        // document to the parser when depth returns to 0.
        let docBuf = ''
        let depth = 0
        let inString = false
        let escaping = false

        const feedChar = (ch: string): void => {
            // Skip leading whitespace when we're outside any document.
            if (depth === 0 && !docBuf.length && (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t')) {
                return
            }
            docBuf += ch
            if (escaping) { escaping = false; return }
            if (inString) {
                if (ch === '\\') {
                    escaping = true
                } else if (ch === '"') {
                    inString = false
                }
                return
            }
            if (ch === '"') { inString = true; return }
            if (ch === '{' || ch === '[') {
                depth += 1
            } else if (ch === '}' || ch === ']') {
                depth -= 1
                if (depth === 0) {
                    const doc = docBuf.trim()
                    docBuf = ''
                    if (doc) { this.handleSubscribeDoc(doc, handle, target.name) }
                }
                if (depth < 0) {
                    // Recover from a malformed prefix (e.g. gnmic banner
                    // text that included a stray closing brace). Reset
                    // so we don't lose subsequent good documents.
                    depth = 0
                    docBuf = ''
                }
            }
        }

        const proc = this.spawnGnmic(
            args,
            line => {
                // pipeLines strips \n; add a separator character back so
                // JSON that has `"key":\n"value"` still parses. The
                // accumulator collapses whitespace between top-level
                // documents naturally.
                for (const ch of line + '\n') { feedChar(ch) }
            },
            line => {
                // gnmic writes progress + errors to stderr. Treat lines
                // that look like errors as transient by default — the
                // subprocess will retry until it exits.
                if (line.trim()) {
                    handle.emit('error', Object.assign(new Error(line), { 'transient': true }))
                }
            },
        )

        proc.on('exit', code => {
            if (killed) { return }
            handle.emit('close', code)
        })
        proc.on('error', err => {
            if (killed) { return }
            handle.emit('error', err)
        })

        handle.kill = () => {
            if (killed) { return }
            killed = true
            try { proc.kill('SIGTERM') } catch { /* already gone */ }
        }

        return handle
    }

    /**
     * Turn a subscription request into the gnmic CLI args. Kept
     * separate so tests (or a "show me the command" debug UI) can
     * inspect what we're about to run without side effects.
     *
     * For the streaming case with one subscription we pass everything
     * as flat flags. Multi-subscription requests with per-path
     * sample intervals or stream-modes are represented by adding
     * multiple --path flags with the SAME parent mode — mixed-mode
     * subscribe would need `--config` YAML, which we can add later.
     */
    private buildSubscribeArgs (target: GnmiProfile, request: GnmiSubscribeRequest): string[] {
        const args = [
            ...this.commonArgs(target, false),
            'sub',
            // --format json emits one full JSON document per notification
            // (prefix + updates[] + optional deletes[]) — richer than
            // --format event and structurally the same across gnmic
            // versions. The doc accumulator in subscribe() reassembles
            // multi-line documents into complete objects.
            '--format', 'json',
            '--mode', request.mode.toLowerCase(),
        ]
        // Streaming needs a stream-mode and, for SAMPLE, an interval.
        const [firstSub] = request.subscriptions
        if (request.mode === 'STREAM') {
            const streamMode = firstSub.streamMode ?? 'TARGET_DEFINED'
            args.push('--stream-mode', streamMode.toLowerCase().replace('_', '-'))
            if (streamMode === 'SAMPLE') {
                const intervalSec = Math.max(1, Math.round((firstSub.sampleIntervalNs ?? 10_000_000_000) / 1_000_000_000))
                args.push('--sample-interval', `${intervalSec}s`)
            }
            if (firstSub.suppressRedundant) {
                args.push('--suppress-redundant')
            }
            if (firstSub.heartbeatIntervalNs) {
                const heartbeatSec = Math.max(1, Math.round(firstSub.heartbeatIntervalNs / 1_000_000_000))
                args.push('--heartbeat-interval', `${heartbeatSec}s`)
            }
        }
        if (request.updatesOnly) {
            args.push('--updates-only')
        }
        // One --path per subscription path.
        for (const sub of request.subscriptions) {
            args.push('--path', sub.path)
        }
        return args
    }

    /**
     * Parse one complete JSON document from gnmic --format json.
     * Handles both:
     *   1. `--format json` — one object per document:
     *      { source, subscription-name, timestamp, time, prefix,
     *        updates: [{Path, values: {…}}], deletes: [ "path", … ] }
     *   2. `--format event` fallback — an array of event objects, each
     *      with { timestamp, tags, values: {"/full/path": val}, deletes }.
     *      We keep this path because gnmic may still emit array-wrapped
     *      output when multiple events collapse into one snapshot, and
     *      external configs may set --format event anyway.
     *
     * Each Update becomes one 'notification' event (one row in the
     * UI's stream table). Each delete path becomes a 'notification'
     * with kind='delete'. sync_response tags emit a 'sync' event.
     *
     * Rich metadata (subscription-name, prefix, source) is preserved
     * only inside the event object today; a future iteration can
     * surface subscription-name to route rows to the correct sub in
     * the left pane when we multiplex.
     */
    private handleSubscribeDoc (doc: string, handle: GnmiSubscribeHandle, targetName: string): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any = null
        try {
            parsed = JSON.parse(doc)
        } catch {
            return
        }
        if (!parsed) { return }
        const events = Array.isArray(parsed) ? parsed : [parsed]
        for (const event of events) {
            this.emitEventNotifications(event, handle, targetName)
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private emitEventNotifications (event: any, handle: GnmiSubscribeHandle, targetName: string): void {
        if (!event || typeof event !== 'object') { return }

        // sync_response is variously tagged across formats.
        if (event.name === 'sync' || event.sync === true || event.tags?.event === 'sync') {
            handle.emit('sync')
            return
        }

        const ts = Number(event.timestamp) || Date.now() * 1_000_000

        // Shape A — `--format json` with prefix + updates[].
        if (Array.isArray(event.updates)) {
            const rawPrefix = String(event.prefix ?? '').replace(/^\/+/, '')
            const prefix = rawPrefix ? '/' + rawPrefix : ''
            for (const upd of event.updates) {
                // Prefer values entry keyed by upd.Path; fall back to
                // the first entry when the key doesn't match (some
                // Juniper builds emit the values map with a slightly
                // different key than Path).
                const values = upd?.values ?? {}
                const valueEntries = Object.entries(values)
                if (!valueEntries.length && upd?.val !== undefined) {
                    // Some gnmic versions emit `val` directly on the update.
                    const path = this.joinPath(prefix, upd.Path ?? upd.path ?? '')
                    handle.emit('notification', {
                        timestampNs: ts, path, value: upd.val,
                        kind: 'update', target: targetName,
                    } satisfies GnmiNotification)
                    continue
                }
                for (const [key, value] of valueEntries) {
                    // The values-map key may be a relative path repeat
                    // of upd.Path, or (rarely) a different sub-leaf.
                    // Trust upd.Path as the canonical path when present.
                    const path = this.joinPath(prefix, upd.Path ?? upd.path ?? key)
                    handle.emit('notification', {
                        timestampNs: ts, path, value,
                        kind: 'update', target: targetName,
                    } satisfies GnmiNotification)
                }
            }
        } else if (event.values && typeof event.values === 'object') {
            // Shape B — `--format event` with a flat values map keyed
            // by the fully-resolved path.
            for (const [path, value] of Object.entries(event.values)) {
                handle.emit('notification', {
                    timestampNs: ts, path, value,
                    kind: 'update', target: targetName,
                } satisfies GnmiNotification)
            }
        }

        // Deletes — shape is the same in both formats.
        if (Array.isArray(event.deletes)) {
            const rawPrefix = String(event.prefix ?? '').replace(/^\/+/, '')
            const prefix = rawPrefix ? '/' + rawPrefix : ''
            for (const p of event.deletes) {
                handle.emit('notification', {
                    timestampNs: ts,
                    path: this.joinPath(prefix, String(p)),
                    value: null,
                    kind: 'delete',
                    target: targetName,
                } satisfies GnmiNotification)
            }
        }
    }

    /**
     * Concatenate a prefix and a relative path with exactly one `/`
     * between them, tolerating leading/trailing slashes on either side.
     */
    private joinPath (prefix: string, rel: string): string {
        const p = prefix.replace(/\/+$/, '')
        const r = String(rel).replace(/^\/+/, '')
        if (!p) { return '/' + r }
        if (!r) { return p }
        return `${p}/${r}`
    }

    /**
     * Spawn `gnmic` with the given args, streaming stdout/stderr to
     * the provided callbacks. Kept as a protected utility so the
     * RPC-specific wrappers (capabilities/get/set/subscribe) added in
     * M2/M3 share one subprocess plumbing point instead of each
     * re-implementing spawn + line-buffered stdout.
     *
     * Not called from within GnmiService itself yet, but exposed to
     * subclasses / M2 implementations. Public for the same reason.
     */
    spawnGnmic (
        args: string[],
        onStdout: (line: string) => void,
        onStderr: (line: string) => void,
    ): childProcess.ChildProcess {
        const bin = this.discovery.getGnmicPath()
        if (!bin) {
            throw new Error('gnmic binary not found. Reinstall Tlink or `brew install gnmic`.')
        }
        this.logger.debug(`spawn ${bin} ${args.join(' ')}`)
        const proc = childProcess.spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        this.pipeLines(proc.stdout, onStdout)
        this.pipeLines(proc.stderr, onStderr)
        return proc
    }

    // eslint-disable-next-line no-undef
    private pipeLines (stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
        let buffer = ''
        stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8')
            let idx = buffer.indexOf('\n')
            while (idx >= 0) {
                onLine(buffer.slice(0, idx))
                buffer = buffer.slice(idx + 1)
                idx = buffer.indexOf('\n')
            }
        })
        stream.on('end', () => {
            if (buffer) { onLine(buffer) }
        })
    }

    private assertGnmicAvailable (): void {
        if (!this.discovery.getGnmicPath()) {
            throw new Error('gnmic binary not found. Reinstall Tlink or `brew install gnmic`.')
        }
    }
}

/**
 * Handle returned from GnmiService.subscribe() — a typed EventEmitter
 * plus a kill() teardown method. Exported so tab components can hold
 * a reference and stream events into their state.
 */
export interface GnmiSubscribeHandle extends EventEmitter {
    kill: () => void
}
