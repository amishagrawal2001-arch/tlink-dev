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
     * encodings, and gNMI version. Used by the path-autocomplete UI in
     * M2 and by the "Test connection" button in the target-profile
     * dialog.
     *
     * Not implemented in M1 — throws NotYetImplemented so callers get
     * a loud, greppable failure rather than a silent null.
     */
    async capabilities (target: GnmiProfile): Promise<GnmiCapabilities> {
        this.assertGnmicAvailable()
        // TODO(M2): spawn `gnmic -a host:port [tls flags] capabilities --format json`
        //           parse response into GnmiCapabilities.
        throw new Error(`GnmiService.capabilities not implemented (M2). Target: ${target.name}`)
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
     * Open a streaming Subscribe RPC. Returns an EventEmitter that
     * emits:
     *   - 'notification' (GnmiNotification) — one per Update/Delete
     *   - 'sync'                             — sync_response received
     *   - 'error' (Error)                    — fatal stream error
     *   - 'close'                            — stream closed cleanly
     *
     * Callers should retain the emitter and call `.kill()` (attached
     * to the returned object) to tear the stream down. Reconnect and
     * backoff live inside gnmic — we just watch its stdout.
     *
     * Not implemented in M1 — arrives in M2 (Subscribe).
     */
    subscribe (target: GnmiProfile, request: GnmiSubscribeRequest): GnmiSubscribeHandle {
        this.assertGnmicAvailable()
        // TODO(M2): spawn `gnmic -a host:port sub --path … --stream-mode … --format json`
        //           parse newline-delimited JSON into GnmiNotification.
        //           Attach reconnect/backoff observation.
        throw new Error(`GnmiService.subscribe not implemented (M2). Target: ${target.name}, ${request.subscriptions.length} subs`)
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
