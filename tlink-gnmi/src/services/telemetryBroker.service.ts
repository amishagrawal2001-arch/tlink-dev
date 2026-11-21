import { Injectable } from '@angular/core'
import { EMPTY, Observable, Subject } from 'rxjs'
import { ProfilesService, TelemetryBroker, TelemetrySample, TelemetrySourceRef } from 'tlink-core'
import { GnmiProfile } from '../api'
import { GnmiService, GnmiSubscribeHandle } from './gnmi.service'

const DEFAULT_MODE = 'STREAM' as const
const DEFAULT_STREAM_MODE = 'SAMPLE' as const
const DEFAULT_INTERVAL_SEC = 10
const TEARDOWN_GRACE_MS = 500

interface StreamEntry {
    key: string
    handle: GnmiSubscribeHandle
    subject: Subject<TelemetrySample>
    /**
     * Sibling error channel — see `TelemetryBroker.observeErrors`.
     * Decoupled from `subject` so a transient gnmic error doesn't
     * terminate every observer's sample stream. A fatal error emits
     * here AND completes `subject`; a transient error emits here only.
     */
    errors: Subject<Error>
    refCount: number
    graceTimer: ReturnType<typeof setTimeout> | null
}

/**
 * gNMI implementation of TelemetryBroker. Ref-counts on the full
 * subscription identity `(profileId, path, mode, streamMode,
 * sampleIntervalSec)` because each distinct tuple maps to a distinct
 * `gnmic` subprocess. Two tiles on the same path at different
 * intervals legitimately spawn two subscriptions.
 *
 * M4.2b: added `observeErrors()` and reworked error forwarding so a
 * transient gnmic stderr line no longer terminates the sample
 * Observable (which would kill every tile + session-tab view of the
 * same key). Session tabs migrated to `observe()` in the same slice
 * so a live tab + a dashboard tile share one subprocess.
 */
@Injectable({ providedIn: 'root' })
export class GnmiTelemetryBroker implements TelemetryBroker {
    private readonly streams = new Map<string, StreamEntry>()

    constructor (
        private readonly gnmi: GnmiService,
        private readonly profiles: ProfilesService,
    ) { }

    observe (ref: TelemetrySourceRef, path: string): Observable<TelemetrySample> {
        return new Observable<TelemetrySample>(subscriber => {
            const entry = this.ensureEntry(ref, path)
            if (entry.graceTimer) {
                clearTimeout(entry.graceTimer)
                entry.graceTimer = null
            }
            entry.refCount += 1
            const inner = entry.subject.subscribe(subscriber)
            return () => {
                inner.unsubscribe()
                entry.refCount -= 1
                if (entry.refCount === 0) {
                    entry.graceTimer = setTimeout(() => {
                        if (entry.refCount === 0) {
                            entry.handle?.kill()
                            this.streams.delete(entry.key)
                        }
                    }, TEARDOWN_GRACE_MS)
                }
            }
        })
    }

    /**
     * Attach to an existing stream entry's error channel. Does NOT
     * spawn an entry on its own — a consumer must call `observe()`
     * first (as the session tab does synchronously inside
     * `startSubscription`). If no entry exists, returns an empty
     * Observable so no-op callers don't crash.
     */
    observeErrors (ref: TelemetrySourceRef, path: string): Observable<Error> {
        const key = buildKey(
            ref.profileId,
            path,
            ref.mode ?? DEFAULT_MODE,
            ref.streamMode ?? DEFAULT_STREAM_MODE,
            ref.sampleIntervalSec ?? DEFAULT_INTERVAL_SEC,
        )
        const entry = this.streams.get(key)
        if (!entry) { return EMPTY }
        return entry.errors.asObservable()
    }

    private ensureEntry (ref: TelemetrySourceRef, path: string): StreamEntry {
        const mode = ref.mode ?? DEFAULT_MODE
        const streamMode = ref.streamMode ?? DEFAULT_STREAM_MODE
        const intervalSec = ref.sampleIntervalSec ?? DEFAULT_INTERVAL_SEC
        const key = buildKey(ref.profileId, path, mode, streamMode, intervalSec)

        const existing = this.streams.get(key)
        if (existing) { return existing }

        const entry: StreamEntry = {
            key,
            handle: null as unknown as GnmiSubscribeHandle,
            subject: new Subject<TelemetrySample>(),
            errors: new Subject<Error>(),
            refCount: 0,
            graceTimer: null,
        }
        this.streams.set(key, entry)
        this.spawn(ref.profileId, path, mode, streamMode, intervalSec, entry)
            .catch(err => {
                const e = err instanceof Error ? err : new Error(String(err))
                entry.errors.next(e)
                entry.subject.complete()
                this.streams.delete(key)
            })
        return entry
    }

    private async spawn (
        profileId: string,
        path: string,
        mode: 'STREAM' | 'ONCE' | 'POLL',
        streamMode: 'TARGET_DEFINED' | 'ON_CHANGE' | 'SAMPLE',
        intervalSec: number,
        entry: StreamEntry,
    ): Promise<void> {
        const list = await this.profiles.getProfiles({ includeBuiltin: true })
        const found = list.find(p => p.id === profileId && p.type === 'gnmi') as GnmiProfile | undefined
        if (!found) {
            throw new Error(`gNMI profile not found: ${profileId}`)
        }
        const handle = this.gnmi.subscribe(found, {
            mode,
            subscriptions: [{
                path,
                streamMode: mode === 'STREAM' ? streamMode : undefined,
                sampleIntervalNs: mode === 'STREAM' && streamMode === 'SAMPLE'
                    ? intervalSec * 1_000_000_000
                    : undefined,
            }],
        })
        entry.handle = handle
        handle.on('notification', (n: { timestampNs: number; value: unknown; kind: 'update' | 'delete' }) => {
            entry.subject.next({ timestampNs: n.timestampNs, value: n.value, kind: n.kind })
        })
        handle.on('error', (err: Error & { transient?: boolean }) => {
            // Always forward to the sibling error channel so session
            // tabs can track transient-error counters AND surface fatal
            // errors. For fatal errors, also complete the sample
            // Observable so observers can distinguish stream-ended
            // from transient-hiccup.
            entry.errors.next(err)
            if (!err.transient) {
                entry.subject.complete()
                this.streams.delete(entry.key)
            }
        })
        handle.on('close', () => {
            entry.subject.complete()
            this.streams.delete(entry.key)
        })
    }
}

function buildKey (
    profileId: string,
    path: string,
    mode: string,
    streamMode: string,
    intervalSec: number,
): string {
    return `${profileId}|${path}|${mode}|${streamMode}|${intervalSec}`
}
